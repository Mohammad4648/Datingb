import { getAuth } from "@clerk/express";
import { Router, type IRouter, type Request, type Response } from "express";
import { RequestUploadUrlBody, RequestUploadUrlResponse } from "@workspace/api-zod";
import { getCurrentProfile } from "../lib/social";
import { ObjectNotFoundError, objectStorageService } from "../lib/objectStorage";
import { Readable } from "node:stream";

const router: IRouter = Router();
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

router.post(
  "/storage/uploads/request-url",
  async (req: Request, res: Response): Promise<void> => {
    const profile = await getCurrentProfile(req, res);
    if (!profile) return;
    if (profile.age < 18) {
      res.status(403).json({ error: "Video uploads are available to adults only" });
      return;
    }

    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    if (parsed.data.size > MAX_VIDEO_BYTES) {
      res.status(413).json({ error: "Video exceeds the 100 MB limit" });
      return;
    }

    const userId = getAuth(req).userId;
    if (!userId) {
      res.status(401).json({ error: "Sign-in required" });
      return;
    }

    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL(userId);
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      res.json(
        RequestUploadUrlResponse.parse({
          uploadURL,
          objectPath,
          metadata: parsed.data,
        }),
      );
    } catch (error) {
      req.log.error({ err: error }, "Error generating video upload URL");
      res.status(500).json({ error: "Failed to create upload URL" });
    }
  },
);

router.get(
  "/storage/public-objects/*filePath",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const raw = req.params.filePath;
      const filePath = Array.isArray(raw) ? raw.join("/") : raw;
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      const response = await objectStorageService.downloadObject(file);
      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));
      if (!response.body) {
        res.end();
        return;
      }
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    } catch (error) {
      req.log.error({ err: error }, "Error serving public object");
      res.status(500).json({ error: "Failed to serve public object" });
    }
  },
);

router.get(
  "/storage/objects/*path",
  async (req: Request, res: Response): Promise<void> => {
    const profile = await getCurrentProfile(req, res);
    if (!profile) return;

    const userId = getAuth(req).userId;
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    if (
      !userId ||
      !objectPath.startsWith(`/objects/uploads/${userId}/`)
    ) {
      res.status(403).json({ error: "You cannot access this object" });
      return;
    }

    try {
      const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
      const response = await objectStorageService.downloadObject(objectFile, 300);
      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));
      if (!response.body) {
        res.end();
        return;
      }
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(404).json({ error: "Object not found" });
        return;
      }
      req.log.error({ err: error }, "Error serving private object");
      res.status(500).json({ error: "Failed to serve private object" });
    }
  },
);

export default router;
