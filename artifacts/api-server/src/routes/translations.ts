import { getAuth } from "@clerk/express";
import { Router, type IRouter } from "express";
import {
  TranslateTextBody,
  TranslateTextResponse,
} from "@workspace/api-zod";
import { getCurrentProfile } from "../lib/social";

const router: IRouter = Router();
const RATE_LIMIT = 10;
const WINDOW_MS = 60_000;
const requestsByUser = new Map<string, { count: number; resetAt: number }>();
const targetLanguageNames = {
  ar: "Arabic",
  en: "English",
  ko: "Korean",
} as const;

router.post("/translations", async (req, res): Promise<void> => {
  const profile = await getCurrentProfile(req, res);
  if (!profile) return;

  const parsed = TranslateTextBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const text = parsed.data.text.trim();
  if (!text) {
    res.status(400).json({ error: "Message text cannot be empty" });
    return;
  }

  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign-in required" });
    return;
  }

  const now = Date.now();
  for (const [key, window] of requestsByUser) {
    if (window.resetAt <= now) requestsByUser.delete(key);
  }
  const window = requestsByUser.get(userId);
  if (window && window.resetAt > now && window.count >= RATE_LIMIT) {
    res.setHeader("Retry-After", String(Math.ceil((window.resetAt - now) / 1000)));
    res.status(429).json({ error: "Translation limit reached. Try again shortly." });
    return;
  }
  requestsByUser.set(
    userId,
    window && window.resetAt > now
      ? { ...window, count: window.count + 1 }
      : { count: 1, resetAt: now + WINDOW_MS },
  );

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "Translation is not configured" });
    return;
  }

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: `Translate the user's message into ${targetLanguageNames[parsed.data.targetLanguage]}. Preserve its meaning and tone. Do not answer the message or add commentary; output only the translation.`,
              },
            ],
          },
          contents: [{ role: "user", parts: [{ text }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );

    if (!response.ok) {
      req.log.error(
        { status: response.status },
        "Gemini translation request failed",
      );
      res.status(502).json({ error: "Translation provider is unavailable" });
      return;
    }

    const result = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    const translatedText = (result.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("")
      .trim();
    if (!translatedText) {
      res.status(502).json({ error: "No translation was returned" });
      return;
    }

    res.json(
      TranslateTextResponse.parse({
        translatedText,
        targetLanguage: parsed.data.targetLanguage,
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Gemini translation request failed");
    res.status(502).json({ error: "Translation provider is unavailable" });
  }
});

export default router;
