import { and, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  ListConversationMessagesParams,
  ListConversationMessagesResponse,
  ListConversationsResponse,
  SendConversationMessageBody,
  SendConversationMessageParams,
  SendConversationMessageResponse,
} from "@workspace/api-zod";
import {
  conversationMembersTable,
  conversationsTable,
  db,
  messagesTable,
  profilesTable,
} from "@workspace/db";
import {
  getCurrentProfile,
  hasBlockedEitherWay,
  toConversation,
  toMessage,
} from "../lib/social";

const router: IRouter = Router();

async function isMember(conversationId: number, profileId: number) {
  const [membership] = await db
    .select({ id: conversationMembersTable.id })
    .from(conversationMembersTable)
    .where(
      and(
        eq(conversationMembersTable.conversationId, conversationId),
        eq(conversationMembersTable.profileId, profileId),
      ),
    )
    .limit(1);
  return Boolean(membership);
}

router.get("/conversations", async (req, res): Promise<void> => {
  const current = await getCurrentProfile(req, res);
  if (!current) return;
  const memberships = await db
    .select({ conversationId: conversationMembersTable.conversationId })
    .from(conversationMembersTable)
    .where(eq(conversationMembersTable.profileId, current.id));
  const results = [];
  for (const { conversationId } of memberships) {
    const conversation = await toConversation(conversationId, current.id);
    if (conversation) results.push(conversation);
  }
  results.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  res.json(ListConversationsResponse.parse(results));
});

router.get(
  "/conversations/:conversationId/messages",
  async (req, res): Promise<void> => {
    const current = await getCurrentProfile(req, res);
    if (!current) return;
    const params = ListConversationMessagesParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!(await isMember(params.data.conversationId, current.id))) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const members = await db
      .select({ profileId: conversationMembersTable.profileId })
      .from(conversationMembersTable)
      .where(eq(conversationMembersTable.conversationId, params.data.conversationId));
    const other = members.find((member) => member.profileId !== current.id);
    if (other && (await hasBlockedEitherWay(current.id, other.profileId))) {
      res.status(403).json({ error: "This conversation is not available" });
      return;
    }
    const rows = await db
      .select({ message: messagesTable, sender: profilesTable })
      .from(messagesTable)
      .innerJoin(profilesTable, eq(messagesTable.senderId, profilesTable.id))
      .where(eq(messagesTable.conversationId, params.data.conversationId))
      .orderBy(messagesTable.createdAt)
      .limit(100);
    res.json(
      ListConversationMessagesResponse.parse(rows.map((row) => toMessage(row))),
    );
  },
);

router.post(
  "/conversations/:conversationId/messages",
  async (req, res): Promise<void> => {
    const current = await getCurrentProfile(req, res);
    if (!current) return;
    const params = SendConversationMessageParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = SendConversationMessageBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    if (!(await isMember(params.data.conversationId, current.id))) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const members = await db
      .select({ profileId: conversationMembersTable.profileId })
      .from(conversationMembersTable)
      .where(eq(conversationMembersTable.conversationId, params.data.conversationId));
    const other = members.find((member) => member.profileId !== current.id);
    if (other && (await hasBlockedEitherWay(current.id, other.profileId))) {
      res.status(403).json({ error: "This conversation is not available" });
      return;
    }
    const [message] = await db
      .insert(messagesTable)
      .values({
        conversationId: params.data.conversationId,
        senderId: current.id,
        text: body.data.text,
      })
      .returning();
    await db
      .update(conversationsTable)
      .set({ updatedAt: new Date() })
      .where(eq(conversationsTable.id, params.data.conversationId));
    res.status(201).json(
      SendConversationMessageResponse.parse({
        id: message.id,
        conversationId: message.conversationId,
        roomId: message.roomId,
        senderId: current.id,
        senderName: current.displayName,
        senderAvatarUrl: current.avatarUrl,
        text: message.text,
        createdAt: message.createdAt.toISOString(),
      }),
    );
  },
);

export default router;
