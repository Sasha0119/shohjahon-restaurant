import { routes } from "@app/shared/api";
import { pino } from "pino";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { LOCKOUT, afterFailure, afterSuccess, isLocked } from "../src/auth/lockout.ts";
import { hashToken, newToken, safeEqual } from "../src/auth/tokens.ts";
import type { Db } from "../src/db.ts";
import { parseEnv } from "../src/env.ts";
import { createRecordingRealtime } from "../src/realtime/types.ts";
import { isUnsafeRequestAllowed } from "../src/http/security.ts";

const env = parseEnv({
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  CORS_ORIGINS: "http://localhost:3000",
  PUBLIC_WEB_URL: "http://localhost:3000",
  QR_TOKEN_SECRET: "q".repeat(40),
  COOKIE_SECRET: "c".repeat(40),
});
// A DB that must never be touched by these tests.
const noDb = new Proxy(
  {},
  {
    get: () => {
      throw new Error("DB should not be used");
    },
  },
) as unknown as Db;
const { app, mounted } = createApp({
  db: noDb,
  env,
  logger: pino({ level: "silent" }),
  realtime: createRecordingRealtime(),
  disableRateLimits: true,
});
const ORIGIN = "http://localhost:3000";

describe("lockout policy", () => {
  const now = new Date("2026-11-03T12:00:00Z");
  const fail = (n: number) => {
    let s = afterSuccess();
    for (let i = 0; i < n; i++) s = afterFailure(s, now);
    return s;
  };

  it("locks after 5 failures for 15 minutes", () => {
    expect(isLocked(fail(4), now)).toBe(false);
    const s = fail(5);
    expect(isLocked(s, now)).toBe(true);
    expect(s.lockedUntil!.getTime() - now.getTime()).toBe(LOCKOUT.baseMinutes * 60_000);
  });

  it("doubles the lock on further failures, capped at 24 h", () => {
    expect(fail(6).lockedUntil!.getTime() - now.getTime()).toBe(30 * 60_000);
    expect(fail(20).lockedUntil!.getTime() - now.getTime()).toBe(24 * 60 * 60_000);
  });

  it("unlocks when the time passes and resets on success", () => {
    const s = fail(5);
    expect(isLocked(s, new Date(s.lockedUntil!.getTime() + 1))).toBe(false);
    expect(afterSuccess()).toEqual({ failedLogins: 0, lockedUntil: null });
  });
});

describe("tokens", () => {
  it("are long, random and stored only as a hash", () => {
    const a = newToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newToken()).not.toBe(a);
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("CSRF origin guard", () => {
  const check = (method: string, headers: Record<string, string>, path = "/api/auth/login") =>
    isUnsafeRequestAllowed({ method, path, headers }, [ORIGIN]).ok;

  it("lets safe methods through", () => {
    expect(check("GET", { origin: "https://evil.example" })).toBe(true);
  });

  it("checks Origin on unsafe methods", () => {
    expect(check("POST", { origin: ORIGIN, "content-type": "application/json", "content-length": "2" })).toBe(true);
    expect(check("POST", { origin: "https://evil.example", "content-type": "application/json" })).toBe(false);
    expect(check("POST", { "sec-fetch-site": "cross-site" })).toBe(false);
  });

  it("requires JSON bodies (blocks HTML form posts)", () => {
    expect(
      check("POST", { origin: ORIGIN, "content-type": "application/x-www-form-urlencoded", "content-length": "9" }),
    ).toBe(false);
  });

  it("exempts payment webhooks", () => {
    expect(check("POST", { origin: "https://payments.example" }, "/api/payments/webhook/stripe")).toBe(true);
  });
});

describe("route table enforcement", () => {
  it("mounts exactly the routes of the phases built so far", () => {
    const expected = routes
      .filter((r) => r.phase <= 9)
      .map((r) => `${r.method} ${r.path}`)
      .sort();
    expect(mounted.map((r) => `${r.method} ${r.path}`).sort()).toEqual(expected);
  });

  it("rejects guest routes without a guest cookie", async () => {
    for (const r of mounted.filter((r) => r.access.kind === "guest")) {
      const res = await request(app)[r.method.toLowerCase() as "get"](r.path).set("Origin", ORIGIN).send({});
      expect(res.status, `${r.method} ${r.path}`).toBe(401);
      expect(res.body.error.code).toBe("NO_SESSION");
    }
  });

  it("rejects staff routes without a session", async () => {
    for (const r of mounted.filter((r) => r.access.kind === "staff")) {
      const path = r.path.replace(/:(\w+)/g, "x1");
      const res = await request(app)[r.method.toLowerCase() as "get"](path).set("Origin", ORIGIN).send({});
      expect(res.status, `${r.method} ${r.path}`).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    }
  });
});

describe("HTTP behaviour", () => {
  it("returns the standard error shape for unknown endpoints", async () => {
    const res = await request(app).get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "NOT_FOUND", message: "No such endpoint." } });
  });

  it("validates input before touching the database", async () => {
    const res = await request(app).post("/api/auth/login").set("Origin", ORIGIN).send({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toEqual(["email", "password"]);
  });

  it("rejects malformed JSON cleanly", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Origin", ORIGIN)
      .set("Content-Type", "application/json")
      .send("{bad");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_JSON");
  });

  it("blocks cross-origin writes", async () => {
    const res = await request(app).post("/api/auth/login").set("Origin", "https://evil.example").send({});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN_ORIGIN");
  });

  it("sends secure headers and no fingerprinting", async () => {
    const res = await request(app).get("/api/nope");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
  });

  it("allows CORS only for configured origins", async () => {
    const ok = await request(app)
      .options("/api/auth/me")
      .set("Origin", ORIGIN)
      .set("Access-Control-Request-Method", "GET");
    expect(ok.headers["access-control-allow-origin"]).toBe(ORIGIN);
    expect(ok.headers["access-control-allow-credentials"]).toBe("true");
    const bad = await request(app)
      .options("/api/auth/me")
      .set("Origin", "https://evil.example")
      .set("Access-Control-Request-Method", "GET");
    expect(bad.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("rate-limits logins when enabled", async () => {
    const limited = createApp({
      db: noDb,
      env,
      logger: pino({ level: "silent" }),
      realtime: createRecordingRealtime(),
    }).app;
    let last = 0;
    for (let i = 0; i < 11; i++) {
      last = (await request(limited).post("/api/auth/login").set("Origin", ORIGIN).send({})).status;
    }
    expect(last).toBe(429);
  });
});
