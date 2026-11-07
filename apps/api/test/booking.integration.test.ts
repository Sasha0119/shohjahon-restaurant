import { randomUUID } from "node:crypto";
import { Writable } from "node:stream";
import { brand } from "@app/config";
import { addDays, bookableTimes, bookingRefund, reservationInstant, zonedDate } from "@app/shared";
import { pino } from "pino";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { createMockProvider, type PaymentProvider } from "../src/billing/provider.ts";
import type { Db } from "../src/db.ts";
import { parseEnv } from "../src/env.ts";
import { redactLinkTokens, safeForLogs } from "../src/http/errors.ts";
import { createRecordingRealtime } from "../src/realtime/types.ts";
import { sweepBookings } from "../src/reservations/booking.ts";
import { createQrToken } from "../src/tables/qr-token.ts";
import { TEST_DATABASE_URL, TEST_PIN_STAFF, createTestDb, type TestDb } from "./helpers/test-db.ts";

const ORIGIN = "http://localhost:3000";
const QR = "q".repeat(40);
const MINUTE = 60_000;
const ITEM = "item-flat-white";

describe("deposit and refund rules", () => {
  const start = new Date("2026-12-01T18:00:00Z");
  const before = (minutes: number) => new Date(start.getTime() - minutes * MINUTE);

  it("refunds 40% from exactly 2 hours before, then 20%, then nothing", () => {
    expect(bookingRefund(100_000, start, before(600))).toBe(40_000);
    expect(bookingRefund(100_000, start, before(120))).toBe(40_000);
    expect(bookingRefund(100_000, start, before(119))).toBe(20_000);
    expect(bookingRefund(100_000, start, before(1))).toBe(20_000);
    expect(bookingRefund(100_000, start, start)).toBe(0);
    expect(bookingRefund(100_000, start, before(-5))).toBe(0);
  });
});

describe("log safety", () => {
  it("hides link tokens", () => {
    expect(redactLinkTokens("/api/tables/abc.1.sig/join")).toBe("/api/tables/[hidden]/join");
    expect(redactLinkTokens("/api/receipts/abc")).toBe("/api/receipts/[hidden]");
    expect(redactLinkTokens("/api/reservations/manage/id.sig/cancel")).toBe("/api/reservations/manage/[hidden]/cancel");
    expect(redactLinkTokens("/api/menu")).toBe("/api/menu");
  });

  it("logs database errors without the values in the query", () => {
    const err = Object.assign(new Error("Invalid value: +998901234567"), {
      name: "PrismaClientValidationError",
      code: "P2000",
    });
    expect(JSON.stringify(safeForLogs(err))).not.toContain("+998");
  });

  it("never sends internal details to the client", async () => {
    const message = "secret database detail";
    const db = new Proxy(
      {},
      {
        get: () => {
          throw new Error(message);
        },
      },
    ) as unknown as Db;
    const env = parseEnv({
      DATABASE_URL: "postgresql://u:p@localhost:5432/db",
      CORS_ORIGINS: ORIGIN,
      PUBLIC_WEB_URL: ORIGIN,
      QR_TOKEN_SECRET: QR,
      COOKIE_SECRET: "c".repeat(40),
    });
    const { app } = createApp({ db, env, logger: pino({ level: "silent" }), realtime: createRecordingRealtime() });
    const res = await request(app).get("/api/menu");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: "INTERNAL", message: "Something went wrong. Please try again." } });
  });
});

describe.skipIf(!TEST_DATABASE_URL)("booking with dishes and a deposit (integration)", () => {
  let t: TestDb;
  let db: Db;
  let app: ReturnType<typeof createApp>["app"];
  const realtime = createRecordingRealtime();
  const logs: string[] = [];
  let charges: string[] = [];
  let refunds: { paymentId: string; amountCents: number }[] = [];
  let failRefunds = false;
  let provider: PaymentProvider;

  const date = addDays(zonedDate(new Date(), brand.timezone), 7);
  const time = bookableTimes(brand.openingHours, date)[0]!;
  let phoneCounter = 0;
  let price = 0;

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
    const mock = createMockProvider("w".repeat(40));
    provider = {
      name: "mock",
      parseWebhook: mock.parseWebhook,
      charge: (req) => {
        charges.push(req.paymentId);
        return mock.charge(req);
      },
      refund: async (req) => {
        if (failRefunds) throw new Error("provider down");
        refunds.push({ paymentId: req.paymentId, amountCents: req.amountCents });
      },
    };
    const stream = new Writable({
      write(chunk, _enc, done) {
        logs.push(String(chunk));
        done();
      },
    });
    app = createApp({
      db,
      env,
      logger: pino({ level: "info" }, stream),
      realtime,
      paymentProvider: provider,
      disableRateLimits: true,
    }).app;
    price = (await db.menuItem.findUniqueOrThrow({ where: { id: ITEM } })).priceCents;
  }, 180_000);

  afterAll(async () => {
    await t?.cleanup();
  });

  beforeEach(async () => {
    realtime.clear();
    charges = [];
    refunds = [];
    failRefunds = false;
    // Each test books the same time, so start with every table free.
    await db.reservation.updateMany({ where: { status: "ACTIVE" }, data: { status: "CANCELLED" } });
  });

  const book = (over: object = {}, key = randomUUID()) =>
    request(app)
      .post("/api/reservations")
      .set("Origin", ORIGIN)
      .set("Idempotency-Key", key)
      .send({
        date,
        time,
        partySize: 2,
        name: "Dilshod Karimov",
        phone: `+99890${String(++phoneCounter).padStart(7, "0")}`,
        method: "card",
        items: [{ itemId: ITEM, quantity: 2 }],
        ...over,
      });
  const booked = async (over: object = {}) => {
    const res = await book(over);
    expect(res.status).toBe(201);
    return res.body.reservation as { manageToken: string; depositCents: number; tableNumber: number };
  };
  const idOf = (token: string) => token.split(".")[0]!;
  /** Move a booking to this many minutes from now. */
  const moveTo = (id: string, minutes: number) =>
    db.reservation.update({ where: { id }, data: { startsAt: new Date(Date.now() + minutes * MINUTE) } });
  const manage = (token: string) => request(app).get(`/api/reservations/manage/${token}`);
  const cancel = (token: string) => request(app).post(`/api/reservations/manage/${token}/cancel`).set("Origin", ORIGIN);
  const cookieOf = (res: request.Response) => (res.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
  const waiter = async () =>
    cookieOf(
      await request(app)
        .post("/api/auth/pin")
        .set("Origin", ORIGIN)
        .send({ staffId: TEST_PIN_STAFF.waiter.id, pin: TEST_PIN_STAFF.waiter.pin }),
    );
  const kitchen = async () =>
    cookieOf(
      await request(app)
        .post("/api/auth/pin")
        .set("Origin", ORIGIN)
        .send({ staffId: TEST_PIN_STAFF.kitchen.id, pin: TEST_PIN_STAFF.kitchen.pin }),
    );

  describe("booking", () => {
    it("charges 50% of the dishes, priced by the server, whatever the client claims", async () => {
      const res = await book({ items: [{ itemId: ITEM, quantity: 2, unitPriceCents: 1 }], priceCents: 1 });
      expect(res.status).toBe(201);
      expect(res.body.reservation.dishesCents).toBe(price * 2);
      expect(res.body.reservation.depositCents).toBe(price);
      expect(charges).toHaveLength(1);
      const row = await db.reservationDeposit.findFirstOrThrow({
        where: { reservationId: idOf(res.body.reservation.manageToken) },
      });
      expect(row).toMatchObject({ status: "PAID", amountCents: price });
    });

    it("needs at least one dish", async () => {
      expect((await book({ items: [] })).status).toBe(400);
      expect((await book({ items: undefined })).status).toBe(400);
    });

    it("refuses a dish that doesn't exist, or is sold out", async () => {
      expect((await book({ items: [{ itemId: "item-nope", quantity: 1 }] })).status).toBe(409);
      await db.menuItem.update({ where: { id: ITEM }, data: { inStock: false } });
      const res = await book();
      await db.menuItem.update({ where: { id: ITEM }, data: { inStock: true } });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("OUT_OF_STOCK");
    });

    it("asks the guest to check again if the amount they saw is out of date", async () => {
      const res = await book({ expectedDepositCents: price + 1 });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("AMOUNT_CHANGED");
      expect(charges).toHaveLength(0);
    });

    it("never charges twice for a retried request", async () => {
      const key = randomUUID();
      const phone = "+998911112233";
      const first = await book({ phone }, key);
      const second = await book({ phone }, key);
      expect([first.status, second.status]).toEqual([201, 201]);
      expect(second.body.reservation.manageToken).toBe(first.body.reservation.manageToken);
      expect(await db.reservation.count({ where: { guestPhone: phone } })).toBe(1);
      expect(new Set(charges).size).toBe(1);
    });

    it("needs an idempotency key", async () => {
      const res = await request(app)
        .post("/api/reservations")
        .set("Origin", ORIGIN)
        .send({
          date,
          time,
          partySize: 2,
          name: "Dilshod",
          phone: "+998901110000",
          method: "card",
          items: [{ itemId: ITEM, quantity: 1 }],
        });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    });

    it("books no table when the payment fails, and frees it straight away", async () => {
      // The mock provider declines totals ending in 13: half of 226 is 113.
      const phone = "+998933334444";
      await db.menuItem.update({ where: { id: ITEM }, data: { priceCents: 226 } });
      const res = await book({ phone, items: [{ itemId: ITEM, quantity: 1 }] });
      await db.menuItem.update({ where: { id: ITEM }, data: { priceCents: price } });
      expect(res.status).toBe(402);
      expect(res.body.error.code).toBe("BOOKING_PAYMENT_FAILED");
      expect((await db.reservation.findFirstOrThrow({ where: { guestPhone: phone } })).status).toBe("CANCELLED");
    });

    it("keeps the phone and booking link out of the logs", async () => {
      const phone = "+998977778888";
      const { manageToken } = await booked({ phone });
      await manage(manageToken);
      const all = logs.join("");
      expect(all).toContain("/api/reservations");
      expect(all).not.toContain(phone);
      expect(all).not.toContain(manageToken);
      expect(all).not.toContain("Dilshod");
    });
  });

  describe("kitchen", () => {
    it("is told at booking time, without the guest's name or phone", async () => {
      await booked();
      const event = realtime.events.find((e) => e.event === "kds:booking");
      expect(event?.payload).toMatchObject({ change: "new" });
      expect(event?.rooms).toContain("kds:bar");
      expect(JSON.stringify(event)).not.toMatch(/Dilshod|\+99890/);

      const res = await request(app)
        .get("/api/kds/bookings")
        .set("Cookie", await kitchen());
      expect(res.status).toBe(200);
      expect(res.body.bookings[0].lines[0]).toMatchObject({ itemId: ITEM, quantity: 2 });
      expect(JSON.stringify(res.body)).not.toMatch(/Dilshod|\+99890/);
    });

    it("gets one start-cooking alert, 30 minutes before arrival", async () => {
      const { manageToken } = await booked();
      const id = idOf(manageToken);
      const cookAlerts = () => realtime.events.filter((e) => (e.payload as { change?: string }).change === "cook");

      await moveTo(id, 31);
      await sweepBookings(db, realtime, provider, 90);
      expect(cookAlerts()).toHaveLength(0);

      await moveTo(id, 30);
      await sweepBookings(db, realtime, provider, 90);
      expect(cookAlerts()).toHaveLength(1);

      await sweepBookings(db, realtime, provider, 90);
      expect(cookAlerts()).toHaveLength(1);
    });

    it("gets no alert for a cancelled booking", async () => {
      const { manageToken } = await booked();
      const id = idOf(manageToken);
      await moveTo(id, 200);
      await cancel(manageToken);
      await moveTo(id, 10);
      await sweepBookings(db, realtime, provider, 90);
      expect(realtime.events.some((e) => (e.payload as { change?: string }).change === "cook")).toBe(false);
    });
  });

  describe("the guest's link", () => {
    it("shows the booking without the phone, and refuses a forged link", async () => {
      const { manageToken } = await booked();
      const res = await manage(manageToken);
      expect(res.status).toBe(200);
      expect(res.body.booking).toMatchObject({ status: "active", depositCents: price });
      expect(JSON.stringify(res.body)).not.toMatch(/\+99890|Dilshod/);

      const [id, sig] = manageToken.split(".") as [string, string];
      const forged = `${id}.${sig.startsWith("A") ? "B" : "A"}${sig.slice(1)}`;
      expect((await manage(forged)).status).toBe(404);
      expect((await cancel(`${id}.x`)).status).toBe(404);
      expect((await manage(id)).status).toBe(400);
    });

    it("refunds 40% from 2 hours or more before, once", async () => {
      const { manageToken } = await booked();
      await moveTo(idOf(manageToken), 121);
      const res = await cancel(manageToken);
      expect(res.status).toBe(200);
      expect(res.body.refundCents).toBe(Math.floor(price * 0.4));
      expect(refunds).toEqual([{ paymentId: expect.any(String), amountCents: Math.floor(price * 0.4) }]);
      expect((await manage(manageToken)).body.booking).toMatchObject({
        status: "cancelled",
        refundCents: Math.floor(price * 0.4),
      });

      expect((await cancel(manageToken)).status).toBe(409);
      expect(refunds).toHaveLength(1);
    });

    it("refunds 20% within 2 hours", async () => {
      const { manageToken } = await booked();
      await moveTo(idOf(manageToken), 90);
      expect((await manage(manageToken)).body.booking.refundIfCancelledCents).toBe(Math.floor(price * 0.2));
      expect((await cancel(manageToken)).body.refundCents).toBe(Math.floor(price * 0.2));
    });

    it("can't cancel after the booked time, so a no-show gets nothing", async () => {
      const { manageToken } = await booked();
      await moveTo(idOf(manageToken), -1);
      const res = await cancel(manageToken);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("BOOKING_STARTED");
      expect(refunds).toHaveLength(0);
      expect((await manage(manageToken)).body.booking.refundIfCancelledCents).toBeNull();
    });

    it("retries a refund the provider couldn't take", async () => {
      const { manageToken } = await booked();
      await moveTo(idOf(manageToken), 200);
      failRefunds = true;
      expect((await cancel(manageToken)).body.refundCents).toBe(Math.floor(price * 0.4));
      const where = { reservationId: idOf(manageToken) };
      expect((await db.reservationDeposit.findFirstOrThrow({ where })).refundStatus).toBe("PENDING");

      failRefunds = false;
      await sweepBookings(db, realtime, provider, 90);
      expect((await db.reservationDeposit.findFirstOrThrow({ where })).refundStatus).toBe("DONE");
      expect(refunds).toHaveLength(1);
    });

    it("staff cancelling follow the same refund rule", async () => {
      const { manageToken } = await booked();
      await moveTo(idOf(manageToken), 90);
      const res = await request(app)
        .post(`/api/waiter/reservations/${idOf(manageToken)}/cancel`)
        .set("Origin", ORIGIN)
        .set("Cookie", await waiter());
      expect(res.body).toEqual({ ok: true, refundCents: Math.floor(price * 0.2) });
    });
  });

  describe("arriving", () => {
    const seat = async (id: string) =>
      request(app)
        .post(`/api/waiter/reservations/${id}/seat`)
        .set("Origin", ORIGIN)
        .set("Cookie", await waiter());
    const tableToken = async (number: number) => {
      const tb = await db.diningTable.findUniqueOrThrow({ where: { number } });
      return createQrToken(QR, tb.id, tb.qrVersion);
    };
    const scan = async (number: number) =>
      request(app)
        .post(`/api/tables/${await tableToken(number)}/join`)
        .set("Origin", ORIGIN)
        .send({});

    it("opens the visit with the dishes on the bill and the deposit counted", async () => {
      const { manageToken, tableNumber } = await booked();
      const id = idOf(manageToken);
      await moveTo(id, 20);
      await sweepBookings(db, realtime, provider, 90); // the kitchen has been told to start

      const res = await seat(id);
      expect(res.status).toBe(200);

      const order = await db.order.findFirstOrThrow({ where: { sessionId: res.body.sessionId } });
      expect(order.status).toBe("PREPARING");

      // The first scan joins without a PIN, and sees the dishes and what's left to pay.
      const first = await scan(tableNumber);
      expect(first.status).toBe(201);
      expect(first.body.snapshot.sessionId).toBe(res.body.sessionId);
      const bill = first.body.snapshot.bill;
      expect(bill.paidCents).toBe(price);
      expect(bill.balanceCents).toBe(bill.totalCents - price);

      // Anyone else at the table needs the PIN as usual.
      expect((await scan(tableNumber)).status).toBe(409);
      await db.tableSession.update({ where: { id: res.body.sessionId }, data: { status: "CLOSED" } });
      expect((await manage(manageToken)).body.booking.status).toBe("seated");
    });

    it("sends dishes to the kitchen as new if they haven't been started", async () => {
      const { manageToken } = await booked();
      const id = idOf(manageToken);
      await moveTo(id, 60);
      const res = await seat(id);
      expect(res.status).toBe(200);
      const order = await db.order.findFirstOrThrow({ where: { sessionId: res.body.sessionId } });
      expect(order.status).toBe("RECEIVED");
      await db.tableSession.update({ where: { id: res.body.sessionId }, data: { status: "CLOSED" } });
    });

    it("refuses a booking days away, a cancelled one, and a table still in use", async () => {
      const far = await booked();
      const res = await seat(idOf(far.manageToken));
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("TOO_EARLY_TO_SEAT");

      const gone = await booked();
      await moveTo(idOf(gone.manageToken), 200);
      await cancel(gone.manageToken);
      await moveTo(idOf(gone.manageToken), 10);
      expect((await seat(idOf(gone.manageToken))).status).toBe(409);

      const busy = await booked();
      const id = idOf(busy.manageToken);
      await moveTo(id, 10);
      const tb = await db.diningTable.findUniqueOrThrow({ where: { number: busy.tableNumber } });
      const sitting = await db.tableSession.create({ data: { tableId: tb.id } });
      const blocked = await seat(id);
      expect(blocked.status).toBe(409);
      expect(blocked.body.error.code).toBe("TABLE_BUSY");
      expect((await db.reservation.findUniqueOrThrow({ where: { id } })).status).toBe("ACTIVE");
      await db.tableSession.update({ where: { id: sitting.id }, data: { status: "CLOSED" } });
    });

    it("kitchen staff can't seat a booking", async () => {
      const { manageToken } = await booked();
      const res = await request(app)
        .post(`/api/waiter/reservations/${idOf(manageToken)}/seat`)
        .set("Origin", ORIGIN)
        .set("Cookie", await kitchen());
      expect(res.status).toBe(403);
    });
  });

  describe("keeping data", () => {
    it("deletes old bookings with the guest's details, but keeps the money record", async () => {
      const phone = "+998955556666";
      const { manageToken } = await booked({ phone });
      const id = idOf(manageToken);
      await db.reservation.update({
        where: { id },
        data: { startsAt: new Date(Date.now() - 91 * 24 * 60 * MINUTE), status: "CANCELLED" },
      });
      const deposit = await db.reservationDeposit.findFirstOrThrow({ where: { reservationId: id } });

      const { purged } = await sweepBookings(db, realtime, provider, 90);
      expect(purged).toBeGreaterThan(0);
      expect(await db.reservation.count({ where: { guestPhone: phone } })).toBe(0);
      expect(await db.reservationItem.count({ where: { reservationId: id } })).toBe(0);
      const kept = await db.reservationDeposit.findUniqueOrThrow({ where: { id: deposit.id } });
      expect(kept.reservationId).toBeNull();
      expect(kept.amountCents).toBe(deposit.amountCents);
    });

    it("keeps recent bookings", async () => {
      const phone = "+998966667777";
      const { manageToken } = await booked({ phone });
      await db.reservation.update({
        where: { id: idOf(manageToken) },
        data: { startsAt: new Date(Date.now() - 89 * 24 * 60 * MINUTE) },
      });
      await sweepBookings(db, realtime, provider, 90);
      expect(await db.reservation.count({ where: { guestPhone: phone } })).toBe(1);
    });

    it("releases a table whose payment was never finished", async () => {
      const table = await db.diningTable.findFirstOrThrow();
      const startsAt = reservationInstant(date, time, brand.timezone);
      const row = await db.reservation.create({
        data: {
          tableId: table.id,
          startsAt,
          partySize: 2,
          guestName: "A",
          guestPhone: "+998900000001",
          status: "PENDING",
          createdAt: new Date(Date.now() - 20 * MINUTE),
          deposit: { create: { amountCents: 100, method: "CARD", provider: "mock" } },
        },
      });
      await sweepBookings(db, realtime, provider, 90);
      expect((await db.reservation.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("CANCELLED");
    });

    it("the audit log can't be changed or deleted", async () => {
      await booked();
      const log = await db.auditLog.findFirstOrThrow();
      await expect(db.auditLog.update({ where: { id: log.id }, data: { action: "x" } })).rejects.toThrow(/append-only/);
      await expect(db.auditLog.delete({ where: { id: log.id } })).rejects.toThrow(/append-only/);
      await expect(db.auditLog.deleteMany()).rejects.toThrow(/append-only/);
      expect((await db.auditLog.findUniqueOrThrow({ where: { id: log.id } })).action).toBe(log.action);
    });
  });

  describe("discount codes", () => {
    it("stop being tried after 5 wrong guesses at a table, even the right one", async () => {
      await db.discountCode.create({ data: { code: "REAL10", kind: "PERCENT", value: 1000, active: true } });
      const tb = await db.diningTable.findUniqueOrThrow({ where: { number: 9 } });
      const joined = await request(app)
        .post(`/api/tables/${createQrToken(QR, tb.id, tb.qrVersion)}/join`)
        .set("Origin", ORIGIN)
        .send({});
      const guest = cookieOf(joined);
      const tryCode = (code: string) =>
        request(app).post("/api/session/discount").set("Origin", ORIGIN).set("Cookie", guest).send({ code });

      for (let i = 0; i < 5; i++) expect((await tryCode(`WRONG${i}`)).status).toBe(404);
      const blocked = await tryCode("REAL10");
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe("TOO_MANY_CODE_ATTEMPTS");
      const logged = await db.auditLog.findMany({ where: { action: "discount.wrong_code" } });
      expect(JSON.stringify(logged)).not.toContain("WRONG");
    });
  });
});
