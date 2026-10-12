import { getAuth } from "@clerk/express";
import type { Request, Response } from "express";
import { and, desc, eq, ne } from "drizzle-orm";
import {
  blockedProfilesTable,
  conversationMembersTable,
  conversationsTable,
  db,
  messagesTable,
  profilesTable,
} from "@workspace/db";

export type SocialProfile = typeof profilesTable.$inferSelect;

export function toProfile(profile: SocialProfile) {
  return {
    id: profile.id,
    displayName: profile.displayName,
    age: profile.age,
    city: profile.city,
    bio: profile.bio,
    avatarUrl: profile.avatarUrl,
    languages: profile.languages,
    interests: profile.interests,
    isOnline: profile.isOnline,
    isPublic: profile.isPublic,
  };
}

export async function getCurrentProfile(
  req: Request,
  res: Response,
): Promise<SocialProfile | null> {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign-in required" });
    return null;
  }

  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.clerkUserId, userId))
    .limit(1);
  if (!profile) {
    res.status(409).json({ error: "Complete your profile first" });
    return null;
  }
  return profile;
}

export async function getProfileIfSignedIn(req: Request) {
  const userId = getAuth(req).userId;
  if (!userId) return null;
  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.clerkUserId, userId))
    .limit(1);
  return profile ?? null;
}

export async function hasBlockedEitherWay(
  currentProfileId: number,
  targetProfileId: number,
) {
  const [block] = await db
    .select({ id: blockedProfilesTable.id })
    .from(blockedProfilesTable)
    .where(
      and(
        ne(blockedProfilesTable.blockerId, blockedProfilesTable.blockedId),
        // Both directions are checked explicitly below to keep the query easy
        // to audit and avoid exposing blocked relationships to other users.
        eq(blockedProfilesTable.blockerId, currentProfileId),
        eq(blockedProfilesTable.blockedId, targetProfileId),
      ),
    )
    .limit(1);
  if (block) return true;
  const [reverseBlock] = await db
    .select({ id: blockedProfilesTable.id })
    .from(blockedProfilesTable)
    .where(
      and(
        eq(blockedProfilesTable.blockerId, targetProfileId),
        eq(blockedProfilesTable.blockedId, currentProfileId),
      ),
    )
    .limit(1);
  return Boolean(reverseBlock);
}

export async function ensureConversation(
  currentProfileId: number,
  targetProfileId: number,
) {
  const currentMemberships = await db
    .select({ conversationId: conversationMembersTable.conversationId })
    .from(conversationMembersTable)
    .where(eq(conversationMembersTable.profileId, currentProfileId));

  for (const membership of currentMemberships) {
    const [otherMember] = await db
      .select({ id: conversationMembersTable.id })
      .from(conversationMembersTable)
      .where(
        and(
          eq(
            conversationMembersTable.conversationId,
            membership.conversationId,
          ),
          eq(conversationMembersTable.profileId, targetProfileId),
        ),
      )
      .limit(1);
    if (otherMember) {
      const [conversation] = await db
        .select()
        .from(conversationsTable)
        .where(eq(conversationsTable.id, membership.conversationId))
        .limit(1);
      if (conversation) return conversation;
    }
  }

  return db.transaction(async (tx) => {
    const [conversation] = await tx
      .insert(conversationsTable)
      .values({})
      .returning();
    await tx.insert(conversationMembersTable).values([
      { conversationId: conversation.id, profileId: currentProfileId },
      { conversationId: conversation.id, profileId: targetProfileId },
    ]);
    return conversation;
  });
}

export async function toConversation(
  conversationId: number,
  currentProfileId: number,
) {
  const [partnerMember] = await db
    .select({ profileId: conversationMembersTable.profileId })
    .from(conversationMembersTable)
    .where(
      and(
        eq(conversationMembersTable.conversationId, conversationId),
        ne(conversationMembersTable.profileId, currentProfileId),
      ),
    )
    .limit(1);
  if (!partnerMember) return null;
  const [partner] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.id, partnerMember.profileId))
    .limit(1);
  const [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, conversationId))
    .limit(1);
  if (!partner || !conversation) return null;
  const [lastMessage] = await db
    .select({ text: messagesTable.text })
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conversationId))
    .orderBy(desc(messagesTable.createdAt))
    .limit(1);

  return {
    id: conversation.id,
    partner: toProfile(partner),
    lastMessage: lastMessage?.text ?? null,
    updatedAt: conversation.updatedAt.toISOString(),
    unreadCount: 0,
  };
}

export function toMessage(
  row: {
    message: typeof messagesTable.$inferSelect;
    sender: SocialProfile;
  },
) {
  return {
    id: row.message.id,
    conversationId: row.message.conversationId,
    roomId: row.message.roomId,
    senderId: row.message.senderId,
    senderName: row.sender.displayName,
    senderAvatarUrl: row.sender.avatarUrl,
    text: row.message.text,
    createdAt: row.message.createdAt.toISOString(),
  };
}
