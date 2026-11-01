import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import { createOriginGuard, createRateLimiter } from "./middlewares/security";

const app: Express = express();
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
].filter((value): value is string => Boolean(value && value.trim().length > 0));
const originGuard = createOriginGuard(allowedOrigins);

app.disable("x-powered-by");

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      if (!origin || originGuard.isAllowed(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-CSRF-Token",
      "X-XSRF-Token",
      "X-Requested-With",
    ],
    exposedHeaders: ["X-Request-Id"],
  }),
);
app.use(
  (req, res, next) => {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      next();
      return;
    }

    const origin = req.headers.origin;
    if (origin) {
      const isSameSite =
        typeof req.headers.host === "string" &&
        new URL(origin).host === req.headers.host;
      if (!isSameSite) {
        const csrfToken =
          req.headers["x-csrf-token"] ?? req.headers["x-xsrf-token"];
        if (!csrfToken) {
          res.status(403).json({ error: "Missing CSRF token" });
          return;
        }
      }
    }

    next();
  },
);
app.use(
  createRateLimiter({
    windowMs: 60_000,
    max: 200,
    message: "Too many requests, please try again later.",
  }),
);
app.use(
  "/api/storage",
  createRateLimiter({
    windowMs: 60_000,
    max: 20,
    message: "Upload rate limit exceeded. Please wait a moment.",
  }),
);
app.use(
  "/api/social-posts",
  createRateLimiter({
    windowMs: 60_000,
    max: 30,
    message: "Posting rate limit exceeded. Please wait a moment.",
  }),
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

export default app;
