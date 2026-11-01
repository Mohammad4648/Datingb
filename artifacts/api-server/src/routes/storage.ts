import { getAuth } from "@clerk/express";
import { Router, type IRouter, type Request, type Response } from "express";
import { RequestUploadUrlBody, RequestUploadUrlResponse } from "@workspace/api-zod";
import { getCurrentProfile } from "../lib/social";
import { ObjectNotFoundError, objectStorageService } from "../lib/objectStorage";
import { Readable } from "node:stream";

const router: IRouter = Router();
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function validateUploadMetadata(metadata: unknown): void {
  if (!metadata || typeof metadata !== "object") {
    throw new Error("Invalid upload metadata");
  }

  const payload = metadata as Record<string, unknown>;
  const size = typeof payload.size === "number" ? payload.size : undefined;
  const mimeType =
    typeof payload.mimeType === "string" ? payload.mimeType : undefined;
  const filename =
    typeof payload.filename === "string" ? payload.filename : undefined;

  if (size !== undefined && size > MAX_VIDEO_BYTES) {
    throw new Error("Video exceeds the 100 MB limit");
  }

  if (mimeType && !ALLOWED_UPLOAD_MIME_TYPES.has(mimeType)) {
    throw new Error("Unsupported file type");
  }

  if (filename) {
    const normalized = filename.replace(/\\/g, "/");
    if (
      normalized.includes("../") ||
      normalized.includes("..\\") ||
      normalized.startsWith("/") ||
      normalized.startsWith("~")
    ) {
      throw new Error("Invalid filename");
    }
  }
}

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

    try {
      validateUploadMetadata(parsed.data);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "Invalid upload metadata",
      });
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

      if (filePath.includes("../") || filePath.includes("..\\")) {
        res.status(400).json({ error: "Invalid object path" });
        return;
      }

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

    if (wildcardPath.includes("../") || wildcardPath.includes("..\\")) {
      res.status(400).json({ error: "Invalid object path" });
      return;
    }

    const objectPath = `/objects/${wildcardPath}`;

    if (!userId || !objectPath.startsWith(`/objects/uploads/${userId}/`)) {
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
