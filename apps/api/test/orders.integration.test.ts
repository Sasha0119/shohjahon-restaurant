import { randomUUID } from "node:crypto";
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
const QR = "q".repeat(40);

describe.skipIf(!TEST_DATABASE_URL)("cart, orders, kitchen & calls (integration)", () => {
  let t: TestDb;
  let db: Db;
  let app: ReturnType<typeof createApp>["app"];
  const rt = createRecordingRealtime();

  beforeAll(async () => {
    t = await createTestDb();
    db = t.db;
    const env = parseEnv({
      DATABASE_URL: t.url,
      CORS_ORIGINS: ORIGIN,
      PUBLIC_WEB_URL: ORIGIN,
      QR_TOKEN_SECRET: QR,
      COOKIE_SECRET: "c".repeat(40),
      CALL_COOLDOWN_SECONDS: "60",
    });
    app = createApp({ db, env, logger: pino({ level: "silent" }), realtime: rt, disableRateLimits: true }).app;
  }, 180_000);
  afterAll(async () => {
    await t?.cleanup();
  });
  beforeEach(() => rt.clear());

  // ── helpers ────────────────────────────────────────────────────────────────
  const cookie = (res: request.Response) => (res.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
  const seat = async (tableNumber: number, confirmJoin = false) => {
    const tb = await db.diningTable.findUniqueOrThrow({ where: { number: tableNumber } });
    const res = await request(app)
      .post(`/api/tables/${createQrToken(QR, tb.id, tb.qrVersion)}/join`)
      .set("Origin", ORIGIN)
      .send({ confirmJoin });
    return { cookie: cookie(res), snapshot: res.body.snapshot, tableId: tb.id };
  };
  const as = (c: string) => ({
    get: (p: string) => request(app).get(p).set("Cookie", c),
    post: (p: string, body: object = {}, headers: Record<string, string> = {}) =>
      request(app).post(p).set("Origin", ORIGIN).set("Cookie", c).set(headers).send(body),
    patch: (p: string, body: object) => request(app).patch(p).set("Origin", ORIGIN).set("Cookie", c).send(body),
    del: (p: string) => request(app).delete(p).set("Origin", ORIGIN).set("Cookie", c),
  });
  const pin = async (who: "waiter" | "kitchen") =>
    cookie(
      await request(app)
        .post("/api/auth/pin")
        .set("Origin", ORIGIN)
        .send({ staffId: TEST_PIN_STAFF[who].id, pin: TEST_PIN_STAFF[who].pin }),
    );
  const opt = async (itemSlug: string, groupName: string, optionName: string) => {
    const g = await db.modifierGroup.findFirstOrThrow({
      where: { name: groupName, item: { slug: itemSlug } },
      include: { options: true },
    });
    return { groupId: g.id, optionId: g.options.find((o) => o.name === optionName)!.id };
  };
  const version = async (c: string) => (await as(c).get("/api/session")).body.snapshot.version as number;
  const send = (c: string, cartVersion: number, key: string = randomUUID()) =>
    as(c).post("/api/session/orders", { cartVersion }, { "Idempotency-Key": key });
  const events = (name: string) => rt.events.filter((e) => e.event === name);

  // ── shared cart ────────────────────────────────────────────────────────────
  describe("shared cart", () => {
    let a = "";
    let b = "";
    beforeAll(async () => {
      a = (await seat(1)).cookie;
      b = (await seat(1, true)).cookie;
    });

    it("adds lines for everyone at the table and pushes the cart live", async () => {
      const res = await as(a).post("/api/session/cart", { itemId: "item-double-smash-burger", quantity: 1 });
      expect(res.status).toBe(201);
      expect(res.body.cart).toHaveLength(1);
      expect(res.body.cart[0]).toMatchObject({ itemId: "item-double-smash-burger", quantity: 1, unitPriceCents: 1850 });
      const evt = events("cart:updated")[0]!;
      expect(evt.rooms[0]).toMatch(/^session:/);
      expect((evt.payload as { version: number }).version).toBe(res.body.version);

      // The other phone sees it too.
      expect((await as(b).get("/api/session")).body.snapshot.cart).toHaveLength(1);
    });

    it("merges identical lines from the same guest; keeps other guests' lines separate", async () => {
      await as(a).post("/api/session/cart", { itemId: "item-double-smash-burger", quantity: 2 });
      const res = await as(b).post("/api/session/cart", { itemId: "item-double-smash-burger", quantity: 1 });
      const lines = res.body.cart as { quantity: number; guestId: string }[];
      expect(lines.map((l) => l.quantity)).toEqual([3, 1]);
      expect(new Set(lines.map((l) => l.guestId)).size).toBe(2);
    });

    it("prices options from the database (never from the phone)", async () => {
      const { groupId, optionId } = await opt("double-smash-burger", "Choose a side", "Truffle parmesan fries");
      const res = await as(a).post("/api/session/cart", {
        itemId: "item-double-smash-burger",
        quantity: 1,
        selection: { [groupId]: [optionId] },
        note: "No pickles",
      });
      expect(res.body.cart.at(-1)).toMatchObject({ unitPriceCents: 1850 + 250, note: "No pickles" });
    });

    it("rejects missing required choices, unknown groups, sold-out and hidden items", async () => {
      const steak = await as(a).post("/api/session/cart", { itemId: "item-steak-frites", quantity: 1 });
      expect(steak.status).toBe(400);
      expect(steak.body.error.code).toBe("INVALID_SELECTION");
      const bogus = await as(a).post("/api/session/cart", {
        itemId: "item-flat-white",
        quantity: 1,
        selection: { "not-a-group": [] },
      });
      expect(bogus.body.error.code).toBe("INVALID_SELECTION");
      const prawns = await as(a).post("/api/session/cart", { itemId: "item-garlic-prawn-spaghetti", quantity: 1 });
      expect(prawns.status).toBe(409);
      expect(prawns.body.error.code).toBe("OUT_OF_STOCK");
      await db.menuItem.update({ where: { id: "item-fudge-brownie" }, data: { archived: true } });
      expect(
        (await as(a).post("/api/session/cart", { itemId: "item-fudge-brownie", quantity: 1 })).body.error.code,
      ).toBe("ITEM_UNAVAILABLE");
      await db.menuItem.update({ where: { id: "item-fudge-brownie" }, data: { archived: false } });
    });

    it("lets anyone at the table change or remove any line", async () => {
      const cart = (await as(a).get("/api/session")).body.snapshot.cart;
      const changed = await as(b).patch(`/api/session/cart/${cart[0].id}`, { quantity: 5 });
      expect(changed.body.cart[0].quantity).toBe(5);
      const removed = await as(b).del(`/api/session/cart/${cart[0].id}`);
      expect(removed.body.cart).toHaveLength(cart.length - 1);
    });

    it("never touches another table's cart", async () => {
      const other = (await seat(2)).cookie;
      const cart = (await as(a).get("/api/session")).body.snapshot.cart;
      expect((await as(other).del(`/api/session/cart/${cart[0].id}`)).status).toBe(404);
    });
  });

  // ── send to kitchen ────────────────────────────────────────────────────────
  describe("send to kitchen", () => {
    let g = "";
    beforeAll(async () => {
      g = (await seat(3)).cookie;
    });

    it("requires an Idempotency-Key and the current cart version", async () => {
      await as(g).post("/api/session/cart", { itemId: "item-double-smash-burger", quantity: 2 });
      const { groupId, optionId } = await opt("flat-white", "Milk", "Oat milk");
      await as(g).post("/api/session/cart", {
        itemId: "item-flat-white",
        quantity: 1,
        selection: { [groupId]: [optionId] },
      });
      expect((await as(g).post("/api/session/orders", { cartVersion: 0 })).body.error.code).toBe(
        "IDEMPOTENCY_KEY_REQUIRED",
      );
      expect((await send(g, 0)).body.error.code).toBe("CART_CHANGED");
    });

    let firstKey: string = "";
    let first: request.Response;
    it("creates one ticket per station with price snapshots, and empties the cart", async () => {
      firstKey = randomUUID();
      first = await send(g, await version(g), firstKey);
      expect(first.status).toBe(201);
      const tickets = first.body.tickets as {
        station: string;
        round: number;
        lines: { name: string; unitPriceCents: number; quantity: number; modifiers: { option: string }[] }[];
      }[];
      expect(tickets.map((x) => x.station)).toEqual(["kitchen", "bar"]);
      expect(tickets.every((x) => x.round === 1)).toBe(true);
      expect(tickets[0]!.lines[0]).toMatchObject({ name: "Double Smash Burger", quantity: 2, unitPriceCents: 1850 });
      expect(tickets[1]!.lines[0]).toMatchObject({ name: "Flat White", unitPriceCents: 510 });
      expect(tickets[1]!.lines[0]!.modifiers.map((m) => m.option)).toContain("Oat milk");

      const snap = (await as(g).get("/api/session")).body.snapshot;
      expect(snap.cart).toHaveLength(0);
      expect(snap.orders).toHaveLength(2);
      expect(snap.bill.subtotalCents).toBe(2 * 1850 + 510);

      // Live: the table, both screens and the waiters.
      expect(events("cart:updated").at(-1)!.payload).toMatchObject({ cart: [] });
      expect(events("order:created")).toHaveLength(1);
      expect(
        events("kds:order")
          .map((e) => e.rooms[0])
          .sort(),
      ).toEqual(["kds:bar", "kds:kitchen"]);
      expect(events("table:status").at(-1)!.payload).toMatchObject({ number: 3, status: "ordered" });
    });

    it("replays a retried request instead of ordering twice", async () => {
      const before = await db.order.count();
      const retry = await send(g, first.body.cartVersion - 1, firstKey);
      expect(retry.status).toBe(201);
      expect(retry.body).toEqual(first.body);
      expect(await db.order.count()).toBe(before);
      expect(events("order:created")).toHaveLength(0); // no duplicate broadcast
    });

    it("rejects the same key with a different body", async () => {
      expect((await send(g, 999, firstKey)).status).toBe(422);
    });

    it("lets exactly one of two simultaneous 'Send' taps through", async () => {
      await as(g).post("/api/session/cart", { itemId: "item-parmesan-fries", quantity: 1 });
      const v = await version(g);
      const results = await Promise.all([send(g, v), send(g, v), send(g, v)]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
      expect(await db.order.count({ where: { round: 2, session: { table: { number: 3 } } } })).toBe(1);
    });

    it("keeps prices frozen after the menu changes", async () => {
      await db.menuItem.update({ where: { id: "item-double-smash-burger" }, data: { priceCents: 9999 } });
      const snap = (await as(g).get("/api/session")).body.snapshot;
      expect(snap.orders[0].lines[0].unitPriceCents).toBe(1850);
      await db.menuItem.update({ where: { id: "item-double-smash-burger" }, data: { priceCents: 1850 } });
    });

    it("refuses lines that sold out after being added, keeping the cart intact", async () => {
      await as(g).post("/api/session/cart", { itemId: "item-mint-lime-cooler", quantity: 1 });
      const v = await version(g);
      await db.menuItem.update({ where: { id: "item-mint-lime-cooler" }, data: { inStock: false } });
      const res = await send(g, v);
      expect(res.status).toBe(409);
      expect(res.body.error).toMatchObject({ code: "OUT_OF_STOCK", details: { items: ["Mint & Lime Cooler"] } });
      const snap = (await as(g).get("/api/session")).body.snapshot;
      expect(snap.cart).toHaveLength(1);
      expect(snap.version).toBe(v); // nothing half-done
      await db.menuItem.update({ where: { id: "item-mint-lime-cooler" }, data: { inStock: true } });
    });
  });

  // ── cancel & kitchen ───────────────────────────────────────────────────────
  describe("cancel and kitchen display", () => {
    let g = "";
    let kitchen = "";
    beforeAll(async () => {
      g = (await seat(4)).cookie;
      kitchen = await pin("kitchen");
    });
    const order = async () => {
      await as(g).post("/api/session/cart", { itemId: "item-margherita-pizza", quantity: 1 });
      await as(g).post("/api/session/cart", { itemId: "item-house-iced-tea", quantity: 1 });
      return (await send(g, await version(g))).body.tickets as { id: string; station: string; round: number }[];
    };

    it("cancels a whole round while everything is still 'received'", async () => {
      const tickets = await order();
      const res = await as(g).post(`/api/session/orders/${tickets[0]!.id}/cancel`);
      expect(res.status).toBe(200);
      const statuses = (await db.order.findMany({ where: { id: { in: tickets.map((x) => x.id) } } })).map(
        (o) => o.status,
      );
      expect(statuses).toEqual(["CANCELLED", "CANCELLED"]);
      const evts = events("order:updated").map((e) => (e.payload as { version: number }).version);
      expect(evts[1]).toBe(evts[0]! + 1); // consecutive versions, so phones apply both
    });

    it("refuses to cancel once the kitchen has started any part of it", async () => {
      const tickets = await order();
      const food = tickets.find((x) => x.station === "kitchen")!;
      expect((await as(kitchen).patch(`/api/kds/orders/${food.id}/status`, { status: "preparing" })).status).toBe(200);
      const res = await as(g).post(`/api/session/orders/${tickets[1]!.id}/cancel`);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("TOO_LATE_TO_CANCEL");
      const drink = await db.order.findUniqueOrThrow({ where: { id: tickets.find((x) => x.station === "bar")!.id } });
      expect(drink.status).toBe("RECEIVED"); // all or nothing
    });

    it("lists active tickets for a station, oldest first", async () => {
      const res = await as(kitchen).get("/api/kds/orders?station=kitchen");
      const tickets = res.body.tickets as { station: string; createdAt: string; status: string; tableNumber: number }[];
      expect(tickets.length).toBeGreaterThan(0);
      expect(tickets.every((x) => x.station === "kitchen" && x.status !== "cancelled")).toBe(true);
      const times = tickets.map((x) => x.createdAt);
      expect([...times].sort()).toEqual(times);
      expect(tickets.some((x) => x.tableNumber === 4)).toBe(true);
    });

    it("moves one step at a time and tells the guests", async () => {
      const tickets = await order();
      const id = tickets[0]!.id;
      expect((await as(kitchen).patch(`/api/kds/orders/${id}/status`, { status: "ready" })).body.error.code).toBe(
        "INVALID_TRANSITION",
      );
      rt.clear();
      await as(kitchen).patch(`/api/kds/orders/${id}/status`, { status: "preparing" });
      await as(kitchen).patch(`/api/kds/orders/${id}/status`, { status: "ready" });
      const served = await as(kitchen).patch(`/api/kds/orders/${id}/status`, { status: "served" });
      expect(served.body.ticket.status).toBe("served");
      expect(events("order:updated").map((e) => (e.payload as { status: string }).status)).toEqual([
        "preparing",
        "ready",
        "served",
      ]);
      const row = await db.order.findUniqueOrThrow({ where: { id } });
      expect(row.preparingAt && row.readyAt && row.servedAt).toBeTruthy();
      expect(await db.auditLog.count({ where: { action: "order.status_changed", entityId: id } })).toBe(3);
    });

    it("tells waiters when a ticket is ready and lets them mark it served", async () => {
      const waiter = await pin("waiter");
      const id = (await order())[0]!.id;
      await as(kitchen).patch(`/api/kds/orders/${id}/status`, { status: "preparing" });
      const ids = async () =>
        (await as(waiter).get("/api/waiter/ready-orders")).body.tickets.map((x: { id: string }) => x.id);
      expect(await ids()).not.toContain(id);
      expect((await as(waiter).post(`/api/waiter/orders/${id}/served`)).body.error.code).toBe("INVALID_TRANSITION");

      rt.clear();
      await as(kitchen).patch(`/api/kds/orders/${id}/status`, { status: "ready" });
      expect(events("kds:order").at(-1)!.rooms).toContain("waiters");
      expect(await ids()).toContain(id);

      expect((await as(kitchen).post(`/api/waiter/orders/${id}/served`)).status).toBe(403);
      const served = await as(waiter).post(`/api/waiter/orders/${id}/served`);
      expect(served.body.ticket.status).toBe("served");
      expect(await ids()).not.toContain(id);
    });

    it("lets only one of two screens advance the same ticket", async () => {
      const tickets = await order();
      const id = tickets[0]!.id;
      const both = await Promise.all([
        as(kitchen).patch(`/api/kds/orders/${id}/status`, { status: "preparing" }),
        as(kitchen).patch(`/api/kds/orders/${id}/status`, { status: "preparing" }),
      ]);
      expect(both.map((r) => r.status).sort()).toEqual([200, 409]);
    });

    it("keeps waiters and guests away from the kitchen screen", async () => {
      expect((await as(await pin("waiter")).get("/api/kds/orders")).status).toBe(403);
      expect((await as(g).get("/api/kds/orders")).status).toBe(401);
    });

    it("kitchen marks an item out of stock — live for every guest", async () => {
      const res = await as(kitchen).patch("/api/menu/items/item-classic-tiramisu/stock", { inStock: false });
      expect(res.status).toBe(200);
      expect(events("menu:stock").at(-1)).toMatchObject({
        rooms: ["everyone"],
        payload: { itemId: "item-classic-tiramisu", inStock: false },
      });
      const menu = (await request(app).get("/api/menu")).body;
      expect(menu.items.find((i: { id: string }) => i.id === "item-classic-tiramisu").inStock).toBe(false);
      expect(
        (await as(g).post("/api/session/cart", { itemId: "item-classic-tiramisu", quantity: 1 })).body.error.code,
      ).toBe("OUT_OF_STOCK");
      await as(kitchen).patch("/api/menu/items/item-classic-tiramisu/stock", { inStock: true });
    });

    // ── stock toggle: ordering, races, live updates ─────────────────────────
    const stockOf = (id: string) =>
      db.menuItem.findUniqueOrThrow({ where: { id }, select: { inStock: true, stockVersion: true } });

    it("stock toggle returns and broadcasts a version that goes up with every change", async () => {
      const id = "item-classic-tiramisu";
      const before = await stockOf(id);
      const off = await as(kitchen).patch(`/api/menu/items/${id}/stock`, { inStock: false });
      const on = await as(kitchen).patch(`/api/menu/items/${id}/stock`, { inStock: true });
      expect(off.body).toMatchObject({ itemId: id, inStock: false, stockVersion: before.stockVersion + 1 });
      expect(on.body).toMatchObject({ itemId: id, inStock: true, stockVersion: before.stockVersion + 2 });
      // Only the changed item is pushed — no full "menu:updated" reload for anyone.
      expect(events("menu:stock").map((e) => e.payload)).toEqual([
        { itemId: id, inStock: false, stockVersion: before.stockVersion + 1 },
        { itemId: id, inStock: true, stockVersion: before.stockVersion + 2 },
      ]);
      expect(events("menu:updated")).toHaveLength(0);
      // Guests' menu carries the same version, so a reload and the live feed agree.
      const menu = (await request(app).get("/api/menu")).body;
      expect(menu.items.find((i: { id: string }) => i.id === id)).toMatchObject({
        inStock: true,
        stockVersion: before.stockVersion + 2,
      });
    });

    it("rapid toggles: the database ends on the last value sent, and the newest event says so", async () => {
      const id = "item-house-iced-tea";
      for (const inStock of [false, true, false, true, false]) {
        expect((await as(kitchen).patch(`/api/menu/items/${id}/stock`, { inStock })).status).toBe(200);
      }
      const row = await stockOf(id);
      expect(row.inStock).toBe(false);
      const newest = events("menu:stock").reduce((a, b) =>
        (b.payload as { stockVersion: number }).stockVersion > (a.payload as { stockVersion: number }).stockVersion
          ? b
          : a,
      );
      expect(newest.payload).toMatchObject({ itemId: id, inStock: row.inStock, stockVersion: row.stockVersion });
      await as(kitchen).patch(`/api/menu/items/${id}/stock`, { inStock: true });
    });

    it("two users toggling at once: versions are unique and the highest one matches the database", async () => {
      const id = "item-margherita-pizza";
      const manager = cookie(await request(app).post("/api/auth/login").set("Origin", ORIGIN).send(TEST_MANAGER));
      const results = await Promise.all([
        as(kitchen).patch(`/api/menu/items/${id}/stock`, { inStock: false }),
        as(manager).patch(`/api/menu/items/${id}/stock`, { inStock: true }),
        as(kitchen).patch(`/api/menu/items/${id}/stock`, { inStock: false }),
        as(manager).patch(`/api/menu/items/${id}/stock`, { inStock: true }),
      ]);
      expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200]);
      const versions = results.map((r) => r.body.stockVersion as number);
      expect(new Set(versions).size).toBe(4); // the row lock serialised them

      const row = await stockOf(id);
      const latest = results.find((r) => r.body.stockVersion === Math.max(...versions))!;
      expect(latest.body.inStock).toBe(row.inStock);
      expect(row.stockVersion).toBe(Math.max(...versions));
      // A client keeping the highest-version event ends up exactly where the server is.
      const kept = events("menu:stock")
        .map((e) => e.payload as { inStock: boolean; stockVersion: number })
        .sort((a, b) => b.stockVersion - a.stockVersion)[0]!;
      expect(kept).toMatchObject({ inStock: row.inStock, stockVersion: row.stockVersion });
      await as(kitchen).patch(`/api/menu/items/${id}/stock`, { inStock: true });
    });

    it("stock toggle on an unknown item is a 404 and broadcasts nothing", async () => {
      const res = await as(kitchen).patch("/api/menu/items/item-does-not-exist/stock", { inStock: false });
      expect(res.status).toBe(404);
      expect(events("menu:stock")).toHaveLength(0);
    });
  });

  // ── call server ────────────────────────────────────────────────────────────
  describe("call server", () => {
    let g = "";
    let waiter = "";
    beforeAll(async () => {
      g = (await seat(5)).cookie;
      waiter = await pin("waiter");
    });

    it("notifies waiters, then enforces a per-table cooldown", async () => {
      const first = await as(g).post("/api/session/calls", { type: "water" });
      expect(first.status).toBe(201);
      expect(first.body.call).toMatchObject({ type: "water", status: "open", tableNumber: 5 });
      expect(events("call:created")[0]!.rooms).toEqual([expect.stringMatching(/^session:/), "waiters"]);

      const again = await as(g).post("/api/session/calls", { type: "water" });
      expect(again.status).toBe(429);
      expect(again.body.error.details.retryAfterSeconds).toBeGreaterThan(50);

      // Another phone at the same table shares the cooldown.
      const friend = (await seat(5, true)).cookie;
      expect((await as(friend).post("/api/session/calls", { type: "water" })).status).toBe(429);
    });

    it("is race-free when several phones tap at once", async () => {
      const results = await Promise.all(
        Array.from({ length: 5 }, () => as(g).post("/api/session/calls", { type: "assistance" })),
      );
      expect(results.map((r) => r.status).sort()).toEqual([201, 429, 429, 429, 429]);
    });

    it("waiters see open calls and mark them handled; guests get the update", async () => {
      const list = await as(waiter).get("/api/waiter/calls");
      expect(list.body.calls.map((c: { type: string }) => c.type).sort()).toEqual(["assistance", "water"]);
      const id = list.body.calls[0].id;
      rt.clear();
      const res = await as(waiter).post(`/api/waiter/calls/${id}/handle`);
      expect(res.body.call.status).toBe("handled");
      expect(events("call:updated")[0]!.payload).toMatchObject({ call: { id, status: "handled" } });
      expect((await as(waiter).post(`/api/waiter/calls/${id}/handle`)).body.error.code).toBe("ALREADY_HANDLED");
    });

    it("a bill request shows on the table status", async () => {
      await as(g).post("/api/session/calls", { type: "bill" });
      const tables = (await as(waiter).get("/api/waiter/tables")).body.tables;
      expect(tables.find((x: { number: number }) => x.number === 5)).toMatchObject({
        status: "billRequested",
        session: { guestCount: 2 },
      });
    });
  });
});
