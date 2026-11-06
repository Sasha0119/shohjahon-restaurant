import {
  addCartItemBody,
  createCallBody,
  kdsQuery,
  rooms,
  submitOrderBody,
  updateCartItemBody,
  updateOrderStatusBody,
  updateStockBody,
  zId,
} from "@app/shared/api";
import { audit } from "../audit.ts";
import { createCall, handleCall, toCallDTO } from "../calls/service.ts";
import type { Db } from "../db.ts";
import type { Env } from "../env.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { errors, parse } from "../http/errors.ts";
import { idempotent } from "../http/idempotency.ts";
import type { createRegistrar } from "../http/registrar.ts";
import { enums } from "../lib/enums.ts";
import type { Realtime } from "../realtime/types.ts";
import { reservationSummary, upcomingReservationInclude } from "../reservations/routes.ts";
import { tableStatus } from "../sessions/rules.ts";
import { addToCart, removeCartLine, updateCartLine } from "./cart.ts";
import { cancelRound, publishSubmit, submitOrder, updateTicketStatus, type SubmitResult } from "./submit.ts";
import { ticketInclude, toTicketDTO } from "./tickets.ts";

type On = ReturnType<typeof createRegistrar>["on"];

export function registerOrderRoutes(on: On, db: Db, env: Env, realtime: Realtime) {
  // ── guest: shared cart ────────────────────────────────────────────────────
  on("POST", "/api/session/cart", async (req, res) => {
    const body = parse(addCartItemBody, req.body);
    res.status(201).json(await addToCart(db, realtime, req.guest!, body));
  });

  on("PATCH", "/api/session/cart/:cartItemId", async (req, res) => {
    const id = parse(zId, req.params.cartItemId);
    const body = parse(updateCartItemBody, req.body);
    res.json(await updateCartLine(db, realtime, req.guest!, id, body));
  });

  on("DELETE", "/api/session/cart/:cartItemId", async (req, res) => {
    const id = parse(zId, req.params.cartItemId);
    res.json(await removeCartLine(db, realtime, req.guest!, id));
  });

  // ── guest: send to kitchen / cancel ───────────────────────────────────────
  on("POST", "/api/session/orders", async (req, res) => {
    const guest = req.guest!;
    const { cartVersion } = parse(submitOrderBody, req.body);
    let fresh = null as SubmitResult | null;
    const result = await idempotent(
      db,
      req,
      "order.submit",
      guest.id,
      async (tx) => {
        fresh = await submitOrder(tx, guest, cartVersion);
        return { status: 201, body: fresh as unknown as Prisma.InputJsonValue };
      },
      // A retry after a successful first attempt sees "cart changed" — answer with the first result.
      { conflictCodes: ["CART_CHANGED", "CART_EMPTY"] },
    );
    // Only the attempt that actually created the order broadcasts it (replays stay silent).
    if (fresh) await publishSubmit(db, realtime, guest.sessionId, guest.tableId, fresh as SubmitResult);
    res.status(result.status).json(result.body);
  });

  on("POST", "/api/session/orders/:orderId/cancel", async (req, res) => {
    const id = parse(zId, req.params.orderId);
    res.json(await cancelRound(db, realtime, req.guest!, id));
  });

  // ── guest: call server ────────────────────────────────────────────────────
  on("POST", "/api/session/calls", async (req, res) => {
    const { type } = parse(createCallBody, req.body);
    const call = await createCall(db, realtime, req.guest!, enums.callType.toDb(type), env.CALL_COOLDOWN_SECONDS);
    res.status(201).json({ call, cooldownSeconds: env.CALL_COOLDOWN_SECONDS });
  });

  // ── kitchen display ───────────────────────────────────────────────────────
  on("GET", "/api/kds/orders", async (req, res) => {
    const q = parse(kdsQuery, req.query);
    const statuses = (q.status ?? ["received", "preparing", "ready"]).map(enums.orderStatus.toDb);
    const orders = await db.order.findMany({
      where: { status: { in: statuses }, ...(q.station ? { station: enums.station.toDb(q.station) } : {}) },
      orderBy: { createdAt: "asc" },
      take: 300,
      include: ticketInclude,
    });
    res.json({ tickets: orders.map(toTicketDTO), serverTime: new Date().toISOString() });
  });

  on("PATCH", "/api/kds/orders/:orderId/status", async (req, res) => {
    const id = parse(zId, req.params.orderId);
    const { status } = parse(updateOrderStatusBody, req.body);
    res.json({ ticket: await updateTicketStatus(db, realtime, id, status, req.staff!.id, req.ip) });
  });

  on("PATCH", "/api/menu/items/:itemId/stock", async (req, res) => {
    const id = parse(zId, req.params.itemId);
    const { inStock } = parse(updateStockBody, req.body);
    // One atomic UPDATE … RETURNING: the row lock orders concurrent toggles, and the
    // version it returns tells every client which change is the newest.
    const item = await db.menuItem
      .update({ where: { id }, data: { inStock, stockVersion: { increment: 1 } }, select: { name: true, stockVersion: true } })
      .catch((e: unknown) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") throw errors.notFound("Item");
        throw e;
      });
    // Push first (guests and other screens update right away), then write the audit row.
    realtime.emit(rooms.everyone, "menu:stock", { itemId: id, inStock, stockVersion: item.stockVersion });
    await audit(db, {
      actor: { type: "staff", staffId: req.staff!.id },
      action: "menu_item.stock_changed",
      entityType: "menu_item",
      entityId: id,
      data: { inStock },
      ip: req.ip,
    });
    res.json({ itemId: id, name: item.name, inStock, stockVersion: item.stockVersion });
  });

  // ── waiter ────────────────────────────────────────────────────────────────
  on("GET", "/api/waiter/calls", async (_req, res) => {
    const calls = await db.waiterCall.findMany({
      where: { status: "OPEN" },
      orderBy: { createdAt: "asc" },
      take: 200,
      include: { table: { select: { number: true } } },
    });
    res.json({ calls: calls.map(toCallDTO), serverTime: new Date().toISOString() });
  });

  on("POST", "/api/waiter/calls/:callId/handle", async (req, res) => {
    const id = parse(zId, req.params.callId);
    res.json({ call: await handleCall(db, realtime, id, req.staff!.id, req.ip) });
  });

  on("GET", "/api/waiter/tables", async (_req, res) => {
    const tables = await db.diningTable.findMany({
      where: { active: true },
      orderBy: { number: "asc" },
      include: {
        reservations: upcomingReservationInclude(new Date()),
        sessions: {
          where: { status: "OPEN" },
          include: {
            _count: { select: { guests: true, orders: { where: { status: { not: "CANCELLED" } } } } },
            calls: { where: { status: "OPEN" }, select: { type: true } },
          },
        },
      },
    });
    res.json({
      tables: tables.map((t) => {
        const s = t.sessions[0];
        return {
          id: t.id,
          number: t.number,
          label: t.label,
          seats: t.seats,
          status: tableStatus({
            hasOpenSession: !!s,
            hasActiveOrders: (s?._count.orders ?? 0) > 0,
            billRequested: !!s?.calls.some((c) => c.type === "BILL"),
          }),
          session: s
            ? { id: s.id, guestCount: s._count.guests, openedAt: s.openedAt.toISOString(), openCalls: s.calls.length }
            : null,
          reservation: reservationSummary(t.reservations[0]),
        };
      }),
    });
  });
}

