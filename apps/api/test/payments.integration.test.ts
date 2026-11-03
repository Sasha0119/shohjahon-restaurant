import { randomUUID } from "node:crypto";
import { shareForItems } from "@app/shared";
import { pino } from "pino";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { createMemoryMailer } from "../src/billing/mailer.ts";
import { mockWebhookSecret, signMockWebhook } from "../src/billing/provider.ts";
import type { Db } from "../src/db.ts";
import { parseEnv } from "../src/env.ts";
import { createRecordingRealtime } from "../src/realtime/types.ts";
import { createQrToken } from "../src/tables/qr-token.ts";
import { TEST_DATABASE_URL, TEST_MANAGER, TEST_PIN_STAFF, createTestDb, type TestDb } from "./helpers/test-db.ts";

const ORIGIN = "http://localhost:3000";
const QR = "q".repeat(40);
const COOKIE_SECRET = "c".repeat(40);

describe.skipIf(!TEST_DATABASE_URL)("bill, discounts, payments & receipts (integration)", () => {
  let t: TestDb;
  let db: Db;
  let app: ReturnType<typeof createApp>["app"];
  let env: ReturnType<typeof parseEnv>;
  const rt = createRecordingRealtime();
  const mailer = createMemoryMailer();

  beforeAll(async () => {
    t = await createTestDb();
    db = t.db;
    env = parseEnv({ DATABASE_URL: t.url, CORS_ORIGINS: ORIGIN, PUBLIC_WEB_URL: ORIGIN, QR_TOKEN_SECRET: QR, COOKIE_SECRET });
    app = createApp({ db, env, logger: pino({ level: "silent" }), realtime: rt, mailer, disableRateLimits: true }).app;
  }, 180_000);
  afterAll(async () => {
    await t?.cleanup();
  });
  beforeEach(() => rt.clear());

  // ── helpers ────────────────────────────────────────────────────────────────
  const cookie = (res: request.Response) => (res.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
  const seat = async (n: number, confirmJoin = false) => {
    const tb = await db.diningTable.findUniqueOrThrow({ where: { number: n } });
    return cookie(await request(app).post(`/api/tables/${createQrToken(QR, tb.id, tb.qrVersion)}/join`).set("Origin", ORIGIN).send({ confirmJoin }));
  };
  const as = (c: string) => ({
    get: (p: string) => request(app).get(p).set("Cookie", c),
    post: (p: string, body: object = {}, key?: string) => {
      const r = request(app).post(p).set("Origin", ORIGIN).set("Cookie", c);
      return (key ? r.set("Idempotency-Key", key) : r).send(body);
    },
    patch: (p: string, body: object) => request(app).patch(p).set("Origin", ORIGIN).set("Cookie", c).send(body),
    del: (p: string) => request(app).delete(p).set("Origin", ORIGIN).set("Cookie", c),
  });
  const login = async () => cookie(await request(app).post("/api/auth/login").set("Origin", ORIGIN).send(TEST_MANAGER));
  const waiterLogin = async () =>
    cookie(await request(app).post("/api/auth/pin").set("Origin", ORIGIN).send({ staffId: TEST_PIN_STAFF.waiter.id, pin: TEST_PIN_STAFF.waiter.pin }));
  /** Seat a guest and send burger + flat white (subtotal 23.00). */
  const tableWithOrder = async (n: number) => {
    const g = await seat(n);
    await as(g).post("/api/session/cart", { itemId: "item-double-smash-burger", quantity: 1 });
    await as(g).post("/api/session/cart", { itemId: "item-flat-white", quantity: 1 });
    const v = (await as(g).get("/api/session")).body.snapshot.version;
    const sent = await as(g).post("/api/session/orders", { cartVersion: v }, randomUUID());
    expect(sent.status).toBe(201);
    return g;
  };
  const bill = async (g: string) => (await as(g).get("/api/session/bill")).body.bill;
  const pay = (g: string, body: object, key = randomUUID()) => as(g).post("/api/session/payments", body, key);

  // ── bill & discounts ───────────────────────────────────────────────────────
  describe("bill and discount codes", () => {
    let g = "";
    let manager = "";
    beforeAll(async () => {
      g = await tableWithOrder(1);
      manager = await login();
    });

    it("computes the bill on the server", async () => {
      const b = await bill(g);
      // 23.00 + 10 % service (2.30) + 8 % tax (1.84)
      expect(b).toMatchObject({
        subtotalCents: 2300,
        serviceChargeCents: 230,
        taxCents: 184,
        totalCents: 2714,
        paidCents: 0,
        balanceCents: 2714,
        outstandingCents: 2714,
        discountCode: null,
      });
      const preview = await as(g).get("/api/session/bill?tipPercent=15");
      expect(preview.body.tipPreviewCents).toBe(345);
    });

    it("managers create codes; guests apply them; limits are enforced", async () => {
      const created = await as(manager).post("/api/admin/discounts", { code: "welcome10", kind: "percent", value: 10, maxRedemptions: 1 });
      expect(created.status).toBe(201);
      expect(created.body.discount).toMatchObject({ code: "WELCOME10", kind: "percent", value: 10, redemptionCount: 0 });
      expect((await as(manager).post("/api/admin/discounts", { code: "WELCOME10", kind: "fixed", value: 100 })).body.error.code).toBe("CODE_TAKEN");

      expect((await as(g).post("/api/session/discount", { code: "nope" })).body.error.code).toBe("INVALID_CODE");
      const applied = await as(g).post("/api/session/discount", { code: "welcome10" });
      expect(applied.body.bill).toMatchObject({ discountCode: "WELCOME10", codeDiscountCents: 230, serviceChargeCents: 207, taxCents: 166, totalCents: 2443 });
      expect(rt.events.find((e) => e.event === "bill:updated")).toBeTruthy();

      // Only one use: another table can't have it…
      const other = await tableWithOrder(2);
      expect((await as(other).post("/api/session/discount", { code: "WELCOME10" })).body.error.code).toBe("CODE_USED_UP");
      // …until the first table removes it.
      await as(g).del("/api/session/discount");
      expect((await as(other).post("/api/session/discount", { code: "WELCOME10" })).status).toBe(200);
      await as(other).del("/api/session/discount");
      expect((await as(g).post("/api/session/discount", { code: "WELCOME10" })).body.bill.totalCents).toBe(2443);
    });

    it("respects minimum order size, dates and the on/off switch", async () => {
      await as(manager).post("/api/admin/discounts", { code: "BIGSPEND", kind: "fixed", value: 500, minSubtotalCents: 10_000 });
      const other = await tableWithOrder(3);
      const res = await as(other).post("/api/session/discount", { code: "BIGSPEND" });
      expect(res.status).toBe(422);
      expect(res.body.error).toMatchObject({ code: "CODE_MIN_SUBTOTAL", details: { minSubtotalCents: 10_000 } });

      const future = await as(manager).post("/api/admin/discounts", { code: "LATER", kind: "fixed", value: 100, startsAt: new Date(Date.now() + 86_400_000).toISOString() });
      expect(future.status).toBe(201);
      expect((await as(other).post("/api/session/discount", { code: "LATER" })).body.error.code).toBe("INVALID_CODE");

      const off = await as(manager).post("/api/admin/discounts", { code: "OFFCODE", kind: "fixed", value: 100 });
      await as(manager).patch(`/api/admin/discounts/${off.body.discount.id}`, { active: false });
      expect((await as(other).post("/api/session/discount", { code: "OFFCODE" })).body.error.code).toBe("INVALID_CODE");

      const list = await as(manager).get("/api/admin/discounts");
      expect(list.body.discounts.find((d: { code: string }) => d.code === "WELCOME10").redemptionCount).toBe(1);
      expect((await as(await waiterLogin()).get("/api/admin/discounts")).status).toBe(403);
    });

    // ── split by item, retries, failures, cash, closing ───────────────────────
    let receiptToken = "";
    it("pays for chosen items with a fair share of service, tax and discount", async () => {
      const snap = (await as(g).get("/api/session")).body.snapshot;
      const burgerLine = snap.orders.flatMap((o: { lines: { id: string; name: string }[] }) => o.lines).find((l: { name: string }) => l.name === "Double Smash Burger");
      const share = shareForItems(2443, 2300, 1850);
      expect(share).toBe(1965);

      expect((await pay(g, { splitMode: "items", method: "card", amountCents: share + 1, orderItemIds: [burgerLine.id] })).body.error.code).toBe("AMOUNT_CHANGED");
      expect((await as(g).post("/api/session/payments", { splitMode: "full", method: "card", amountCents: 2443 })).body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");

      const key = randomUUID();
      const res = await pay(g, { splitMode: "items", method: "card", amountCents: share, tipCents: 300, orderItemIds: [burgerLine.id] }, key);
      expect(res.status).toBe(201);
      expect(res.body.payment).toMatchObject({ status: "succeeded", method: "card", amountCents: 1965, tipCents: 300 });
      expect(res.body.payment.receiptToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
      expect(res.body.bill).toMatchObject({ paidCents: 1965, balanceCents: 478, outstandingCents: 478, tipsPaidCents: 300 });
      expect(res.body.bill.claimedOrderItemIds).toEqual([burgerLine.id]);
      receiptToken = res.body.payment.receiptToken;
      expect(rt.events.map((e) => e.event)).toEqual(expect.arrayContaining(["payment:updated", "bill:updated"]));

      // Retrying the same request never charges again.
      const again = await pay(g, { splitMode: "items", method: "card", amountCents: share, tipCents: 300, orderItemIds: [burgerLine.id] }, key);
      expect(again.body.payment.id).toBe(res.body.payment.id);
      expect(await db.payment.count({ where: { session: { table: { number: 1 } } } })).toBe(1);

      // Nobody can pay the same item twice.
      const friend = await seat(1, true);
      const dup = await pay(friend, { splitMode: "items", method: "card", amountCents: 1965, orderItemIds: [burgerLine.id] });
      expect(dup.body.error.code).toBe("ITEMS_ALREADY_PAID");
    });

    it("freezes the discount once payment has started", async () => {
      expect((await as(g).del("/api/session/discount")).body.error.code).toBe("PAYMENTS_STARTED");
    });

    it("records a declined card without touching the balance", async () => {
      const res = await pay(g, { splitMode: "custom", method: "card", amountCents: 113 }); // mock declines totals ending in 13
      expect(res.body.payment).toMatchObject({ status: "failed", failureReason: "card_declined", receiptToken: null });
      expect((await bill(g)).outstandingCents).toBe(478);
    });

    it("cash: reserves the amount, alerts the waiter, and closes the table once confirmed", async () => {
      const res = await pay(g, { splitMode: "full", method: "cash", amountCents: 478, tipCents: 22 });
      expect(res.body.payment.status).toBe("pending");
      expect(res.body.bill).toMatchObject({ pendingCents: 478, outstandingCents: 0, balanceCents: 478 });
      expect((await pay(g, { splitMode: "custom", method: "card", amountCents: 100 })).body.error.code).toBe("NOTHING_TO_PAY");

      const waiter = await waiterLogin();
      const calls = (await as(waiter).get("/api/waiter/calls")).body.calls;
      const cashCall = calls.find((c: { type: string }) => c.type === "cashPayment");
      expect(cashCall).toMatchObject({ amountCents: 500, tableNumber: 1, paymentId: res.body.payment.id });

      rt.clear();
      const sessionId = (await db.tableSession.findFirstOrThrow({ where: { table: { number: 1 }, status: "OPEN" } })).id;
      const ok = await as(waiter).post(`/api/waiter/sessions/${sessionId}/cash`, { paymentId: res.body.payment.id });
      expect(ok.body.payment.status).toBe("succeeded");
      expect(rt.events.find((e) => e.event === "session:closed")?.payload).toMatchObject({ reason: "paid" });
      expect(rt.events.find((e) => e.event === "call:updated")?.payload).toMatchObject({ call: { status: "handled" } });
      expect((await as(g).get("/api/session")).body.error).toMatchObject({ code: "SESSION_CLOSED", details: { reason: "paid" } });
      const audits = await db.auditLog.findMany({ where: { action: "payment.succeeded" } });
      expect(audits.length).toBeGreaterThanOrEqual(2);
      expect((await as(waiter).post(`/api/waiter/sessions/${sessionId}/cash`, { paymentId: res.body.payment.id })).body.error.code).toBe("ALREADY_SETTLED");
    });

    it("serves the receipt and emails it", async () => {
      const r = await request(app).get(`/api/receipts/${receiptToken}`);
      expect(r.status).toBe(200);
      expect(r.headers["x-robots-tag"]).toBe("noindex");
      expect(r.body.receipt).toMatchObject({
        tableNumber: 1,
        bill: { totalCents: 2443, discountCode: "WELCOME10" },
        payment: { amountCents: 1965, tipCents: 300, chargedCents: 2265, method: "card", splitMode: "items" },
        paidToDateCents: 1965,
        balanceAfterCents: 478,
      });
      expect(r.body.receipt.lines.map((l: { name: string }) => l.name)).toEqual(["Double Smash Burger", "Flat White"]);
      expect((await request(app).get("/api/receipts/not-a-real-receipt-token-x")).status).toBe(404);

      const mail = await request(app).post(`/api/receipts/${receiptToken}/email`).set("Origin", ORIGIN).send({ email: "Guest@Example.com" });
      expect(mail.body).toEqual({ sent: true });
      expect(mailer.sent.at(-1)).toMatchObject({ to: "guest@example.com" });
      expect(mailer.sent.at(-1)!.text).toContain("Double Smash Burger");
      expect((await request(app).get(`/api/receipts/${receiptToken}`)).body.receipt.emailedTo).toBe("g•••@example.com");
      expect((await request(app).post(`/api/receipts/${receiptToken}/email`).set("Origin", ORIGIN).send({ email: "x@example.com" })).status).toBe(429);

      const noMail = createApp({ db, env, logger: pino({ level: "silent" }), realtime: rt, mailer: null, disableRateLimits: true }).app;
      const off = await request(noMail).post(`/api/receipts/${receiptToken}/email`).set("Origin", ORIGIN).send({ email: "x@example.com" });
      expect(off.body.error.code).toBe("EMAIL_NOT_CONFIGURED");
    });
  });

  // ── split evenly, concurrency, webhooks ────────────────────────────────────
  describe("split evenly and concurrency", () => {
    it("three even shares add up to the exact total and close the table", async () => {
      const g = await tableWithOrder(5);
      const total = (await bill(g)).totalCents as number; // 2714 → 905 + 905 + 904
      const paid: number[] = [];
      for (let i = 0; i < 3; i++) {
        const b = await bill(g).catch(() => null);
        const outstanding = b?.outstandingCents ?? 0;
        const share = Math.min(outstanding, Math.ceil(total / 3));
        const res = await pay(g, { splitMode: "even", method: "applePay", amountCents: share, people: 3 });
        expect(res.body.payment.status).toBe("succeeded");
        paid.push(share);
      }
      expect(paid.reduce((a, b) => a + b, 0)).toBe(total);
      expect((await as(g).get("/api/session")).body.error.details.reason).toBe("paid");
    });

    it("two guests paying the full bill at once: only one goes through", async () => {
      const a = await tableWithOrder(6);
      const b = await seat(6, true);
      const total = (await bill(a)).totalCents;
      const [r1, r2] = await Promise.all([
        pay(a, { splitMode: "full", method: "card", amountCents: total }),
        pay(b, { splitMode: "full", method: "card", amountCents: total }),
      ]);
      const statuses = [r1.status, r2.status].sort();
      expect(statuses).toEqual([201, 409]);
      const paidCount = await db.payment.count({ where: { status: "SUCCEEDED", session: { table: { number: 6 } } } });
      expect(paidCount).toBe(1);
    });

    it("accepts only correctly signed webhooks, and applies them once", async () => {
      const g = await tableWithOrder(7);
      const total = (await bill(g)).totalCents;
      const res = await pay(g, { splitMode: "full", method: "cash", amountCents: total });
      const body = JSON.stringify({ paymentId: res.body.payment.id, status: "succeeded" });
      const secret = mockWebhookSecret(COOKIE_SECRET);

      const bad = await request(app).post("/api/payments/webhook/mock").set("Content-Type", "application/json").set("x-mock-signature", "0".repeat(64)).send(body);
      expect(bad.status).toBe(400);
      const good = () =>
        request(app).post("/api/payments/webhook/mock").set("Content-Type", "application/json").set("x-mock-signature", signMockWebhook(secret, body)).send(body);
      expect((await good()).body).toEqual({ received: true });
      expect((await good()).body).toEqual({ received: true });
      expect(await db.auditLog.count({ where: { action: "payment.succeeded", entityId: res.body.payment.id } })).toBe(1);
      expect((await request(app).post("/api/payments/webhook/stripe").send("{}")).status).toBe(404);
    });
  });
});
