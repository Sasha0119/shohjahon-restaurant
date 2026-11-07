import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { routes } from "@app/shared/api";
import { pino } from "pino";
import { io as connect, type Socket } from "socket.io-client";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import type { Db } from "../src/db.ts";
import { parseEnv } from "../src/env.ts";
import { createSocketServer, type IoServer } from "../src/realtime/socket.ts";
import type { Realtime } from "../src/realtime/types.ts";
import { JOIN_PIN_LIMIT, joinPinFor } from "../src/sessions/join-pin.ts";
import { buildSnapshot } from "../src/sessions/snapshot.ts";
import { createQrToken } from "../src/tables/qr-token.ts";
import { TEST_DATABASE_URL, TEST_MANAGER, TEST_PIN_STAFF, createTestDb, type TestDb } from "./helpers/test-db.ts";

const ORIGIN = "http://localhost:3000";
const QR = "q".repeat(40);

describe.skipIf(!TEST_DATABASE_URL)("authorization (integration)", () => {
  let t: TestDb;
  let db: Db;
  let server: Server;
  let io: IoServer;
  let realtime: Realtime;
  let url: string;
  const open: Socket[] = [];

  beforeAll(async () => {
    t = await createTestDb();
    db = t.db;
    const env = parseEnv({
      DATABASE_URL: t.url,
      CORS_ORIGINS: ORIGIN,
      PUBLIC_WEB_URL: ORIGIN,
      QR_TOKEN_SECRET: QR,
      COOKIE_SECRET: "c".repeat(40),
    });
    const logger = pino({ level: "silent" });
    let app: ReturnType<typeof createApp>["app"] | undefined;
    server = createServer((req, res) => app!(req, res));
    const sockets = createSocketServer(server, { db, env, logger });
    io = sockets.io;
    realtime = sockets.realtime;
    for (const number of [13, 14, 15]) await db.diningTable.create({ data: { number, seats: 4 } });
    app = createApp({ db, env, logger, realtime, disableRateLimits: true }).app;
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

  const cookieOf = (res: request.Response) => (res.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
  const as = (cookie: string) => ({
    get: (p: string) => request(url).get(p).set("Cookie", cookie),
    post: (p: string, body: object = {}, key?: string) => {
      const r = request(url).post(p).set("Origin", ORIGIN).set("Cookie", cookie);
      return (key ? r.set("Idempotency-Key", key) : r).send(body);
    },
    patch: (p: string, body: object = {}) =>
      request(url).patch(p).set("Origin", ORIGIN).set("Cookie", cookie).send(body),
    del: (p: string) => request(url).delete(p).set("Origin", ORIGIN).set("Cookie", cookie),
  });
  const tokenOf = async (n: number) => {
    const tb = await db.diningTable.findUniqueOrThrow({ where: { number: n } });
    return createQrToken(QR, tb.id, tb.qrVersion);
  };
  const join = async (n: number, body: object = {}, cookie = "") =>
    request(url)
      .post(`/api/tables/${await tokenOf(n)}/join`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send(body);
  const seat = async (n: number) => {
    const res = await join(n);
    expect(res.status).toBe(201);
    return { cookie: cookieOf(res), sessionId: res.body.snapshot.sessionId as string };
  };
  /** Seat a guest with one sent order. */
  const seatWithOrder = async (n: number) => {
    const g = await seat(n);
    await as(g.cookie).post("/api/session/cart", { itemId: "item-double-smash-burger", quantity: 1 });
    const { version } = (await as(g.cookie).get("/api/session")).body.snapshot;
    const sent = await as(g.cookie).post("/api/session/orders", { cartVersion: version }, randomUUID());
    expect(sent.status).toBe(201);
    return g;
  };
  const staffCookie = async (who: keyof typeof TEST_PIN_STAFF) => {
    const { id, pin } = TEST_PIN_STAFF[who];
    return cookieOf(await request(url).post("/api/auth/pin").set("Origin", ORIGIN).send({ staffId: id, pin }));
  };
  const managerCookie = async () =>
    cookieOf(await request(url).post("/api/auth/login").set("Origin", ORIGIN).send(TEST_MANAGER));
  const socketFor = async (cookie: string, opts: { auth?: object } = {}) => {
    const s = connect(url, { transports: ["websocket"], extraHeaders: { cookie }, reconnection: false, ...opts });
    open.push(s);
    await new Promise<void>((done, fail) => {
      s.once("connect", () => done());
      s.once("connect_error", fail);
    });
    return s;
  };
  const pause = (ms = 250) => new Promise((r) => setTimeout(r, ms));

  // ── every REST route, from the route table ──────────────────────────────────
  describe("staff routes", () => {
    const staffRoutes = routes.filter((r) => r.access.kind === "staff");
    const send = (cookie: string, r: (typeof routes)[number]) => {
      const path = r.path.replace(/:\w+/g, "x1");
      const req = request(url)[r.method.toLowerCase() as "get"](path).set("Origin", ORIGIN).set("Cookie", cookie);
      return r.method === "GET" ? req : req.send({});
    };

    it("covers every role on every route", async () => {
      expect(staffRoutes.length).toBeGreaterThan(30);
      const cookies = {
        manager: await managerCookie(),
        waiter: await staffCookie("waiter"),
        kitchen: await staffCookie("kitchen"),
      };
      for (const r of staffRoutes) {
        if (r.access.kind !== "staff" || r.path === "/api/auth/logout") continue;
        for (const [role, cookie] of Object.entries(cookies)) {
          const { status } = await send(cookie, r);
          const label = `${role} ${r.method} ${r.path}`;
          if (r.access.roles.includes(role as "manager")) expect([401, 403], label).not.toContain(status);
          else expect(status, label).toBe(403);
        }
      }
    }, 120_000);

    it("a guest cookie opens no staff route", async () => {
      const g = await seat(11);
      for (const r of staffRoutes) expect((await send(g.cookie, r)).status, `${r.method} ${r.path}`).toBe(401);
    }, 60_000);
  });

  // ── guests reach only their own table ───────────────────────────────────────
  describe("guest A can't reach table B (IDOR)", () => {
    it("can't change another table's cart", async () => {
      const a = await seat(1);
      const b = await seat(2);
      const added = await as(a.cookie).post("/api/session/cart", { itemId: "item-flat-white", quantity: 1 });
      const lineId = added.body.cart[0].id as string;

      expect((await as(b.cookie).patch(`/api/session/cart/${lineId}`, { quantity: 9 })).status).toBe(404);
      expect((await as(b.cookie).del(`/api/session/cart/${lineId}`)).status).toBe(404);
      const line = await db.cartItem.findUniqueOrThrow({ where: { id: lineId } });
      expect(line.quantity).toBe(1);
      expect((await as(b.cookie).get("/api/session")).body.snapshot.cart).toEqual([]);
    });

    it("can't read or cancel another table's orders, or pay for them", async () => {
      const a = await seatWithOrder(3);
      const b = await seatWithOrder(4);
      const order = await db.order.findFirstOrThrow({ where: { sessionId: a.sessionId }, include: { items: true } });

      expect((await as(b.cookie).post(`/api/session/orders/${order.id}/cancel`)).status).toBe(404);
      expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("RECEIVED");

      const seen = (await as(b.cookie).get("/api/session")).body.snapshot;
      expect(seen.sessionId).toBe(b.sessionId);
      expect(JSON.stringify(seen)).not.toContain(order.id);

      const billB = (await as(b.cookie).get("/api/session/bill")).body.bill;
      const pay = await as(b.cookie).post(
        "/api/session/payments",
        { splitMode: "items", method: "card", amountCents: billB.balanceCents, orderItemIds: [order.items[0]!.id] },
        randomUUID(),
      );
      expect(pay.status).toBe(400);
      expect(pay.body.error.code).toBe("UNKNOWN_ITEM");
      expect(await db.payment.count({ where: { sessionId: a.sessionId } })).toBe(0);
    });

    it("can't read another table's payment", async () => {
      const a = await seatWithOrder(5);
      const b = await seat(6);
      const { balanceCents } = (await as(a.cookie).get("/api/session/bill")).body.bill;
      const paid = await as(a.cookie).post(
        "/api/session/payments",
        { splitMode: "full", method: "cash", amountCents: balanceCents },
        randomUUID(),
      );
      expect(paid.status).toBe(201);
      const id = paid.body.payment.id as string;
      expect((await as(a.cookie).get(`/api/session/payments/${id}`)).status).toBe(200);
      expect((await as(b.cookie).get(`/api/session/payments/${id}`)).status).toBe(404);

      // Nor can staff settle it under the wrong table.
      const waiter = await staffCookie("waiter");
      const wrong = await as(waiter).post(`/api/waiter/sessions/${b.sessionId}/cash`, { paymentId: id });
      expect(wrong.status).toBe(404);
      expect((await db.payment.findUniqueOrThrow({ where: { id } })).status).toBe("PENDING");
    });

    it("gets no live events from another table", async () => {
      const a = await seat(7);
      const b = await seat(8);
      const socketB = await socketFor(b.cookie);
      const heard: string[] = [];
      socketB.onAny((event: string) => heard.push(event));
      const added = await as(a.cookie).post("/api/session/cart", { itemId: "item-flat-white", quantity: 1 });
      expect(added.status).toBe(201);
      await pause();
      expect(heard).toEqual([]);

      // Sync always answers about the caller's own visit, whatever is sent.
      const ack = await socketB.emitWithAck("session:sync", { version: -1, sessionId: a.sessionId });
      expect(ack.snapshot.sessionId).toBe(b.sessionId);
    });
  });

  // ── sockets ─────────────────────────────────────────────────────────────────
  describe("socket events", () => {
    it("only kitchen and managers can subscribe to kitchen tickets", async () => {
      const guest = await seat(9);
      const expected: [string, boolean][] = [
        [guest.cookie, false],
        [await staffCookie("waiter"), false],
        [await staffCookie("kitchen"), true],
        [await managerCookie(), true],
      ];
      for (const [cookie, ok] of expected) {
        const s = await socketFor(cookie);
        expect(await s.emitWithAck("kds:subscribe", { stations: ["kitchen"] })).toEqual({ ok });
      }
    });

    it("refuses a connection with no valid cookie", async () => {
      await expect(socketFor("")).rejects.toThrow();
      await expect(socketFor("staff_session=forged; guest_session=forged")).rejects.toThrow();
    });

    it("staff get no guest snapshot from session:sync", async () => {
      const s = await socketFor(await staffCookie("waiter"));
      expect(await s.emitWithAck("session:sync", { version: 0 })).toEqual({ ok: false, error: "NO_SESSION" });
    });

    it("closing a visit tells the guests, then drops their sockets and cookie", async () => {
      const g = await seat(10);
      const s = await socketFor(g.cookie);
      const closed = new Promise((done) => s.once("session:closed", done));
      const dropped = new Promise((done) => s.once("disconnect", done));
      expect((await as(await staffCookie("waiter")).post(`/api/waiter/sessions/${g.sessionId}/close`)).status).toBe(
        200,
      );
      await closed;
      expect(await dropped).toBe("io server disconnect");

      await expect(socketFor(g.cookie)).rejects.toThrow("SESSION_CLOSED");
      expect((await as(g.cookie).get("/api/session/bill")).status).toBe(410);
    });

    it("a revoked login gets no missed events by recovering its old connection", async () => {
      const waiterCookie = await staffCookie("waiter");
      const s = await socketFor(waiterCookie);
      const firstEvent = new Promise((done) => s.once("table:status", done));
      realtime.emit("waiters", "table:status", { tableId: "t", number: 1, status: "free" });
      await firstEvent; // the client now holds an offset it could resume from
      const { _pid: pid, _lastOffset: offset } = s as unknown as { _pid: string; _lastOffset: string };
      expect(pid && offset).toBeTruthy();
      s.io.engine.close(); // a dropped connection, kept for recovery on the server
      await pause();

      const { id } = TEST_PIN_STAFF.waiter;
      expect((await as(await managerCookie()).post(`/api/admin/staff/${id}/reset-pin`, { pin: "8246" })).status).toBe(
        200,
      );
      TEST_PIN_STAFF.waiter.pin = "8246";
      realtime.emit("waiters", "table:status", { tableId: "secret-table", number: 2, status: "free" });
      await pause();

      const raw = connect(url, {
        transports: ["websocket"],
        extraHeaders: { cookie: waiterCookie },
        reconnection: false,
        auth: { pid, offset },
        autoConnect: false,
      });
      open.push(raw);
      const packets: string[] = [];
      raw.io.on("packet", (p: unknown) => packets.push(JSON.stringify(p)));
      const refused = new Promise((done) => raw.once("connect_error", done));
      raw.connect();
      await refused;
      expect(packets.join()).not.toContain("secret-table");
    });
  });

  // ── joining a table ─────────────────────────────────────────────────────────
  describe("joining someone's table", () => {
    it("shows the PIN to managers, never to waiters", async () => {
      await seat(11).catch(() => null); // may already be seated by an earlier test
      const number = 11;
      const manager = (await as(await managerCookie()).get("/api/admin/tables")).body.tables;
      const open = manager.find((x: { number: number }) => x.number === number);
      expect(open.session.joinPin).toBe(joinPinFor(QR, open.session.id));

      const waiter = await as(await staffCookie("waiter")).get("/api/waiter/tables");
      expect(JSON.stringify(waiter.body)).not.toContain(open.session.joinPin);
    });

    it("needs the PIN shown to the people already there", async () => {
      const first = await join(12);
      expect(first.status).toBe(201);
      const { sessionId, joinPin } = first.body.snapshot;
      expect(joinPin).toBe(joinPinFor(QR, sessionId));
      expect(joinPin).toMatch(/^\d{6}$/);

      const noPin = await join(12);
      expect(noPin.status).toBe(409);
      expect(noPin.body.error.code).toBe("TABLE_OCCUPIED");
      expect(JSON.stringify(noPin.body)).not.toContain(joinPin);

      const wrong = joinPin === "000000" ? "000001" : "000000";
      const denied = await join(12, { joinPin: wrong });
      expect(denied.status).toBe(403);
      expect(denied.body.error.code).toBe("JOIN_PIN_WRONG");
      expect(denied.headers["set-cookie"]).toBeUndefined();
      const logged = await db.auditLog.findFirstOrThrow({
        where: { action: "session.join_pin_failed", entityId: sessionId },
      });
      expect(JSON.stringify(logged)).not.toContain(wrong);

      const friend = await join(12, { joinPin });
      expect(friend.status).toBe(201);
      expect(friend.body.snapshot.sessionId).toBe(sessionId);
    });

    it("doesn't ask someone already at the table again", async () => {
      const first = await seat(13);
      const again = await join(13, {}, first.cookie);
      expect(again.status).toBe(200);
      expect(again.body.rejoined).toBe(true);
    });

    it("locks joining after too many wrong PINs, from any device, even with the right one", async () => {
      const first = await join(14);
      const { sessionId, joinPin } = first.body.snapshot;
      const wrong = joinPin === "000000" ? "000001" : "000000";
      const tries = await Promise.all(
        Array.from({ length: JOIN_PIN_LIMIT.attempts + 3 }, () => join(14, { joinPin: wrong })),
      );
      expect(tries.filter((r) => r.status === 403)).toHaveLength(JOIN_PIN_LIMIT.attempts);
      expect(tries.filter((r) => r.status === 429)).toHaveLength(3);

      const locked = await join(14, { joinPin });
      expect(locked.status).toBe(429);
      expect(locked.body.error.code).toBe("JOIN_PIN_LOCKED");
      expect(await db.sessionGuest.count({ where: { sessionId } })).toBe(1);
    });

    it("gives each visit its own PIN, and none after it closes", async () => {
      const a = await join(15);
      const pin = a.body.snapshot.joinPin as string;
      const sessionId = a.body.snapshot.sessionId as string;
      const cookie = cookieOf(a);
      await as(await staffCookie("waiter")).post(`/api/waiter/sessions/${sessionId}/close`);

      const next = await join(15);
      expect(next.status).toBe(201);
      expect(next.body.snapshot.sessionId).not.toBe(sessionId);
      expect(next.body.snapshot.joinPin).toBe(joinPinFor(QR, next.body.snapshot.sessionId));
      expect(joinPinFor(QR, sessionId)).toBe(pin);

      expect((await as(cookie).get("/api/session/bill")).status).toBe(410);
      const guest = await db.sessionGuest.findFirstOrThrow({ where: { sessionId } });
      expect((await buildSnapshot(db, sessionId, guest.id, QR)).joinPin).toBeNull();
    });
  });
});
