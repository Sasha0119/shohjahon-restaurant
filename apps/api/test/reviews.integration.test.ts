import { randomUUID } from "node:crypto";
import { brand } from "@app/config";
import { pino } from "pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import type { Db } from "../src/db.ts";
import { parseEnv } from "../src/env.ts";
import { createRecordingRealtime } from "../src/realtime/types.ts";
import { createQrToken } from "../src/tables/qr-token.ts";
import { TEST_DATABASE_URL, TEST_MANAGER, TEST_PIN_STAFF, createTestDb, type TestDb } from "./helpers/test-db.ts";

const ORIGIN = "http://localhost:3000";
const QR = "q".repeat(40);

describe.skipIf(!TEST_DATABASE_URL)("reviews & feedback log (integration)", () => {
  let t: TestDb;
  let db: Db;
  let app: ReturnType<typeof createApp>["app"];
  const rt = createRecordingRealtime();

  beforeAll(async () => {
    t = await createTestDb();
    db = t.db;
    const env = parseEnv({ DATABASE_URL: t.url, CORS_ORIGINS: ORIGIN, PUBLIC_WEB_URL: ORIGIN, QR_TOKEN_SECRET: QR, COOKIE_SECRET: "c".repeat(40) });
    app = createApp({ db, env, logger: pino({ level: "silent" }), realtime: rt, mailer: null, disableRateLimits: true }).app;
  }, 180_000);
  afterAll(async () => {
    await t?.cleanup();
  });

  const cookie = (res: request.Response) => (res.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
  const seat = async (n: number, confirmJoin = false) => {
    const tb = await db.diningTable.findUniqueOrThrow({ where: { number: n } });
    return cookie(await request(app).post(`/api/tables/${createQrToken(QR, tb.id, tb.qrVersion)}/join`).set("Origin", ORIGIN).send({ confirmJoin }));
  };
  const post = (c: string, p: string, body: object = {}, key?: string) => {
    const r = request(app).post(p).set("Origin", ORIGIN).set("Cookie", c);
    return (key ? r.set("Idempotency-Key", key) : r).send(body);
  };
  const get = (c: string, p: string) => request(app).get(p).set("Cookie", c);
  const review = (c: string, rating: number, comment = "") => post(c, "/api/session/review", { rating, comment });

  /** Seat, order fries, and (optionally) pay the full bill — which closes the table. */
  const visit = async (n: number, payInFull: boolean) => {
    const g = await seat(n);
    await post(g, "/api/session/cart", { itemId: "item-parmesan-fries", quantity: 1 });
    const v = (await get(g, "/api/session")).body.snapshot.version;
    await post(g, "/api/session/orders", { cartVersion: v }, randomUUID());
    if (payInFull) {
      const total = (await get(g, "/api/session/bill")).body.bill.totalCents;
      const paid = await post(g, "/api/session/payments", { splitMode: "full", method: "card", amountCents: total }, randomUUID());
      expect(paid.body.payment.status).toBe("succeeded");
    }
    return g;
  };

  it("refuses a rating before paying", async () => {
    const g = await visit(1, false);
    const res = await review(g, 5);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("PAYMENT_REQUIRED");
  });

  it("rates after paying, even though paying closed the table", async () => {
    const g = await visit(2, true);
    expect((await get(g, "/api/session")).status).toBe(410); // the visit is over...
    const res = await review(g, 5, "Lovely evening!");
    expect(res.status).toBe(201); // ...but rating still works
    expect(res.body).toEqual({ kind: "public", reviewLinks: brand.reviewLinks });
    const stored = await db.review.findFirstOrThrow({ where: { comment: "Lovely evening!" } });
    expect(stored).toMatchObject({ rating: 5, status: "HANDLED" });
    expect(rt.events.some((e) => e.event === "feedback:created")).toBe(false);
  });

  it("allows one review per guest per visit", async () => {
    const g = await visit(3, true);
    await review(g, 4);
    expect((await review(g, 2)).body.error.code).toBe("ALREADY_REVIEWED");
  });

  it("validates the rating and comment", async () => {
    const g = await visit(4, true);
    expect((await review(g, 0)).status).toBe(400);
    expect((await review(g, 6)).status).toBe(400);
    expect((await post(g, "/api/session/review", { rating: 3, comment: "x".repeat(1001) })).status).toBe(400);
  });

  let feedbackId = "";
  it("keeps 1 to 3 stars private and tells managers live", async () => {
    rt.clear();
    const g = await visit(5, true);
    const res = await review(g, 2, "Burger was cold.");
    expect(res.body).toEqual({ kind: "private", reviewLinks: [] });
    const evt = rt.events.find((e) => e.event === "feedback:created")!;
    expect(evt.rooms).toEqual(["managers"]);
    expect(evt.payload).toMatchObject({ feedback: { rating: 2, comment: "Burger was cold.", status: "new", tableNumber: 5 } });
    feedbackId = (evt.payload as { feedback: { id: string } }).feedback.id;
  });

  it("lets a guest who paid their share rate while the table is still open", async () => {
    const a = await visit(6, false);
    const total = (await get(a, "/api/session/bill")).body.bill.totalCents;
    await post(a, "/api/session/payments", { splitMode: "custom", method: "card", amountCents: Math.floor(total / 2) }, randomUUID());
    expect((await review(a, 3, "Slow service")).status).toBe(201);
    const friend = await seat(6, true);
    expect((await review(friend, 5)).body.error.code).toBe("PAYMENT_REQUIRED");
  });

  it("refuses ratings for a visit that ended more than 24 hours ago", async () => {
    const g = await visit(7, true);
    await db.tableSession.updateMany({ where: { table: { number: 7 } }, data: { closedAt: new Date(Date.now() - 25 * 3_600_000) } });
    expect((await review(g, 5)).status).toBe(410);
  });

  describe("feedback log", () => {
    let manager = "";
    beforeAll(async () => {
      manager = cookie(await request(app).post("/api/auth/login").set("Origin", ORIGIN).send(TEST_MANAGER));
    });

    it("lists only private feedback, newest first, with counts", async () => {
      const res = await get(manager, "/api/admin/feedback");
      expect(res.status).toBe(200);
      expect(res.body.feedback.map((f: { rating: number }) => f.rating)).toEqual([3, 2]);
      expect(res.body.counts).toEqual({ new: 2, handled: 0 });
      expect(res.body.feedback[1]).toMatchObject({ tableNumber: 5, comment: "Burger was cold." });
    });

    it("marks feedback handled and back to new, recording who", async () => {
      const patch = (status: string) =>
        request(app).patch(`/api/admin/feedback/${feedbackId}`).set("Origin", ORIGIN).set("Cookie", manager).send({ status });
      const res = await patch("handled");
      expect(res.body.feedback).toMatchObject({ status: "handled", handledBy: "Manager" });
      expect((await get(manager, "/api/admin/feedback?status=new")).body.feedback).toHaveLength(1);
      expect((await get(manager, "/api/admin/feedback?status=handled")).body.counts).toEqual({ new: 1, handled: 1 });
      const back = await patch("new");
      expect(back.body.feedback).toMatchObject({ status: "new", handledBy: null, handledAt: null });
      expect(await db.auditLog.count({ where: { action: "feedback.updated", entityId: feedbackId } })).toBe(2);
    });

    it("hides public reviews from the log and is manager-only", async () => {
      const happy = await db.review.findFirstOrThrow({ where: { rating: 5 } });
      const res = await request(app).patch(`/api/admin/feedback/${happy.id}`).set("Origin", ORIGIN).set("Cookie", manager).send({ status: "new" });
      expect(res.status).toBe(404);
      const waiter = cookie(
        await request(app).post("/api/auth/pin").set("Origin", ORIGIN).send({ staffId: TEST_PIN_STAFF.waiter.id, pin: TEST_PIN_STAFF.waiter.pin }),
      );
      expect((await get(waiter, "/api/admin/feedback")).status).toBe(403);
    });
  });
});
