import type { NextFunction, Request, Response } from "express";

export type RateLimiterOptions = {
  windowMs: number;
  max: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
};

const requestHits = new Map<string, number[]>();

export function createRateLimiter({
  windowMs,
  max,
  message = "Too many requests, please try again later.",
  keyGenerator,
}: RateLimiterOptions) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key =
      keyGenerator?.(req) ??
      req.ip ??
      req.headers["x-forwarded-for"] ??
      req.socket.remoteAddress ??
      "unknown";

    const now = Date.now();
    const prior = requestHits.get(key) ?? [];
    const recent = prior.filter((timestamp) => now - timestamp < windowMs);

    if (recent.length >= max) {
      res.status(429).json({ error: message });
      return;
    }

    recent.push(now);
    requestHits.set(key, recent);
    next();
  };
}

export function createOriginGuard(allowedOrigins: string[]) {
  const normalized = Array.from(
    new Set(
      allowedOrigins
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0)
        .map((origin) => origin.replace(/\/+$/, "")),
    ),
  );

  return {
    isAllowed(origin?: string): boolean {
      if (!origin) return true;
      const candidate = origin.replace(/\/+$/, "");
      try {
        const originURL = new URL(candidate);
        return normalized.includes(candidate) || normalized.includes(originURL.origin);
      } catch {
        return false;
      }
    },
  };
}
