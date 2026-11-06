import { brand } from "@app/config";
import { RESERVATION_MINUTES, addDays, bookableTimes, reservationInstant, zonedDate } from "@app/shared";
import { pino } from "pino";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import type { Db } from "../src/db.ts";
import { parseEnv } from "../src/env.ts";
import { createRecordingRealtime } from "../src/realtime/types.ts";
import { createQrToken } from "../src/tables/qr-token.ts";
import { TEST_DATABASE_URL, TEST_MANAGER, TEST_PIN_STAFF, createTestDb, type TestDb } from "./helpers/test-db.ts";

const ORIGIN = "http://localhost:3000";
const QR_SECRET = "q".repeat(40);
const MINUTE = 60_000;

describe.skipIf(!TEST_DATABASE_URL)("reservations (integration)", () => {
  let t: TestDb;
  let db: Db;
  let app: ReturnType<typeof createApp>["app"];
  const realtime = createRecordingRealtime();

  // Tomorrow at the first offered time, so these tests don't depend on the clock or the demo hours.
  const date = addDays(zonedDate(new Date(), brand.timezone), 1);
  const time = bookableTimes(brand.openingHours, date)[0]!;
  let phoneCounter = 0;
  const book = (over: object = {}) =>
    request(app)
      .post("/api/reservations")
      .set("Origin", ORIGIN)
      .send({
        date,
        time,
        partySize: 2,
        name: "Dilshod",
        phone: `+99890${String(++phoneCounter).padStart(7, "0")}`,
        ...over,
      });

  const signIn = async (path: string, body: object) => {
    const res = await request(app).post(path).set("Origin", ORIGIN).send(body);
    return (res.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
  };
  const waiter = () => signIn("/api/auth/pin", { staffId: TEST_PIN_STAFF.waiter.id, pin: TEST_PIN_STAFF.waiter.pin });
  const kitchen = () =>
    signIn("/api/auth/pin", { staffId: TEST_PIN_STAFF.kitchen.id, pin: TEST_PIN_STAFF.kitchen.pin });
  const manager = () => signIn("/api/auth/login", TEST_MANAGER);

  const table = (number: number) => db.diningTable.findUniqueOrThrow({ where: { number } });
  const table_ = table;
  const join = async (number: number, body: object = {}) => {
    const tb = await table(number);
    return request(app)
      .post(`/api/tables/${createQrToken(QR_SECRET, tb.id, tb.qrVersion)}/join`)
      .set("Origin", ORIGIN)
      .send(body);
  };
  const reserveDirectly = async (number: number, minutesFromNow: number) =>
    db.reservation.create({
      data: {
        tableId: (await table(number)).id,
        startsAt: new Date(Date.now() + minutesFromNow * MINUTE),
        partySize: 2,
        guestName: "Malika",
        guestPhone: "+998901234567",
      },
    });

  beforeAll(async () => {
    t = await createTestDb();
    db = t.db;
    const env = parseEnv({
      DATABASE_URL: t.url,
      CORS_ORIGINS: ORIGIN,
      PUBLIC_WEB_URL: ORIGIN,
      QR_TOKEN_SECRET: QR_SECRET,
      COOKIE_SECRET: "c".repeat(40),
    });
    app = createApp({ db, env, logger: pino({ level: "silent" }), realtime, disableRateLimits: true }).app;
  }, 180_000);

  afterAll(async () => {
    await t?.cleanup();
  });

  beforeEach(async () => {
    await db.tableSession.updateMany({
      where: { status: "OPEN" },
      data: { status: "CLOSED", closedAt: new Date(), closeReason: "STAFF" },
    });
    await db.reservation.deleteMany();
    realtime.clear();
  });

  describe("booking", () => {
    it("gives the smallest table that fits, tells staff, and returns no personal data", async () => {
      const smallest = await db.diningTable.findFirstOrThrow({
        where: { active: true, seats: { gte: 2 } },
        orderBy: [{ seats: "asc" }, { number: "asc" }],
      });
      const res = await book().expect(201);
      expect(res.body.reservation.tableNumber).toBe(smallest.number);
      expect(JSON.stringify(res.body)).not.toContain("Dilshod");
      expect(realtime.events.map((e) => e.event)).toContain("table:status");
    });

    it("never double-books, even when every table is requested at once", async () => {
      const tables = await db.diningTable.count({ where: { active: true, seats: { gte: 2 } } });
      const results = await Promise.all(Array.from({ length: tables + 3 }, () => book()));
      const ok = results.filter((r) => r.status === 201);
      expect(ok).toHaveLength(tables);
      expect(new Set(ok.map((r) => r.body.reservation.tableNumber)).size).toBe(tables);
      const refused = results.filter((r) => r.status !== 201);
      expect(refused.map((r) => [r.status, r.body.error.code])).toEqual(Array(3).fill([409, "NO_TABLE_AVAILABLE"]));
    });

    it("lets a table be booked again once the first booking's two hours are over", async () => {
      const times = bookableTimes(brand.openingHours, date);
      const later = times[RESERVATION_MINUTES / 30]!;
      const first = await book({ partySize: 1 }).expect(201);
      const second = await book({ partySize: 1, time: later }).expect(201);
      expect(second.body.reservation.tableNumber).toBe(first.body.reservation.tableNumber);
    });

    it("gives a partly overlapping booking a different table", async () => {
      const times = bookableTimes(brand.openingHours, date);
      const first = await book({ partySize: 1, time: times[2] }).expect(201); // an hour after opening
      const earlier = await book({ partySize: 1, time: times[0] }).expect(201); // overlaps its start
      const later = await book({ partySize: 1, time: times[4] }).expect(201); // overlaps its end
      expect(earlier.body.reservation.tableNumber).not.toBe(first.body.reservation.tableNumber);
      expect(later.body.reservation.tableNumber).not.toBe(first.body.reservation.tableNumber);
    });

    it("skips tables that are too small, even when they are free", async () => {
      const seats = await db.diningTable.aggregate({ _max: { seats: true } });
      const res = await book({ partySize: seats._max.seats! }).expect(201);
      const table = await table_(res.body.reservation.tableNumber);
      expect(table.seats).toBeGreaterThanOrEqual(seats._max.seats!);
    });

    it("frees the table for the same time once a booking is cancelled", async () => {
      const first = await book({ partySize: 1 }).expect(201);
      const row = await db.reservation.findFirstOrThrow();
      await request(app)
        .post(`/api/waiter/reservations/${row.id}/cancel`)
        .set("Origin", ORIGIN)
        .set("Cookie", await waiter())
        .expect(200);
      const again = await book({ partySize: 1 }).expect(201);
      expect(again.body.reservation.tableNumber).toBe(first.body.reservation.tableNumber);
    });

    it("refuses a party no table can seat", async () => {
      const biggest = await db.diningTable.aggregate({ _max: { seats: true } });
      const res = await book({ partySize: biggest._max.seats! + 1 });
      expect([res.status, res.body.error.code]).toEqual([409, "NO_TABLE_AVAILABLE"]);
    });

    it("refuses a closed hour, the past and the far future", async () => {
      const today = zonedDate(new Date(), brand.timezone);
      for (const body of [{ time: "03:15" }, { date: addDays(today, -1) }, { date: addDays(today, 60) }]) {
        const res = await book(body);
        expect([res.status, res.body.error.code]).toEqual([422, "RESERVATION_TIME_INVALID"]);
      }
    });

    it("rejects bad names and phones", async () => {
      for (const body of [{ name: "" }, { phone: "abc" }, { phone: "123" }, { partySize: 0 }]) {
        expect((await book(body)).body.error.code).toBe("VALIDATION_ERROR");
      }
    });

    it("limits how many tables one phone number can hold, however it is typed", async () => {
      await book({ phone: "+998 90 111 22 33", partySize: 1 }).expect(201);
      await book({ phone: "+998901112233", partySize: 1 }).expect(201);
      await book({ phone: "+998 (90) 111-22-33", partySize: 1 }).expect(201);
      const res = await book({ phone: "+99890 1112233", partySize: 1 });
      expect([res.status, res.body.error.code]).toEqual([429, "TOO_MANY_RESERVATIONS"]);
    });

    it("doesn't promise a table someone is sitting at to a guest arriving soon", async () => {
      await reserveDirectly(1, 24 * 60 * 3); // unrelated, far away
      const tb = await table(1);
      await db.tableSession.create({ data: { tableId: tb.id, openedAt: new Date(), lastActivityAt: new Date() } });
      // Find an offered time within the next two hours, if the restaurant is open that soon.
      const today = zonedDate(new Date(), brand.timezone);
      const soon = bookableTimes(brand.openingHours, today).find((x) => {
        const at = reservationInstant(today, x, brand.timezone).getTime() - Date.now();
        return at > 35 * MINUTE && at < 110 * MINUTE;
      });
      if (!soon) return;
      const res = await book({ date: today, time: soon, partySize: 1 }).expect(201);
      expect(res.body.reservation.tableNumber).not.toBe(1);
    });
  });

  describe("staff screens", () => {
    it("shows the name, phone and time to waiters and managers only", async () => {
      await book({ name: "Dilshod", phone: "+998 90 555 66 77" }).expect(201);
      for (const cookie of [await waiter(), await manager()]) {
        const res = await request(app).get("/api/waiter/reservations").set("Cookie", cookie).expect(200);
        expect(res.body.reservations[0]).toMatchObject({
          guestName: "Dilshod",
          guestPhone: "+998905556677",
          partySize: 2,
        });
      }
      await request(app).get("/api/waiter/reservations").expect(401);
      await request(app)
        .get("/api/waiter/reservations")
        .set("Cookie", await kitchen())
        .expect(403);
    });

    it("marks the table as reserved on both table lists when it's within a day", async () => {
      const r = await reserveDirectly(2, 90);
      const expected = { startsAt: r.startsAt.toISOString(), partySize: 2, guestName: "Malika" };
      const floor = await request(app)
        .get("/api/waiter/tables")
        .set("Cookie", await waiter())
        .expect(200);
      expect(floor.body.tables.find((x: { number: number }) => x.number === 2).reservation).toEqual(expected);
      expect(floor.body.tables.find((x: { number: number }) => x.number === 3).reservation).toBeNull();
      const admin = await request(app)
        .get("/api/admin/tables")
        .set("Cookie", await manager())
        .expect(200);
      expect(admin.body.tables.find((x: { number: number }) => x.number === 2).reservation).toEqual(expected);
    });

    it("doesn't mark a table for a booking days away", async () => {
      await reserveDirectly(2, 3 * 24 * 60);
      const floor = await request(app)
        .get("/api/waiter/tables")
        .set("Cookie", await waiter())
        .expect(200);
      expect(floor.body.tables.find((x: { number: number }) => x.number === 2).reservation).toBeNull();
    });

    it("cancels once, audits it, and frees the table", async () => {
      const r = await reserveDirectly(2, 60);
      const cookie = await waiter();
      realtime.clear();
      await request(app)
        .post(`/api/waiter/reservations/${r.id}/cancel`)
        .set("Origin", ORIGIN)
        .set("Cookie", cookie)
        .expect(200);
      expect(realtime.events.map((e) => e.event)).toContain("table:status");
      const again = await request(app)
        .post(`/api/waiter/reservations/${r.id}/cancel`)
        .set("Origin", ORIGIN)
        .set("Cookie", cookie);
      expect([again.status, again.body.error.code]).toEqual([409, "ALREADY_CANCELLED"]);
      expect(await db.auditLog.count({ where: { action: "reservation.cancelled", entityId: r.id } })).toBe(1);
      expect((await request(app).get("/api/waiter/reservations").set("Cookie", cookie)).body.reservations).toEqual([]);
      await join(2).then((res) => expect(res.status).toBe(201));
    });
  });

  describe("scanning the QR code", () => {
    it("warns with the reserved time and opens no visit until the guest continues", async () => {
      const r = await reserveDirectly(4, 60);
      const res = await join(4);
      expect([res.status, res.body.error.code]).toEqual([409, "TABLE_RESERVED"]);
      expect(res.body.error.details).toEqual({ table: 4, startsAt: r.startsAt.toISOString() });
      expect(JSON.stringify(res.body)).not.toContain("Malika");
      const tb = await table(4);
      expect(await db.tableSession.count({ where: { tableId: tb.id, status: "OPEN" } })).toBe(0);

      const confirmed = await join(4, { confirmReserved: true });
      expect(confirmed.status).toBe(201);
      expect(await db.tableSession.count({ where: { tableId: tb.id, status: "OPEN" } })).toBe(1);
    });

    it("still warns just after the start time, until the hold lapses", async () => {
      await reserveDirectly(4, -10);
      expect((await join(4)).body.error.code).toBe("TABLE_RESERVED");
      await db.reservation.deleteMany();
      await reserveDirectly(4, -45);
      expect((await join(4)).status).toBe(201);
    });

    it("says nothing when the booking is hours away, cancelled, or on another table", async () => {
      await reserveDirectly(4, RESERVATION_MINUTES + 30);
      expect((await join(4)).status).toBe(201);
      const r = await reserveDirectly(5, 30);
      await db.reservation.update({ where: { id: r.id }, data: { status: "CANCELLED" } });
      expect((await join(5)).status).toBe(201);
      await reserveDirectly(6, 30);
      expect((await join(7)).status).toBe(201);
    });

    it("doesn't ask friends joining a table that is already open", async () => {
      await reserveDirectly(4, 60);
      await join(4, { confirmReserved: true }).then((res) => expect(res.status).toBe(201));
      const friend = await join(4);
      expect([friend.status, friend.body.error.code]).toEqual([409, "TABLE_OCCUPIED"]);
    });
  });
});
