import type { RateLimit } from "@app/shared/api";
import cors from "cors";
import type { RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { ApiError } from "./errors.ts";

/** Secure HTTP headers. The API only serves JSON, so the CSP can be maximally strict. */
export function securityHeaders(): RequestHandler {
  return helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: "same-site" },
    referrerPolicy: { policy: "no-referrer" },
  });
}

export function corsMiddleware(origins: string[]): RequestHandler {
  return cors({
    origin: (origin, cb) => cb(null, !origin || origins.includes(origin)),
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Idempotency-Key"],
    maxAge: 600,
  });
}

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);
/** The only endpoints that accept multipart/form-data (file uploads). */
const MULTIPART_PATHS = new Set(["/api/admin/uploads/images"]);

/**
 * CSRF protection for cookie-authenticated requests.
 * Cookies are SameSite=Lax; on top of that every state-changing request must
 *  1. come from an allowed Origin (browsers always send Origin on unsafe requests), and
 *  2. be JSON (a plain HTML form can't send application/json).
 * Provider webhooks are exempt (they authenticate with signatures instead).
 */
export function isUnsafeRequestAllowed(
  req: { method: string; path: string; headers: Record<string, string | string[] | undefined> },
  allowedOrigins: string[],
): { ok: true } | { ok: false; reason: string } {
  if (!UNSAFE.has(req.method)) return { ok: true };
  if (req.path.startsWith("/api/payments/webhook/")) return { ok: true };

  const origin = req.headers.origin;
  const site = req.headers["sec-fetch-site"];
  if (typeof origin === "string") {
    if (!allowedOrigins.includes(origin)) return { ok: false, reason: "Origin not allowed" };
  } else if (site === "cross-site") {
    return { ok: false, reason: "Cross-site request" };
  }

  const type = req.headers["content-type"];
  const hasBody = req.headers["content-length"] !== undefined && req.headers["content-length"] !== "0";
  const t = typeof type === "string" ? type.toLowerCase() : "";
  const allowedType =
    t.startsWith("application/json") || (MULTIPART_PATHS.has(req.path) && t.startsWith("multipart/form-data"));
  if (hasBody && !allowedType) {
    return { ok: false, reason: "Content-Type must be application/json" };
  }
  return { ok: true };
}

export function originGuard(allowedOrigins: string[]): RequestHandler {
  return (req, _res, next) => {
    const verdict = isUnsafeRequestAllowed(
      { method: req.method, path: req.originalUrl.split("?")[0] ?? "", headers: req.headers },
      allowedOrigins,
    );
    if (verdict.ok) return next();
    next(new ApiError(403, "FORBIDDEN_ORIGIN", verdict.reason));
  };
}

/**
 * Rate limiters (per IP, in memory). One API instance is assumed; when scaling
 * out, plug a shared store (e.g. Redis) into express-rate-limit.
 */
export function createRateLimiters(opts: { disabled?: boolean } = {}): Record<RateLimit | "global", RequestHandler> {
  const make = (limit: number, windowMs: number, code: string): RequestHandler =>
    opts.disabled
      ? (_req, _res, next) => next()
      : rateLimit({
          windowMs,
          limit,
          standardHeaders: "draft-8",
          legacyHeaders: false,
          handler: (_req, _res, next) =>
            next(new ApiError(429, code, "Too many requests. Please wait a moment and try again.")),
        });
  return {
    global: make(600, 60_000, "RATE_LIMITED"),
    default: (_req, _res, next) => next(),
    strict: make(30, 60_000, "RATE_LIMITED"),
    auth: make(10, 60_000, "TOO_MANY_LOGIN_ATTEMPTS"),
    booking: make(10, 3_600_000, "RATE_LIMITED"),
    codes: make(10, 60_000, "RATE_LIMITED"),
  };
}
