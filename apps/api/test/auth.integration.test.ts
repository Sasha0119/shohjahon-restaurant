import { pino } from "pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import type { Db } from "../src/db.ts";
import { parseEnv } from "../src/env.ts";
import { createRecordingRealtime } from "../src/realtime/types.ts";
import { TEST_DATABASE_URL, TEST_MANAGER, TEST_PIN_STAFF, createTestDb, type TestDb } from "./helpers/test-db.ts";

const ORIGIN = "http://localhost:3000";

describe.skipIf(!TEST_DATABASE_URL)("staff auth & roles (integration)", () => {
  let t: TestDb;
  let db: Db;
  let app: ReturnType<typeof createApp>["app"];

  beforeAll(async () => {
    t = await createTestDb();
    db = t.db;
    const env = parseEnv({
      DATABASE_URL: t.url,
      CORS_ORIGINS: ORIGIN,
      PUBLIC_WEB_URL: ORIGIN,
      QR_TOKEN_SECRET: "q".repeat(40),
      COOKIE_SECRET: "c".repeat(40),
      STAFF_SESSION_HOURS: "12",
    });
    app = createApp({
      db,
      env,
      logger: pino({ level: "silent" }),
      realtime: createRecordingRealtime(),
      disableRateLimits: true,
    }).app;
  }, 180_000);

  afterAll(async () => {
    await t?.cleanup();
  });

  /** A cookie-keeping client, like a browser tab. */
  const agent = () => request.agent(app);
  const post = (a: ReturnType<typeof agent>, path: string, body: object = {}) =>
    a.post(path).set("Origin", ORIGIN).send(body);
  const managerAgent = async () => {
    const a = agent();
    const res = await post(a, "/api/auth/login", TEST_MANAGER);
    expect(res.status).toBe(200);
    return a;
  };
  const pinAgent = async (who: keyof typeof TEST_PIN_STAFF) => {
    const a = agent();
    const res = await post(a, "/api/auth/pin", { staffId: TEST_PIN_STAFF[who].id, pin: TEST_PIN_STAFF[who].pin });
    expect(res.status).toBe(200);
    return a;
  };

  it("health check reaches the database", async () => {
    const res = await request(app).get("/api/health");
    expect(res.body).toMatchObject({ status: "ok", db: "ok" });
  });

  describe("manager password login", () => {
    it("sets an httpOnly, SameSite=Lax session cookie and returns the profile", async () => {
      const res = await post(agent(), "/api/auth/login", TEST_MANAGER);
      expect(res.status).toBe(200);
      expect(res.body.staff).toMatchObject({ role: "manager", name: "Manager" });
      const cookie = res.headers["set-cookie"]![0]!;
      expect(cookie).toMatch(/^staff_session=[A-Za-z0-9_-]{43};/);
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Lax");
      // The DB stores only a hash, never the raw token.
      const raw = cookie.split(";")[0]!.split("=")[1]!;
      expect(await db.staffSession.count({ where: { tokenHash: raw } })).toBe(0);
    });

    it("accepts the email in any case", async () => {
      const res = await post(agent(), "/api/auth/login", { ...TEST_MANAGER, email: TEST_MANAGER.email.toUpperCase() });
      expect(res.status).toBe(200);
    });

    it("gives the same answer for a wrong password and an unknown email", async () => {
      const wrong = await post(agent(), "/api/auth/login", { ...TEST_MANAGER, password: "wrong-password-1" });
      const unknown = await post(agent(), "/api/auth/login", { email: "nobody@example.com", password: "whatever-123" });
      expect(wrong.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect(wrong.body).toEqual(unknown.body);
    });

    it("does not let PIN staff use password login", async () => {
      const res = await post(agent(), "/api/auth/login", { email: "x@example.com", password: "1234" });
      expect(res.status).toBe(401);
    });
  });

  describe("PIN login", () => {
    it("lists only active PIN staff, without secrets", async () => {
      const res = await request(app).get("/api/auth/pin-staff");
      expect(res.status).toBe(200);
      expect(res.body.staff.map((s: { role: string }) => s.role).sort()).toEqual(["kitchen", "waiter"]);
      expect(JSON.stringify(res.body)).not.toMatch(/hash|pin"|email/i);
    });

    it("signs in waiter and kitchen staff", async () => {
      const a = await pinAgent("waiter");
      const me = await a.get("/api/auth/me");
      expect(me.body.staff).toMatchObject({ id: TEST_PIN_STAFF.waiter.id, role: "waiter" });
    });

    it("rejects a manager id on the PIN endpoint", async () => {
      const manager = await db.staff.findFirstOrThrow({ where: { role: "MANAGER" } });
      const res = await post(agent(), "/api/auth/pin", { staffId: manager.id, pin: "1234" });
      expect(res.status).toBe(401);
    });
  });

  describe("lockout", () => {
    it("locks a PIN account after 5 wrong attempts, even with the right PIN after", async () => {
      const kitchen = TEST_PIN_STAFF.kitchen;
      for (let i = 0; i < 4; i++) {
        expect((await post(agent(), "/api/auth/pin", { staffId: kitchen.id, pin: "0000" })).status).toBe(401);
      }
      const fifth = await post(agent(), "/api/auth/pin", { staffId: kitchen.id, pin: "0000" });
      expect(fifth.status).toBe(423);
      expect(fifth.body.error.code).toBe("ACCOUNT_LOCKED");
      const right = await post(agent(), "/api/auth/pin", { staffId: kitchen.id, pin: kitchen.pin });
      expect(right.status).toBe(423);

      const logs = await db.auditLog.findMany({ where: { entityId: kitchen.id }, orderBy: { createdAt: "asc" } });
      expect(logs.map((l) => l.action)).toEqual([
        ...Array(4).fill("staff.login_failed"),
        "staff.locked",
        "staff.login_blocked",
      ]);
    });

    it("a manager's PIN reset unlocks the account and the new PIN works", async () => {
      const m = await managerAgent();
      const res = await post(m, `/api/admin/staff/${TEST_PIN_STAFF.kitchen.id}/reset-pin`, { pin: "8642" });
      expect(res.status).toBe(200);
      expect(res.body.staff.locked).toBe(false);
      expect((await post(agent(), "/api/auth/pin", { staffId: TEST_PIN_STAFF.kitchen.id, pin: "8642" })).status).toBe(
        200,
      );
      expect(
        (await post(agent(), "/api/auth/pin", { staffId: TEST_PIN_STAFF.kitchen.id, pin: TEST_PIN_STAFF.kitchen.pin }))
          .status,
      ).toBe(401);
      TEST_PIN_STAFF.kitchen.pin = "8642";
    });
  });

  describe("sessions", () => {
    it("logout revokes the session server-side", async () => {
      const a = await pinAgent("waiter");
      expect((await a.get("/api/auth/me")).status).toBe(200);
      expect((await post(a, "/api/auth/logout")).status).toBe(204);
      expect((await a.get("/api/auth/me")).status).toBe(401);
    });

    it("rejects forged and expired session cookies", async () => {
      const forged = await request(app).get("/api/auth/me").set("Cookie", "staff_session=forged-token");
      expect(forged.status).toBe(401);

      const a = await pinAgent("waiter");
      await db.staffSession.updateMany({
        where: { staffId: TEST_PIN_STAFF.waiter.id },
        data: { expiresAt: new Date(0) },
      });
      expect((await a.get("/api/auth/me")).status).toBe(401);
    });

    it("PIN reset signs the person out everywhere", async () => {
      const waiter = await pinAgent("waiter");
      const m = await managerAgent();
      await post(m, `/api/admin/staff/${TEST_PIN_STAFF.waiter.id}/reset-pin`, { pin: "5555" });
      expect((await waiter.get("/api/auth/me")).status).toBe(401);
      TEST_PIN_STAFF.waiter.pin = "5555";
    });

    it("deactivating someone signs them out and blocks login", async () => {
      const waiter = await pinAgent("waiter");
      const m = await managerAgent();
      const res = await m
        .patch(`/api/admin/staff/${TEST_PIN_STAFF.waiter.id}`)
        .set("Origin", ORIGIN)
        .send({ active: false });
      expect(res.body.staff.active).toBe(false);
      expect((await waiter.get("/api/auth/me")).status).toBe(401);
      expect(
        (await post(agent(), "/api/auth/pin", { staffId: TEST_PIN_STAFF.waiter.id, pin: TEST_PIN_STAFF.waiter.pin }))
          .status,
      ).toBe(401);
      await m.patch(`/api/admin/staff/${TEST_PIN_STAFF.waiter.id}`).set("Origin", ORIGIN).send({ active: true });
    });
  });

  describe("roles", () => {
    it("only managers reach admin routes", async () => {
      const waiter = await pinAgent("waiter");
      const kitchen = await pinAgent("kitchen");
      const m = await managerAgent();
      expect((await waiter.get("/api/admin/staff")).status).toBe(403);
      expect((await kitchen.get("/api/admin/staff")).status).toBe(403);
      expect((await m.get("/api/admin/staff")).status).toBe(200);
    });
  });

  describe("staff management", () => {
    it("creates staff of each role and they can sign in", async () => {
      const m = await managerAgent();
      const w = await post(m, "/api/admin/staff", { role: "waiter", name: "Riley", pin: "2468" });
      expect(w.status).toBe(201);
      expect(w.body.staff).toMatchObject({ name: "Riley", role: "waiter", active: true });
      expect((await post(agent(), "/api/auth/pin", { staffId: w.body.staff.id, pin: "2468" })).status).toBe(200);

      const mgr = await post(m, "/api/admin/staff", {
        role: "manager",
        name: "Jordan",
        email: "jordan@example.com",
        password: "another-test-password",
      });
      expect(mgr.status).toBe(201);
      expect(
        (await post(agent(), "/api/auth/login", { email: "jordan@example.com", password: "another-test-password" }))
          .status,
      ).toBe(200);
    });

    it("rejects a duplicate email with 409", async () => {
      const m = await managerAgent();
      const res = await post(m, "/api/admin/staff", {
        role: "manager",
        name: "Copy",
        email: TEST_MANAGER.email,
        password: "yet-another-password",
      });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("EMAIL_TAKEN");
    });

    it("never returns password or PIN hashes", async () => {
      const m = await managerAgent();
      const res = await m.get("/api/admin/staff");
      expect(JSON.stringify(res.body)).not.toMatch(/argon2|Hash/);
    });

    it("protects against locking the restaurant out", async () => {
      const m = await managerAgent();
      const me = (await m.get("/api/auth/me")).body.staff;
      const self = await m.patch(`/api/admin/staff/${me.id}`).set("Origin", ORIGIN).send({ active: false });
      expect(self.body.error.code).toBe("CANNOT_DEACTIVATE_SELF");
    });

    it("keeps the right credential type per role", async () => {
      const m = await managerAgent();
      const manager = await db.staff.findFirstOrThrow({ where: { email: TEST_MANAGER.email } });
      expect((await post(m, `/api/admin/staff/${manager.id}/reset-pin`, { pin: "1234" })).body.error.code).toBe(
        "WRONG_CREDENTIAL_TYPE",
      );
      expect(
        (await post(m, `/api/admin/staff/${TEST_PIN_STAFF.waiter.id}/reset-password`, { password: "abcdefghijk" })).body
          .error.code,
      ).toBe("WRONG_CREDENTIAL_TYPE");
    });

    it("resetting your own password keeps you signed in on this device only", async () => {
      const here = await managerAgent();
      const elsewhere = await managerAgent();
      const manager = await db.staff.findFirstOrThrow({ where: { email: TEST_MANAGER.email } });
      const res = await post(here, `/api/admin/staff/${manager.id}/reset-password`, {
        password: "brand-new-password-1",
      });
      expect(res.status).toBe(200);
      expect((await here.get("/api/auth/me")).status).toBe(200);
      expect((await elsewhere.get("/api/auth/me")).status).toBe(401);
      TEST_MANAGER.password = "brand-new-password-1";
    });

    it("audit-logs every admin action", async () => {
      const actions = (await db.auditLog.findMany({ select: { action: true } })).map((a) => a.action);
      for (const a of ["staff.created", "staff.updated", "staff.pin_reset", "staff.password_reset", "staff.login"]) {
        expect(actions).toContain(a);
      }
    });
  });
});
