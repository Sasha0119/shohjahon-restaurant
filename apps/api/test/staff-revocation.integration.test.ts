import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { pino } from "pino";
import { io as connect, type Socket } from "socket.io-client";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import type { Db } from "../src/db.ts";
import { parseEnv } from "../src/env.ts";
import { createSocketServer, type IoServer } from "../src/realtime/socket.ts";
import { TEST_DATABASE_URL, TEST_MANAGER, TEST_PIN_STAFF, createTestDb, type TestDb } from "./helpers/test-db.ts";

const ORIGIN = "http://localhost:3000";

/** Revoking a login must also cut the live socket, not just later HTTP requests. */
describe.skipIf(!TEST_DATABASE_URL)("staff session revocation (integration)", () => {
  let t: TestDb;
  let db: Db;
  let server: Server;
  let io: IoServer;
  let url: string;
  const open: Socket[] = [];

  beforeAll(async () => {
    t = await createTestDb();
    db = t.db;
    const env = parseEnv({
      DATABASE_URL: t.url,
      CORS_ORIGINS: ORIGIN,
      PUBLIC_WEB_URL: ORIGIN,
      QR_TOKEN_SECRET: "q".repeat(40),
      COOKIE_SECRET: "c".repeat(40),
    });
    const logger = pino({ level: "silent" });
    let app: ReturnType<typeof createApp>["app"] | undefined;
    server = createServer((req, res) => app!(req, res));
    const sockets = createSocketServer(server, { db, env, logger });
    io = sockets.io;
    app = createApp({ db, env, logger, realtime: sockets.realtime, disableRateLimits: true }).app;
    await new Promise<void>((done) => server.listen(0, done));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 180_000);

  afterEach(() => {
    open.splice(0).forEach((s) => s.close());
  });

  afterAll(async () => {
    await io?.close();
    await t?.cleanup();
  });

  const post = (path: string, cookie: string | undefined, body: object = {}) => {
    const r = request(url).post(path).set("Origin", ORIGIN);
    return (cookie ? r.set("Cookie", cookie) : r).send(body);
  };
  const cookieOf = (res: request.Response) => (res.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
  const manager = async () => cookieOf(await post("/api/auth/login", undefined, TEST_MANAGER));
  const staffLogin = async (who: keyof typeof TEST_PIN_STAFF) => {
    const { id, pin } = TEST_PIN_STAFF[who];
    const res = await post("/api/auth/pin", undefined, { staffId: id, pin });
    expect(res.status).toBe(200);
    return cookieOf(res);
  };

  const liveSocket = async (cookie: string) => {
    const s = connect(url, { transports: ["websocket"], extraHeaders: { cookie }, reconnection: false });
    open.push(s);
    await new Promise<void>((done, fail) => {
      s.once("connect", () => done());
      s.once("connect_error", fail);
    });
    return s;
  };
  const dropped = (s: Socket) =>
    new Promise<string>((done, fail) => {
      const timer = setTimeout(() => fail(new Error("socket stayed connected")), 5000);
      s.once("disconnect", (reason) => {
        clearTimeout(timer);
        done(reason);
      });
    });

  it("logout drops that login's socket", async () => {
    const cookie = await staffLogin("waiter");
    const s = await liveSocket(cookie);
    const gone = dropped(s);
    expect((await post("/api/auth/logout", cookie)).status).toBe(204);
    expect(await gone).toBe("io server disconnect");
  });

  it("logout leaves the person's other logins connected", async () => {
    const first = await staffLogin("waiter");
    const other = await liveSocket(await staffLogin("waiter"));
    await post("/api/auth/logout", first);
    await new Promise((r) => setTimeout(r, 200));
    expect(other.connected).toBe(true);
  });

  it("resetting a PIN drops the person's sockets immediately", async () => {
    const s = await liveSocket(await staffLogin("waiter"));
    const gone = dropped(s);
    const { id } = TEST_PIN_STAFF.waiter;
    expect((await post(`/api/admin/staff/${id}/reset-pin`, await manager(), { pin: "7391" })).status).toBe(200);
    TEST_PIN_STAFF.waiter.pin = "7391";
    expect(await gone).toBe("io server disconnect");
  });

  it("removing staff drops their sockets, and they can't reconnect", async () => {
    const cookie = await staffLogin("kitchen");
    const s = await liveSocket(cookie);
    const gone = dropped(s);
    const { id } = TEST_PIN_STAFF.kitchen;
    const res = await request(url)
      .patch(`/api/admin/staff/${id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", await manager())
      .send({ active: false });
    expect(res.status).toBe(200);
    expect(await gone).toBe("io server disconnect");
    await expect(liveSocket(cookie)).rejects.toThrow();
    await db.staff.update({ where: { id }, data: { active: true } });
  });

  it("a manager resetting their own password keeps their own socket", async () => {
    const cookie = await manager();
    const s = await liveSocket(cookie);
    const me = await db.staff.findUniqueOrThrow({ where: { email: TEST_MANAGER.email } });
    const res = await post(`/api/admin/staff/${me.id}/reset-password`, cookie, { password: TEST_MANAGER.password });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 200));
    expect(s.connected).toBe(true);
  });

  it("a socket doesn't outlive its login's expiry", async () => {
    const cookie = await staffLogin("waiter");
    const { id } = TEST_PIN_STAFF.waiter;
    await db.staffSession.updateMany({
      where: { staffId: id, revokedAt: null },
      data: { expiresAt: new Date(Date.now() + 500) },
    });
    const s = await liveSocket(cookie);
    expect(await dropped(s)).toBe("io server disconnect");
  });

  it("audits failed logins for unknown accounts without storing what was typed", async () => {
    const email = "nobody-here@example.org";
    const res = await post("/api/auth/login", undefined, { email, password: "wrong-password" });
    expect(res.status).toBe(401);
    const log = await db.auditLog.findFirst({
      where: { action: "staff.login_failed", entityId: "unknown" },
      orderBy: { createdAt: "desc" },
    });
    expect(log?.data).toEqual({ method: "password" });
    expect(JSON.stringify(log)).not.toContain(email);
  });
});
