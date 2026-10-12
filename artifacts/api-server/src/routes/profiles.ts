import { getAuth } from "@clerk/express";
import { and, count, desc, eq, ilike, notInArray, or } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  BlockProfileBody,
  BlockProfileResponse,
  DiscoverProfilesQueryParams,
  DiscoverProfilesResponse,
  FindRandomMatchBody,
  FindRandomMatchResponse,
  GetMyProfileResponse,
  GetSocialSummaryResponse,
  ListBlockedProfilesResponse,
  ReportProfileBody,
  ReportProfileResponse,
  SaveMyProfileBody,
  SaveMyProfileResponse,
  StartConversationParams,
  StartConversationResponse,
  UnblockProfileParams,
  UnblockProfileResponse,
} from "@workspace/api-zod";
import {
  blockedProfilesTable,
  db,
  profilesTable,
  roomsTable,
  safetyReportsTable,
} from "@workspace/db";
import {
  ensureConversation,
  getCurrentProfile,
  getProfileIfSignedIn,
  hasBlockedEitherWay,
  toConversation,
  toProfile,
} from "../lib/social";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const [{ value: memberCount }] = await db
    .select({ value: count() })
    .from(profilesTable)
    .where(eq(profilesTable.isPublic, true));
  const [{ value: onlineCount }] = await db
    .select({ value: count() })
    .from(profilesTable)
    .where(and(eq(profilesTable.isPublic, true), eq(profilesTable.isOnline, true)));
  const [{ value: activeRoomCount }] = await db
    .select({ value: count() })
    .from(roomsTable)
    .where(eq(roomsTable.isActive, true));
  const featured = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.isPublic, true))
    .orderBy(desc(profilesTable.updatedAt))
    .limit(6);

  res.json(
    GetSocialSummaryResponse.parse({
      onlineCount,
      memberCount,
      activeRoomCount,
      featuredProfiles: featured.map(toProfile),
    }),
  );
});

router.get("/profiles/me", async (req, res): Promise<void> => {
  if (!getAuth(req).userId) {
    res.status(401).json({ error: "Sign-in required" });
    return;
  }
  const profile = await getProfileIfSignedIn(req);
  res.json(GetMyProfileResponse.parse({ profile: profile ? toProfile(profile) : null }));
});

router.put("/profiles/me", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign-in required" });
    return;
  }
  const parsed = SaveMyProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [profile] = await db
    .insert(profilesTable)
    .values({ ...parsed.data, clerkUserId: userId, isOnline: true })
    .onConflictDoUpdate({
      target: profilesTable.clerkUserId,
      set: { ...parsed.data, isOnline: true, updatedAt: new Date() },
    })
    .returning();
  res.json(SaveMyProfileResponse.parse(toProfile(profile)));
});

router.get("/profiles", async (req, res): Promise<void> => {
  const parsed = DiscoverProfilesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const current = await getProfileIfSignedIn(req);
  const { city, search, interest } = parsed.data;
  const filters = [eq(profilesTable.isPublic, true)];
  if (city) filters.push(eq(profilesTable.city, city));
  if (search?.trim()) {
    const pattern = `%${search.trim().slice(0, 80)}%`;
    filters.push(
      or(
        ilike(profilesTable.displayName, pattern),
        ilike(profilesTable.city, pattern),
        ilike(profilesTable.bio, pattern),
      )!,
    );
  }

  const blocked = current
    ? await db
        .select({ id: blockedProfilesTable.blockedId })
        .from(blockedProfilesTable)
        .where(eq(blockedProfilesTable.blockerId, current.id))
    : [];
  const reverseBlocks = current
    ? await db
        .select({ id: blockedProfilesTable.blockerId })
        .from(blockedProfilesTable)
        .where(eq(blockedProfilesTable.blockedId, current.id))
    : [];
  const excludedIds = [
    ...(current ? [current.id] : []),
    ...blocked.map((row) => row.id),
    ...reverseBlocks.map((row) => row.id),
  ];
  if (excludedIds.length) {
    filters.push(
      // Prevent users who have blocked each other from being discoverable.
      notInArray(profilesTable.id, excludedIds),
    );
  }

  let profiles = await db
    .select()
    .from(profilesTable)
    .where(and(...filters))
    .orderBy(desc(profilesTable.isOnline), desc(profilesTable.updatedAt))
    .limit(40);
  if (interest) {
    const needle = interest.toLowerCase();
    profiles = profiles.filter((profile) =>
      profile.interests.some((value) => value.toLowerCase() === needle),
    );
  }
  res.json(DiscoverProfilesResponse.parse(profiles.map(toProfile)));
});

router.post(
  "/profiles/:profileId/conversations",
  async (req, res): Promise<void> => {
    const current = await getCurrentProfile(req, res);
    if (!current) return;
    const params = StartConversationParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.profileId === current.id) {
      res.status(400).json({ error: "Cannot start a conversation with yourself" });
      return;
    }
    const [target] = await db
      .select()
      .from(profilesTable)
      .where(
        and(
          eq(profilesTable.id, params.data.profileId),
          eq(profilesTable.isPublic, true),
        ),
      )
      .limit(1);
    if (!target) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }
    if (await hasBlockedEitherWay(current.id, target.id)) {
      res.status(403).json({ error: "This conversation is not available" });
      return;
    }
    const conversation = await ensureConversation(current.id, target.id);
    const result = await toConversation(conversation.id, current.id);
    if (!result) {
      res.status(500).json({ error: "Unable to open conversation" });
      return;
    }
    res.json(StartConversationResponse.parse(result));
  },
);

router.post("/matches/random", async (req, res): Promise<void> => {
  const current = await getCurrentProfile(req, res);
  if (!current) return;
  const parsed = FindRandomMatchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const excluded = await db
    .select({ id: blockedProfilesTable.blockedId })
    .from(blockedProfilesTable)
    .where(eq(blockedProfilesTable.blockerId, current.id));
  const blockCurrent = await db
    .select({ id: blockedProfilesTable.blockerId })
    .from(blockedProfilesTable)
    .where(eq(blockedProfilesTable.blockedId, current.id));
  const excludedIds = new Set([
    current.id,
    ...excluded.map((row) => row.id),
    ...blockCurrent.map((row) => row.id),
  ]);
  const profiles = await db
    .select()
    .from(profilesTable)
    .where(
      and(
        eq(profilesTable.isPublic, true),
        eq(profilesTable.city, parsed.data.city || current.city),
      ),
    );
  const interests =
    parsed.data.interests.length > 0
      ? parsed.data.interests.map((item) => item.toLowerCase())
      : current.interests.map((item) => item.toLowerCase());
  const candidates = profiles.filter(
    (profile) =>
      !excludedIds.has(profile.id) &&
      profile.age >= 18 &&
      (interests.length === 0 ||
        profile.interests.some((value) => interests.includes(value.toLowerCase()))),
  );
  if (!candidates.length) {
    res.status(404).json({ error: "No eligible profiles found" });
    return;
  }

  const match = candidates[Math.floor(Math.random() * candidates.length)];
  const conversation = await ensureConversation(current.id, match.id);
  const conversationDto = await toConversation(conversation.id, current.id);
  if (!conversationDto) {
    res.status(500).json({ error: "Unable to open conversation" });
    return;
  }
  res.json(
    FindRandomMatchResponse.parse({
      profile: toProfile(match),
      conversation: conversationDto,
    }),
  );
});

router.get("/safety/blocks", async (req, res): Promise<void> => {
  const current = await getCurrentProfile(req, res);
  if (!current) return;
  const blocked = await db
    .select({ profile: profilesTable })
    .from(blockedProfilesTable)
    .innerJoin(
      profilesTable,
      eq(blockedProfilesTable.blockedId, profilesTable.id),
    )
    .where(eq(blockedProfilesTable.blockerId, current.id));
  res.json(
    ListBlockedProfilesResponse.parse(
      blocked.map((row) => toProfile(row.profile)),
    ),
  );
});

router.post("/safety/blocks", async (req, res): Promise<void> => {
  const current = await getCurrentProfile(req, res);
  if (!current) return;
  const parsed = BlockProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (parsed.data.profileId === current.id) {
    res.status(400).json({ error: "Cannot block your own profile" });
    return;
  }
  const [target] = await db
    .select({ id: profilesTable.id })
    .from(profilesTable)
    .where(eq(profilesTable.id, parsed.data.profileId))
    .limit(1);
  if (!target) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }
  await db
    .insert(blockedProfilesTable)
    .values({ blockerId: current.id, blockedId: target.id })
    .onConflictDoNothing();
  res.status(201).json(BlockProfileResponse.parse({ success: true }));
});

router.delete("/safety/blocks/:profileId", async (req, res): Promise<void> => {
  const current = await getCurrentProfile(req, res);
  if (!current) return;
  const params = UnblockProfileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db
    .delete(blockedProfilesTable)
    .where(
      and(
        eq(blockedProfilesTable.blockerId, current.id),
        eq(blockedProfilesTable.blockedId, params.data.profileId),
      ),
    );
  res.json(UnblockProfileResponse.parse({ success: true }));
});

router.post("/safety/reports", async (req, res): Promise<void> => {
  const current = await getCurrentProfile(req, res);
  if (!current) return;
  const parsed = ReportProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (parsed.data.profileId === current.id) {
    res.status(400).json({ error: "Cannot report your own profile" });
    return;
  }
  const [target] = await db
    .select({ id: profilesTable.id })
    .from(profilesTable)
    .where(eq(profilesTable.id, parsed.data.profileId))
    .limit(1);
  if (!target) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }
  await db.insert(safetyReportsTable).values({
    reporterId: current.id,
    reportedId: target.id,
    reason: parsed.data.reason,
    details: parsed.data.details,
  });
  res.status(201).json(ReportProfileResponse.parse({ success: true }));
});

export default router;
