import { brand } from "@app/config";
import { pino } from "pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import type { Db } from "../src/db.ts";
import { parseEnv } from "../src/env.ts";
import { createRecordingRealtime } from "../src/realtime/types.ts";
import { TEST_DATABASE_URL, TEST_MANAGER, TEST_PIN_STAFF, createTestDb, type TestDb } from "./helpers/test-db.ts";

const ORIGIN = "http://localhost:3000";
const at = (iso: string) => new Date(iso);

/**
 * Hand-made history (restaurant time zone: Asia/Tashkent, UTC+5, no daylight saving).
 * Dishes come from the test fixture menu; amounts are in the currency's minor units.
 *  Table 1, Mon 2 Nov 18:30 local: burger ×2 (kitchen) + flat white ×1 (bar) — one round, two tickets.
 *          Paid 4750 + 500 tip at 00:30 local Tue (still 19:30 UTC Mon!). Rated 5.
 *  Table 2, Tue 3 Nov 12:00 local: fries ×3. A second round (burger ×5) was cancelled.
 *          Paid 1000 + 1500 (two guests); one failed payment of 9999. Rated 2.
 *  Table 3, Sun 1 Nov 11:00 local: previous period — paid 2000.
 */
async function seedHistory(db: Db) {
  const table = (n: number) => db.diningTable.findUniqueOrThrow({ where: { number: n } });
  const visit = async (n: number, openedAt: Date, guests: string[]) => {
    const s = await db.tableSession.create({
      data: { tableId: (await table(n)).id, status: "CLOSED", closeReason: "PAID", openedAt, closedAt: openedAt },
    });
    const gs = [];
    for (const [i, name] of guests.entries()) {
      gs.push(
        await db.sessionGuest.create({
          data: { sessionId: s.id, tokenHash: `t${n}-${i}-${openedAt.getTime()}`, nickname: name, createdAt: openedAt },
        }),
      );
    }
    return { s, gs };
  };
  const ticket = (
    sessionId: string,
    round: number,
    station: "KITCHEN" | "BAR",
    createdAt: Date,
    items: { itemId: string; name: string; qty: number; price: number; note?: string }[],
    status: "SERVED" | "CANCELLED" = "SERVED",
  ) =>
    db.order.create({
      data: {
        sessionId,
        round,
        station,
        status,
        createdAt,
        statusChangedAt: createdAt,
        items: {
          create: items.map((i) => ({
            itemId: i.itemId,
            name: i.name,
            unitPriceCents: i.price,
            quantity: i.qty,
            note: i.note ?? null,
            addedByName: "Sam",
            createdAt,
          })),
        },
      },
    });
  const pay = (
    sessionId: string,
    guestId: string,
    amount: number,
    tip: number,
    completedAt: Date,
    status: "SUCCEEDED" | "FAILED" = "SUCCEEDED",
  ) =>
    db.payment.create({
      data: {
        sessionId,
        guestId,
        amountCents: amount,
        tipCents: tip,
        method: "CARD",
        splitMode: "CUSTOM",
        status,
        provider: "mock",
        idempotencyKey: `k-${sessionId}-${amount}-${completedAt.getTime()}`,
        completedAt,
      },
    });

  const t1 = await visit(1, at("2026-11-02T13:00:00Z"), ["Sam"]);
  await ticket(t1.s.id, 1, "KITCHEN", at("2026-11-02T13:30:00Z"), [
    {
      itemId: "item-double-smash-burger",
      name: "Double Smash Burger",
      qty: 2,
      price: 1850,
      note: '=HYPERLINK("http://evil")',
    },
  ]);
  await ticket(t1.s.id, 1, "BAR", at("2026-11-02T13:30:00Z"), [
    { itemId: "item-flat-white", name: "Flat White", qty: 1, price: 450 },
  ]);
  await pay(t1.s.id, t1.gs[0]!.id, 4750, 500, at("2026-11-02T19:30:00Z"));
  await db.review.create({
    data: {
      sessionId: t1.s.id,
      guestId: t1.gs[0]!.id,
      rating: 5,
      status: "HANDLED",
      createdAt: at("2026-11-02T20:00:00Z"),
    },
  });

  const t2 = await visit(2, at("2026-11-03T06:45:00Z"), ["Ana", "Ben"]);
  await ticket(t2.s.id, 1, "KITCHEN", at("2026-11-03T07:00:00Z"), [
    { itemId: "item-parmesan-fries", name: "Truffle Parmesan Fries", qty: 3, price: 750 },
  ]);
  await ticket(
    t2.s.id,
    2,
    "KITCHEN",
    at("2026-11-03T07:30:00Z"),
    [{ itemId: "item-double-smash-burger", name: "Double Smash Burger", qty: 5, price: 1850 }],
    "CANCELLED",
  );
  await pay(t2.s.id, t2.gs[0]!.id, 1000, 0, at("2026-11-03T08:00:00Z"));
  await pay(t2.s.id, t2.gs[1]!.id, 1500, 0, at("2026-11-03T08:05:00Z"));
  await pay(t2.s.id, t2.gs[1]!.id, 9999, 0, at("2026-11-03T08:06:00Z"), "FAILED");
  await db.review.create({
    data: {
      sessionId: t2.s.id,
      guestId: t2.gs[0]!.id,
      rating: 2,
      comment: "Slow",
      createdAt: at("2026-11-03T09:00:00Z"),
    },
  });

  const t3 = await visit(3, at("2026-11-01T05:30:00Z"), ["Old"]);
  await ticket(t3.s.id, 1, "KITCHEN", at("2026-11-01T06:00:00Z"), [
    { itemId: "item-margherita-pizza", name: "Margherita", qty: 1, price: 2000 },
  ]);
  await pay(t3.s.id, t3.gs[0]!.id, 2000, 0, at("2026-11-01T06:30:00Z"));
}

describe.skipIf(!TEST_DATABASE_URL)("dashboard, order history & audit (integration)", () => {
  let t: TestDb;
  let db: Db;
  let app: ReturnType<typeof createApp>["app"];
  let manager = "";

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
    app = createApp({
      db,
      env,
      logger: pino({ level: "silent" }),
      realtime: createRecordingRealtime(),
      mailer: null,
      disableRateLimits: true,
    }).app;
    await seedHistory(db);
    const res = await request(app).post("/api/auth/login").set("Origin", ORIGIN).send(TEST_MANAGER);
    manager = (res.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
  }, 180_000);
  afterAll(async () => {
    await t?.cleanup();
  });

  const get = (p: string, c = manager) => request(app).get(p).set("Cookie", c);
  const range = "from=2026-11-02&to=2026-11-03";

  describe("analytics", () => {
    it("computes the headline numbers", async () => {
      const res = await get(`/api/admin/analytics?${range}`);
      expect(res.status).toBe(200);
      expect(res.body.range).toEqual({ from: "2026-11-02", to: "2026-11-03", days: 2, timezone: "Asia/Tashkent" });
      expect(res.body.kpis).toEqual({
        revenueCents: 4750 + 1000 + 1500, // failed payment excluded
        tipsCents: 500,
        orders: 2, // round 1 of table 1 (two tickets) counts once; the cancelled round not at all
        itemsSold: 2 + 1 + 3,
        guests: 3,
        paidVisits: 2,
        avgBillCents: (4750 + 2500) / 2,
        avgRating: 3.5,
        ratingCount: 2,
      });
      expect(res.body.previous).toMatchObject({ revenueCents: 2000, orders: 1, paidVisits: 1, avgRating: null });
    });

    it("buckets sales by the restaurant's calendar day", async () => {
      const res = await get(`/api/admin/analytics?${range}`);
      // Table 1 ordered on the 2nd but paid at 00:30 on the 3rd in Tashkent — 19:30 UTC on the 2nd.
      expect(res.body.salesByDay).toEqual([
        { date: "2026-11-02", revenueCents: 0, orders: 1 },
        { date: "2026-11-03", revenueCents: 4750 + 2500, orders: 1 },
      ]);
    });

    it("ranks top items and maps busiest hours in local time", async () => {
      const res = await get(`/api/admin/analytics?${range}`);
      expect(res.body.topItems).toEqual([
        { itemId: "item-parmesan-fries", name: "Truffle Parmesan Fries", quantity: 3, revenueCents: 2250 },
        { itemId: "item-double-smash-burger", name: "Double Smash Burger", quantity: 2, revenueCents: 3700 },
        { itemId: "item-flat-white", name: "Flat White", quantity: 1, revenueCents: 450 },
      ]);
      const h = res.body.busiestHours as number[][];
      expect(h).toHaveLength(7);
      expect(h[0]![18]).toBe(1); // Monday 18:00
      expect(h[1]![12]).toBe(1); // Tuesday 12:00
      expect(h.flat().reduce((a, b) => a + b, 0)).toBe(2);
      expect(res.body.ratings).toEqual({ average: 3.5, count: 2, distribution: [0, 1, 0, 0, 1] });
    });

    it("fills empty days with zeros and validates the range", async () => {
      const res = await get("/api/admin/analytics?from=2026-11-04&to=2026-11-06");
      expect(res.body.salesByDay.map((d: { revenueCents: number }) => d.revenueCents)).toEqual([0, 0, 0]);
      expect(res.body.kpis.avgRating).toBeNull();
      expect((await get("/api/admin/analytics?from=2026-11-06&to=2026-11-04")).status).toBe(400);
      expect((await get("/api/admin/analytics?from=2020-01-01&to=2026-01-01")).body.error.code).toBe("RANGE_TOO_LONG");
    });
  });

  describe("order history", () => {
    it("lists tickets newest first with totals", async () => {
      const res = await get(`/api/admin/orders?${range}`);
      expect(res.body.total).toBe(4);
      expect(res.body.orders[0]).toMatchObject({
        tableNumber: 2,
        round: 2,
        status: "cancelled",
        totalCents: 9250,
        itemCount: 5,
      });
      expect(res.body.orders.at(-1).station).toMatch(/kitchen|bar/);
    });

    it("filters by status, table, station and pages", async () => {
      expect((await get(`/api/admin/orders?${range}&status=cancelled`)).body.total).toBe(1);
      expect((await get(`/api/admin/orders?${range}&table=1`)).body.total).toBe(2);
      expect(
        (await get(`/api/admin/orders?${range}&station=bar`)).body.orders.map(
          (o: { tableNumber: number }) => o.tableNumber,
        ),
      ).toEqual([1]);
      const page2 = await get(`/api/admin/orders?${range}&pageSize=3&page=2`);
      expect(page2.body.orders).toHaveLength(1);
      expect((await get("/api/admin/orders?from=2026-11-01&to=2026-11-01")).body.total).toBe(1);
    });

    it("exports a spreadsheet-safe CSV, one row per line", async () => {
      const res = await get(`/api/admin/orders/export.csv?${range}`);
      expect(res.headers["content-type"]).toContain("text/csv");
      expect(res.headers["content-disposition"]).toContain("orders_2026-11-02_to_2026-11-03.csv");
      const lines = res.text.replace(/^﻿/, "").trim().split("\r\n");
      expect(lines[0]).toBe(
        "date,time,table,round,station,status,item,options,note,quantity,unit_price_UZS,line_total_UZS,added_by,order_id",
      );
      expect(lines).toHaveLength(1 + 4);
      expect(lines[1]).toMatch(/^2026-11-02,18:30,1,1,(kitchen|bar),served,/);
      expect(res.text).toContain(`"'=HYPERLINK(""http://evil"")"`); // formula neutralised
      expect(res.text).toContain("Truffle Parmesan Fries,,,3,750,2250,Sam"); // so'm have no decimals
    });
  });

  describe("audit log", () => {
    it("shows who did what, filterable by action", async () => {
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: brand.timezone }).format(new Date());
      const res = await get(`/api/admin/audit?from=${today}&to=${today}&action=staff.login`);
      expect(res.status).toBe(200);
      expect(res.body.entries.length).toBeGreaterThan(0);
      expect(res.body.entries.every((e: { action: string }) => e.action.startsWith("staff.login"))).toBe(true);
      expect(res.body.entries[0].actor).toEqual({ type: "staff", name: "Manager" });
      expect((await get(`/api/admin/audit?action=DROP`)).status).toBe(400);
    });

    it("is manager-only", async () => {
      const res = await request(app)
        .post("/api/auth/pin")
        .set("Origin", ORIGIN)
        .send({ staffId: TEST_PIN_STAFF.waiter.id, pin: TEST_PIN_STAFF.waiter.pin });
      const waiter = (res.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
      for (const p of [
        "/api/admin/analytics",
        "/api/admin/orders",
        "/api/admin/orders/export.csv",
        "/api/admin/audit",
      ]) {
        expect((await get(p, waiter)).status, p).toBe(403);
      }
    });
  });
});
