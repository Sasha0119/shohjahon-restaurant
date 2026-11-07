import { isIP } from "node:net";
import type { IncomingMessage } from "node:http";
import type { RequestHandler } from "express";
import { safeEqual } from "../auth/tokens.ts";

/** Sent by the web server's proxy (apps/web/src/lib/security-headers.ts). */
const CLIENT_IP_HEADER = "x-client-ip";
const PROXY_SECRET_HEADER = "x-internal-proxy-secret";

/**
 * Where the web server forwards requests to this API over the internet (e.g.
 * Render), the connection comes from the web server, so every visitor would
 * share one rate limit. The web server names the visitor instead, proving
 * itself with INTERNAL_PROXY_SECRET. Without the secret the header is ignored,
 * and both headers are removed so they never reach the logs.
 */
export function clientIpFromWebServer(secret: string | undefined): RequestHandler {
  return (req, _res, next) => {
    const given = req.headers[PROXY_SECRET_HEADER];
    const ip = req.headers[CLIENT_IP_HEADER];
    delete req.headers[PROXY_SECRET_HEADER];
    delete req.headers[CLIENT_IP_HEADER];
    if (secret && typeof given === "string" && safeEqual(given, secret) && typeof ip === "string" && isIP(ip)) {
      Object.defineProperty(req, "ip", { value: ip, configurable: true });
    }
    next();
  };
}

/** The connecting address for raw HTTP handlers (Socket.io), matching Express's `trust proxy` of one hop. */
export function connectionAddress(req: IncomingMessage, trustProxy: boolean): string {
  const forwarded = req.headers["x-forwarded-for"];
  const last = typeof forwarded === "string" ? forwarded.split(",").at(-1)?.trim() : undefined;
  return (trustProxy && last) || req.socket.remoteAddress || "unknown";
}

/** New connections allowed per address per minute. Generous: a whole restaurant can share one address. */
export const CONNECTION_LIMIT = { perMinute: 300, maxTrackedAddresses: 10_000 } as const;

export function createConnectionLimiter(now: () => number = Date.now) {
  const windows = new Map<string, { count: number; resetsAt: number }>();
  return (address: string): boolean => {
    const at = now();
    if (windows.size >= CONNECTION_LIMIT.maxTrackedAddresses) {
      for (const [key, w] of windows) if (w.resetsAt <= at) windows.delete(key);
    }
    const current = windows.get(address);
    if (!current || current.resetsAt <= at) {
      windows.set(address, { count: 1, resetsAt: at + 60_000 });
      return true;
    }
    current.count += 1;
    return current.count <= CONNECTION_LIMIT.perMinute;
  };
}
