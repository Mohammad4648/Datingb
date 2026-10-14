import { getAuth } from "@clerk/express";
import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateSocialPostBody,
  CreateSocialPostResponse,
  DeleteSocialPostParams,
  DeleteSocialPostResponse,
  GetPublicProfileParams,
  GetPublicProfileResponse,
  ListMySocialPostsResponse,
  ListProfileSocialPostsParams,
  ListProfileSocialPostsResponse,
  ListSocialPostFeedResponse,
} from "@workspace/api-zod";
import {
  db,
  profilesTable,
  socialPostsTable,
  type SocialPostRecord,
} from "@workspace/db";
import {
  getCurrentProfile,
  toProfile,
  type SocialProfile,
} from "../lib/social";
import {
  ObjectNotFoundError,
  objectStorageService,
} from "../lib/objectStorage";

const router: IRouter = Router();
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const allowedVideoTypes = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

async function serializePost(
  post: SocialPostRecord,
  profile: SocialProfile,
) {
  return {
    id: post.id,
    profileId: post.profileId,
    author: {
      id: profile.id,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      city: profile.city,
    },
    caption: post.caption,
    durationSeconds: post.durationSeconds,
    mediaUrl: await objectStorageService.getObjectEntityDownloadURL(
      post.objectPath,
    ),
    createdAt: post.createdAt,
  };
}

async function listProfilePosts(profileId: number, publicOnly: boolean) {
  const filters = [eq(socialPostsTable.profileId, profileId)];
  if (publicOnly) filters.push(eq(profilesTable.isPublic, true));

  const rows = await db
    .select({ post: socialPostsTable, profile: profilesTable })
    .from(socialPostsTable)
    .innerJoin(profilesTable, eq(socialPostsTable.profileId, profilesTable.id))
    .where(and(...filters))
    .orderBy(desc(socialPostsTable.createdAt))
    .limit(60);

  return Promise.all(rows.map(({ post, profile }) => serializePost(post, profile)));
}

async function listPublicFeed() {
  const rows = await db
    .select({ post: socialPostsTable, profile: profilesTable })
    .from(socialPostsTable)
    .innerJoin(profilesTable, eq(socialPostsTable.profileId, profilesTable.id))
    .where(eq(profilesTable.isPublic, true))
    .orderBy(desc(socialPostsTable.createdAt))
    .limit(60);

  return Promise.all(rows.map(({ post, profile }) => serializePost(post, profile)));
}

router.get("/profiles/:profileId", async (req, res): Promise<void> => {
  const params = GetPublicProfileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(
      and(
        eq(profilesTable.id, params.data.profileId),
        eq(profilesTable.isPublic, true),
      ),
    )
    .limit(1);
  if (!profile) {
    res.status(404).json({ error: "Public profile not found" });
    return;
  }
  res.json(GetPublicProfileResponse.parse(toProfile(profile)));
});

router.get("/profiles/me/posts", async (req, res): Promise<void> => {
  const profile = await getCurrentProfile(req, res);
  if (!profile) return;
  const posts = await listProfilePosts(profile.id, false);
  res.json(ListMySocialPostsResponse.parse(posts));
});

router.get("/profiles/:profileId/posts", async (req, res): Promise<void> => {
  const params = ListProfileSocialPostsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const posts = await listProfilePosts(params.data.profileId, true);
  res.json(ListProfileSocialPostsResponse.parse(posts));
});

router.get("/social-posts", async (_req, res): Promise<void> => {
  const posts = await listPublicFeed();
  res.json(ListSocialPostFeedResponse.parse(posts));
});

router.post("/social-posts", async (req, res): Promise<void> => {
  const profile = await getCurrentProfile(req, res);
  if (!profile) return;
  if (profile.age < 18) {
    res.status(403).json({ error: "Video posts are available to adults only" });
    return;
  }

  const parsed = CreateSocialPostBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = getAuth(req).userId;
  const ownedPrefix = userId ? `/objects/uploads/${userId}/` : "";
  if (
    !userId ||
    !parsed.data.objectPath.startsWith(ownedPrefix) ||
    !/^[0-9a-f-]{36}$/i.test(parsed.data.objectPath.slice(ownedPrefix.length))
  ) {
    res.status(403).json({ error: "Video upload does not belong to this account" });
    return;
  }

  try {
    const objectFile = await objectStorageService.getObjectEntityFile(
      parsed.data.objectPath,
    );
    const [metadata] = await objectFile.getMetadata();
    const contentType = String(metadata.contentType || "").toLowerCase();
    const size = Number(metadata.size || 0);
    if (!allowedVideoTypes.has(contentType) || size <= 0 || size > MAX_VIDEO_BYTES) {
      res.status(400).json({ error: "Uploaded file is not a supported video or exceeds 100 MB" });
      return;
    }

    const [post] = await db
      .insert(socialPostsTable)
      .values({
        profileId: profile.id,
        objectPath: parsed.data.objectPath,
        caption: parsed.data.caption,
        durationSeconds: parsed.data.durationSeconds,
      })
      .returning();
    res.status(201).json(
      CreateSocialPostResponse.parse(await serializePost(post, profile)),
    );
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(400).json({ error: "Uploaded video was not found" });
      return;
    }
    req.log.error({ err: error }, "Error publishing social video");
    res.status(500).json({ error: "Failed to publish video" });
  }
});

router.delete("/social-posts/:postId", async (req, res): Promise<void> => {
  const profile = await getCurrentProfile(req, res);
  if (!profile) return;
  const params = DeleteSocialPostParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [post] = await db
    .select()
    .from(socialPostsTable)
    .where(
      and(
        eq(socialPostsTable.id, params.data.postId),
        eq(socialPostsTable.profileId, profile.id),
      ),
    )
    .limit(1);
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  try {
    await objectStorageService.deleteObjectEntity(post.objectPath);
  } catch (error) {
    if (!(error instanceof ObjectNotFoundError)) {
      req.log.error({ err: error }, "Error deleting social video object");
      res.status(502).json({ error: "Could not remove the stored video" });
      return;
    }
  }
  await db.delete(socialPostsTable).where(eq(socialPostsTable.id, post.id));
  res.json(DeleteSocialPostResponse.parse({ success: true }));
});

export default router;
