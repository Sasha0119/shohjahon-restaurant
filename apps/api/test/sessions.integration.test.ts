import { joinPinFor } from "../src/sessions/join-pin.ts";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { pino } from "pino";
import { io as ioClient, type Socket } from "socket.io-client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import type { Db } from "../src/db.ts";
import { parseEnv } from "../src/env.ts";
import { createSocketServer, type IoServer } from "../src/realtime/socket.ts";
import { expireIdleSessions } from "../src/sessions/service.ts";
import { createQrToken } from "../src/tables/qr-token.ts";
import { TEST_DATABASE_URL, TEST_MANAGER, TEST_PIN_STAFF, createTestDb, type TestDb } from "./helpers/test-db.ts";

const ORIGIN = "http://localhost:3000";
const QR_SECRET = "q".repeat(40);

describe.skipIf(!TEST_DATABASE_URL)("table sessions & realtime (integration)", () => {
  let t: TestDb;
  let db: Db;
  let server: Server;
  let io: IoServer;
  let base: string;
  let realtime: ReturnType<typeof createSocketServer>["realtime"];
  const sockets: Socket[] = [];

  beforeAll(async () => {
    t = await createTestDb();
    db = t.db;
    const env = parseEnv({
      DATABASE_URL: t.url,
      CORS_ORIGINS: ORIGIN,
      PUBLIC_WEB_URL: ORIGIN,
      QR_TOKEN_SECRET: QR_SECRET,
      COOKIE_SECRET: "c".repeat(40),
      SESSION_IDLE_MINUTES: "120",
    });
    const logger = pino({ level: "silent" });
    // Same wiring as src/server.ts: Express is the request listener before Socket.io attaches.
    let app: ReturnType<typeof createApp>["app"] | undefined;
    server = createServer((req, res) => app!(req, res));
    ({ io, realtime } = createSocketServer(server, { db, env, logger }));
    app = createApp({ db, env, logger, realtime, disableRateLimits: true }).app;
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 180_000);

  afterAll(async () => {
    sockets.forEach((s) => s.close());
    await io?.close();
    await t?.cleanup();
  });

  // ── helpers ────────────────────────────────────────────────────────────────
  const cookieOf = (res: request.Response, prev = "") => {
    const set = (res.headers["set-cookie"] as unknown as string[] | undefined) ?? [];
    const jar = new Map(
      prev
        .split("; ")
        .filter(Boolean)
        .map((c) => c.split("=") as [string, string]),
    );
    for (const c of set) {
      const [kv] = c.split(";");
      const [k, v] = kv!.split("=") as [string, string];
      jar.set(k, v);
    }
    return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  };
  const tableToken = async (number: number) => {
    const tb = await db.diningTable.findUniqueOrThrow({ where: { number } });
    return createQrToken(QR_SECRET, tb.id, tb.qrVersion);
  };
  const join = (token: string, cookie = "", body: object = {}) =>
    request(server).post(`/api/tables/${token}/join`).set("Origin", ORIGIN).set("Cookie", cookie).send(body);
  const signIn = async (path: string, body: object) =>
    cookieOf(await request(server).post(path).set("Origin", ORIGIN).send(body));
  const connect = (cookie = "", transports: ("websocket" | "polling")[] = ["websocket"]) =>
    new Promise<Socket>((resolve, reject) => {
      const s = ioClient(base, {
        path: "/socket.io",
        transports,
        extraHeaders: cookie ? { cookie } : {},
        reconnection: false,
        forceNew: true,
      });
      sockets.push(s);
      s.once("connect", () => resolve(s));
      s.once("connect_error", (e) => reject(e));
    });
  const waitFor = <T = any>(s: Socket, event: string, pred: (p: T) => boolean = () => true) =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), 5000);
      const h = (p: T) => {
        if (!pred(p)) return;
        clearTimeout(timer);
        s.off(event, h);
        resolve(p);
      };
      s.on(event, h);
    });

  // ── tests ──────────────────────────────────────────────────────────────────
  let phoneA = "";
  let phoneB = "";
  let sessionId = "";

  it("first scan opens a session, sets an httpOnly guest cookie and tells the waiters", async () => {
    const waiter = await connect(
      await signIn("/api/auth/pin", { staffId: TEST_PIN_STAFF.waiter.id, pin: TEST_PIN_STAFF.waiter.pin }),
    );
    const seated = waitFor(waiter, "table:status", (p: { number: number }) => p.number === 1);

    const res = await join(await tableToken(1));
    expect(res.status).toBe(201);
    expect(res.body.rejoined).toBe(false);
    expect(res.body.snapshot).toMatchObject({ status: "open", table: { number: 1 }, guests: [{ nickname: "" }] });
    const set = (res.headers["set-cookie"] as unknown as string[])[0]!;
    expect(set).toMatch(/^guest_session=/);
    expect(set).toContain("HttpOnly");
    phoneA = cookieOf(res);
    sessionId = res.body.snapshot.sessionId;

    expect(await seated).toMatchObject({ number: 1, status: "seated" });
  });

  it("reloading or rescanning rejoins the same session", async () => {
    const res = await join(await tableToken(1), phoneA);
    expect(res.status).toBe(200);
    expect(res.body.rejoined).toBe(true);
    expect(res.body.snapshot.sessionId).toBe(sessionId);
  });

  it("a second phone needs the table's PIN to join an occupied table, then shares the session live", async () => {
    const socketA = await connect(phoneA);
    const first = await join(await tableToken(1));
    expect(first.status).toBe(409);
    expect(first.body.error).toMatchObject({ code: "TABLE_OCCUPIED", details: { table: 1, guestCount: 1 } });

    const guestsEvent = waitFor(socketA, "session:guests");
    expect((await join(await tableToken(1), "", { confirmJoin: true })).status).toBe(409);
    const res = await join(await tableToken(1), "", { joinPin: joinPinFor(QR_SECRET, sessionId) });
    expect(res.status).toBe(201);
    expect(res.body.snapshot.sessionId).toBe(sessionId);
    expect(res.body.snapshot.guests).toHaveLength(2);
    phoneB = cookieOf(res);
    expect((await guestsEvent).guests).toHaveLength(2);
  });

  it("nickname changes reach every phone with the next version", async () => {
    const socketB = await connect(phoneB);
    const before = (await request(server).get("/api/session").set("Cookie", phoneB)).body.snapshot.version;
    const evt = waitFor<{ version: number; guests: { nickname: string }[] }>(socketB, "session:guests");
    const res = await request(server)
      .patch("/api/session/me")
      .set("Origin", ORIGIN)
      .set("Cookie", phoneA)
      .send({ nickname: "  Sam " });
    expect(res.status).toBe(200);
    const p = await evt;
    expect(p.version).toBe(before + 1);
    expect(p.guests.map((g) => g.nickname)).toContain("Sam");
  });

  it("session:sync answers 'up to date' or sends a full snapshot", async () => {
    const s = await connect(phoneA);
    const { version } = (await request(server).get("/api/session").set("Cookie", phoneA)).body.snapshot;
    const same = await s.emitWithAck("session:sync", { version });
    expect(same).toEqual({ ok: true, upToDate: true, version });
    const behind = await s.emitWithAck("session:sync", { version: 0 });
    expect(behind.ok && !behind.upToDate && behind.snapshot.version).toBe(version);
  });

  it("scanning another table asks before switching", async () => {
    const res = await join(await tableToken(2), phoneA);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: "OTHER_TABLE", details: { currentTable: 1, newTable: 2 } });
    const moved = await join(await tableToken(2), phoneA, { confirmSwitch: true });
    expect(moved.status).toBe(201);
    expect(moved.body.snapshot.table.number).toBe(2);
    phoneA = cookieOf(moved, phoneA);
  });

  it("rejects forged, unknown and replaced QR codes", async () => {
    const good = await tableToken(3);
    expect((await join(good.slice(0, -2) + "xx")).body.error.code).toBe("INVALID_QR");
    expect((await join(createQrToken(QR_SECRET, "no-such-table", 1))).status).toBe(404);

    const manager = await signIn("/api/auth/login", TEST_MANAGER);
    const tb = await db.diningTable.findUniqueOrThrow({ where: { number: 3 } });
    const rotated = await request(server)
      .post(`/api/admin/tables/${tb.id}/rotate-qr`)
      .set("Origin", ORIGIN)
      .set("Cookie", manager);
    expect(rotated.status).toBe(200);
    const old = await join(good);
    expect(old.status).toBe(410);
    expect(old.body.error.code).toBe("QR_REPLACED");
    expect(rotated.body.table.url).toContain(await tableToken(3));
    expect((await join(await tableToken(3))).status).toBe(201);
  });

  it("refuses inactive tables", async () => {
    await db.diningTable.update({ where: { number: 4 }, data: { active: false } });
    expect((await join(await tableToken(4))).status).toBe(423);
  });

  it("staff closing a session notifies guests; the old link then starts a fresh session", async () => {
    const res = await join(await tableToken(5));
    const guest = cookieOf(res);
    const sid = res.body.snapshot.sessionId;
    const sock = await connect(guest);
    const closed = waitFor(sock, "session:closed");

    const waiter = await signIn("/api/auth/pin", { staffId: TEST_PIN_STAFF.waiter.id, pin: TEST_PIN_STAFF.waiter.pin });
    const close = await request(server)
      .post(`/api/waiter/sessions/${sid}/close`)
      .set("Origin", ORIGIN)
      .set("Cookie", waiter);
    expect(close.status).toBe(200);
    expect((await closed).reason).toBe("staff");

    const after = await request(server).get("/api/session").set("Cookie", guest);
    expect(after.status).toBe(410);
    expect(after.body.error).toMatchObject({ code: "SESSION_CLOSED", details: { reason: "staff" } });

    const again = await join(await tableToken(5), guest);
    expect(again.status).toBe(201);
    expect(again.body.snapshot.sessionId).not.toBe(sid);

    const twice = await request(server)
      .post(`/api/waiter/sessions/${sid}/close`)
      .set("Origin", ORIGIN)
      .set("Cookie", waiter);
    expect(twice.body.error.code).toBe("ALREADY_CLOSED");
    expect(await db.auditLog.count({ where: { action: "session.closed", entityId: sid } })).toBe(1);
  });

  it("idle sessions expire — unless something was ordered", async () => {
    const idle = await join(await tableToken(6));
    const idleCookie = cookieOf(idle);
    const busy = await join(await tableToken(7));
    const busyId = busy.body.snapshot.sessionId;
    await db.order.create({ data: { sessionId: busyId, round: 1, station: "KITCHEN" } });
    const threeHoursAgo = new Date(Date.now() - 3 * 3_600_000);
    await db.tableSession.updateMany({
      where: { id: { in: [idle.body.snapshot.sessionId, busyId] } },
      data: { lastActivityAt: threeHoursAgo },
    });

    // Lazily, on the next request…
    const res = await request(server).get("/api/session").set("Cookie", idleCookie);
    expect(res.status).toBe(410);
    expect(res.body.error.details.reason).toBe("expired");
    // …and by the background sweeper.
    await expireIdleSessions(db, realtime, 120);
    expect((await db.tableSession.findUniqueOrThrow({ where: { id: busyId } })).status).toBe("OPEN");
  });

  it("simultaneous first scans still create exactly one session, and the others need its PIN", async () => {
    const token = await tableToken(8);
    const results = await Promise.all(Array.from({ length: 6 }, () => join(token)));
    const opened = results.filter((r) => r.status === 201);
    expect(opened).toHaveLength(1);
    expect(results.filter((r) => r.status === 409).every((r) => r.body.error.code === "TABLE_OCCUPIED")).toBe(true);
    expect(await db.sessionGuest.count({ where: { sessionId: opened[0]!.body.snapshot.sessionId } })).toBe(1);
  });

  it("works over HTTP long-polling too (the fallback behind proxies)", async () => {
    const res = await join(await tableToken(10));
    const cookie = cookieOf(res);
    const s = await connect(cookie, ["polling"]);
    const ack = await s.emitWithAck("session:sync", { version: res.body.snapshot.version });
    expect(ack).toMatchObject({ ok: true, upToDate: true });
    const evt = waitFor(s, "session:guests");
    await request(server)
      .patch("/api/session/me")
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ nickname: "Poll" });
    expect((await evt).guests[0].nickname).toBe("Poll");
    // Plain API calls still reach Express while Socket.io is attached.
    expect((await request(server).get("/api/health")).status).toBe(200);
  });

  it("rejects sockets without a valid session", async () => {
    await expect(connect()).rejects.toThrow("NO_SESSION");
    const res = await join(await tableToken(9));
    const cookie = cookieOf(res);
    await db.tableSession.update({
      where: { id: res.body.snapshot.sessionId },
      data: { status: "CLOSED", closeReason: "STAFF" },
    });
    await expect(connect(cookie)).rejects.toThrow("SESSION_CLOSED");
  });

  describe("admin tables", () => {
    it("lists tables with status, guest count and signed link", async () => {
      const manager = await signIn("/api/auth/login", TEST_MANAGER);
      const res = await request(server).get("/api/admin/tables").set("Cookie", manager);
      expect(res.status).toBe(200);
      const t1 = res.body.tables.find((x: { number: number }) => x.number === 1);
      expect(t1.status).toBe("seated");
      expect(t1.session.guestCount).toBe(2);
      expect(t1.url).toBe(`${ORIGIN}/table/${await tableToken(1)}`);
      expect(res.body.tables.find((x: { number: number }) => x.number === 7).status).toBe("ordered");
    });

    it("serves a printable QR code that encodes the link", async () => {
      const manager = await signIn("/api/auth/login", TEST_MANAGER);
      const tb = await db.diningTable.findUniqueOrThrow({ where: { number: 1 } });
      const svg = await request(server).get(`/api/admin/tables/${tb.id}/qr`).set("Cookie", manager);
      expect(svg.headers["content-type"]).toContain("image/svg+xml");
      expect(String(svg.body ?? svg.text)).toContain("<svg");
      const png = await request(server).get(`/api/admin/tables/${tb.id}/qr?format=png&size=256`).set("Cookie", manager);
      expect(png.headers["content-type"]).toBe("image/png");
    });

    it("creates and edits tables, enforcing unique numbers", async () => {
      const manager = await signIn("/api/auth/login", TEST_MANAGER);
      const post = (body: object) =>
        request(server).post("/api/admin/tables").set("Origin", ORIGIN).set("Cookie", manager).send(body);
      const created = await post({ number: 20, label: "Terrace", seats: 6 });
      expect(created.status).toBe(201);
      expect(created.body.table).toMatchObject({ number: 20, label: "Terrace", status: "free" });
      expect((await post({ number: 20 })).body.error.code).toBe("TABLE_NUMBER_TAKEN");

      // Deactivating a table with guests closes their session.
      const g = await join(await tableToken(20));
      const put = await request(server)
        .put(`/api/admin/tables/${created.body.table.id}`)
        .set("Origin", ORIGIN)
        .set("Cookie", manager)
        .send({ number: 20, seats: 6, active: false });
      expect(put.body.table).toMatchObject({ active: false, status: "free" });
      expect((await request(server).get("/api/session").set("Cookie", cookieOf(g))).status).toBe(410);
    });

    it("is manager-only", async () => {
      const waiter = await signIn("/api/auth/pin", {
        staffId: TEST_PIN_STAFF.waiter.id,
        pin: TEST_PIN_STAFF.waiter.pin,
      });
      expect((await request(server).get("/api/admin/tables").set("Cookie", waiter)).status).toBe(403);
    });
  });
});
