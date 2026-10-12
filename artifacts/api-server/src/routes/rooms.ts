import { and, count, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateRoomBody,
  CreateRoomResponse,
  JoinRoomParams,
  JoinRoomResponse,
  LeaveRoomParams,
  LeaveRoomResponse,
  ListRoomMessagesParams,
  ListRoomMessagesResponse,
  ListRoomsQueryParams,
  ListRoomsResponse,
  SendRoomMessageBody,
  SendRoomMessageParams,
  SendRoomMessageResponse,
} from "@workspace/api-zod";
import {
  db,
  messagesTable,
  profilesTable,
  roomMembersTable,
  roomsTable,
} from "@workspace/db";
import { getCurrentProfile, getProfileIfSignedIn, toMessage } from "../lib/social";

const router: IRouter = Router();

async function roomResponse(roomId: number, currentProfileId?: number) {
  const [room] = await db
    .select()
    .from(roomsTable)
    .where(eq(roomsTable.id, roomId))
    .limit(1);
  if (!room) return null;
  const [{ value: memberCount }] = await db
    .select({ value: count() })
    .from(roomMembersTable)
    .where(eq(roomMembersTable.roomId, roomId));
  let isJoined = false;
  if (currentProfileId) {
    const [membership] = await db
      .select({ id: roomMembersTable.id })
      .from(roomMembersTable)
      .where(
        and(
          eq(roomMembersTable.roomId, roomId),
          eq(roomMembersTable.profileId, currentProfileId),
        ),
      )
      .limit(1);
    isJoined = Boolean(membership);
  }
  return {
    id: room.id,
    name: room.name,
    description: room.description,
    city: room.city,
    topic: room.topic,
    memberCount,
    isJoined,
  };
}

async function isMember(roomId: number, profileId: number) {
  const [membership] = await db
    .select({ id: roomMembersTable.id })
    .from(roomMembersTable)
    .where(and(eq(roomMembersTable.roomId, roomId), eq(roomMembersTable.profileId, profileId)))
    .limit(1);
  return Boolean(membership);
}

router.get("/rooms", async (req, res): Promise<void> => {
  const parsed = ListRoomsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const current = await getProfileIfSignedIn(req);
  const filters = [eq(roomsTable.isActive, true)];
  if (parsed.data.city) filters.push(eq(roomsTable.city, parsed.data.city));
  if (parsed.data.topic) filters.push(eq(roomsTable.topic, parsed.data.topic));
  const rooms = await db
    .select()
    .from(roomsTable)
    .where(and(...filters))
    .orderBy(desc(roomsTable.createdAt))
    .limit(60);
  const results = [];
  for (const room of rooms) {
    const response = await roomResponse(room.id, current?.id);
    if (response) results.push(response);
  }
  res.json(ListRoomsResponse.parse(results));
});

router.post("/rooms", async (req, res): Promise<void> => {
  const current = await getCurrentProfile(req, res);
  if (!current) return;
  const body = CreateRoomBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [room] = await db
    .insert(roomsTable)
    .values({ ...body.data, createdBy: current.id })
    .returning();
  await db.insert(roomMembersTable).values({ roomId: room.id, profileId: current.id });
  const response = await roomResponse(room.id, current.id);
  res.status(201).json(CreateRoomResponse.parse(response));
});

router.post("/rooms/:roomId/join", async (req, res): Promise<void> => {
  const current = await getCurrentProfile(req, res);
  if (!current) return;
  const params = JoinRoomParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [room] = await db
    .select({ id: roomsTable.id })
    .from(roomsTable)
    .where(and(eq(roomsTable.id, params.data.roomId), eq(roomsTable.isActive, true)))
    .limit(1);
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  await db
    .insert(roomMembersTable)
    .values({ roomId: room.id, profileId: current.id })
    .onConflictDoNothing();
  res.json(
    JoinRoomResponse.parse(await roomResponse(room.id, current.id)),
  );
});

router.post("/rooms/:roomId/leave", async (req, res): Promise<void> => {
  const current = await getCurrentProfile(req, res);
  if (!current) return;
  const params = LeaveRoomParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [room] = await db
    .select({ id: roomsTable.id })
    .from(roomsTable)
    .where(eq(roomsTable.id, params.data.roomId))
    .limit(1);
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  await db
    .delete(roomMembersTable)
    .where(
      and(
        eq(roomMembersTable.roomId, room.id),
        eq(roomMembersTable.profileId, current.id),
      ),
    );
  res.json(
    LeaveRoomResponse.parse(await roomResponse(room.id, current.id)),
  );
});

router.get("/rooms/:roomId/messages", async (req, res): Promise<void> => {
  const current = await getCurrentProfile(req, res);
  if (!current) return;
  const params = ListRoomMessagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await isMember(params.data.roomId, current.id))) {
    res.status(403).json({ error: "Join this room to read its messages" });
    return;
  }
  const rows = await db
    .select({ message: messagesTable, sender: profilesTable })
    .from(messagesTable)
    .innerJoin(profilesTable, eq(messagesTable.senderId, profilesTable.id))
    .where(eq(messagesTable.roomId, params.data.roomId))
    .orderBy(messagesTable.createdAt)
    .limit(100);
  res.json(ListRoomMessagesResponse.parse(rows.map((row) => toMessage(row))));
});

router.post("/rooms/:roomId/messages", async (req, res): Promise<void> => {
  const current = await getCurrentProfile(req, res);
  if (!current) return;
  const params = SendRoomMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = SendRoomMessageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  if (!(await isMember(params.data.roomId, current.id))) {
    res.status(403).json({ error: "Join this room to send messages" });
    return;
  }
  const [message] = await db
    .insert(messagesTable)
    .values({
      roomId: params.data.roomId,
      senderId: current.id,
      text: body.data.text,
    })
    .returning();
  res.status(201).json(
    SendRoomMessageResponse.parse({
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
});

export default router;
