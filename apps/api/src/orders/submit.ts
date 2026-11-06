import { canTransition, type OrderStatus } from "@app/shared";
import { rooms, type OrderTicketDTO } from "@app/shared/api";
import { audit } from "../audit.ts";
import type { Db } from "../db.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import type { OrderStatus as DbOrderStatus, Station } from "../generated/prisma/enums.ts";
import { ApiError, errors } from "../http/errors.ts";
import { enums } from "../lib/enums.ts";
import type { Realtime } from "../realtime/types.ts";
import { bumpVersion, emitTableStatus, type AuthedGuest } from "../sessions/service.ts";
import { readSelection } from "../sessions/snapshot.ts";
import { checkSelection, loadOrderable } from "./catalog.ts";
import { emitTicket, ticketInclude, toTicketDTO } from "./tickets.ts";

type Tx = Prisma.TransactionClient;

export interface SubmitResult {
  /** Version after the cart was emptied. */
  cartVersion: number;
  /** Version after the tickets were created. */
  version: number;
  tickets: OrderTicketDTO[];
}

/**
 * Send the shared cart to the kitchen (runs inside the idempotency transaction).
 *
 *  1. Claim the cart: the session version must still equal `cartVersion`
 *     (atomic compare-and-set) — two guests tapping "Send" at once can't
 *     create two rounds, and nobody sends a cart they haven't seen.
 *  2. Re-check every line against the live menu (stock, availability, options).
 *  3. Create one ticket per station with price/name snapshots; empty the cart.
 */
export async function submitOrder(tx: Tx, guest: AuthedGuest, cartVersion: number): Promise<SubmitResult> {
  const claimed = await tx.tableSession.updateMany({
    where: { id: guest.sessionId, status: "OPEN", version: cartVersion },
    data: { version: { increment: 1 }, lastActivityAt: new Date() },
  });
  if (claimed.count === 0) {
    throw new ApiError(
      409,
      "CART_CHANGED",
      "The order changed while you were looking at it. Please check it and send again.",
    );
  }
  const cart = await tx.cartItem.findMany({
    where: { sessionId: guest.sessionId },
    orderBy: { createdAt: "asc" },
    include: { guest: { select: { nickname: true } } },
  });
  if (cart.length === 0) throw errors.badRequest("CART_EMPTY", "Add something to the order first.");

  const orderable = await loadOrderable(
    tx,
    cart.map((c) => c.itemId),
  );
  const lines = cart.map((c) => {
    const o = orderable.get(c.itemId)!;
    const { selection, unitPriceCents } = checkSelection(o, readSelection(c.selection));
    const modifiers = o.item.modifierGroups.flatMap((g) =>
      (selection[g.id] ?? []).map((id) => {
        const opt = g.options.find((x) => x.id === id)!;
        return { optionId: opt.id, groupName: g.name, optionName: opt.name, priceDeltaCents: opt.priceDelta };
      }),
    );
    return { cart: c, station: o.row.category.station as Station, name: o.row.name, unitPriceCents, modifiers };
  });

  const last = await tx.order.aggregate({ where: { sessionId: guest.sessionId }, _max: { round: true } });
  const round = (last._max.round ?? 0) + 1;
  const stations = [...new Set(lines.map((l) => l.station))].sort();

  const orderIds: string[] = [];
  for (const station of stations) {
    const order = await tx.order.create({
      data: {
        sessionId: guest.sessionId,
        round,
        station,
        placedByGuestId: guest.id,
        items: {
          create: lines
            .filter((l) => l.station === station)
            .map((l) => ({
              itemId: l.cart.itemId,
              name: l.name,
              unitPriceCents: l.unitPriceCents,
              quantity: l.cart.quantity,
              note: l.cart.note,
              addedByGuestId: l.cart.guestId,
              addedByName: l.cart.guest.nickname,
              modifiers: { create: l.modifiers },
            })),
        },
      },
    });
    orderIds.push(order.id);
  }
  await tx.cartItem.deleteMany({ where: { sessionId: guest.sessionId } });
  const version = await bumpVersion(tx, guest.sessionId);
  await audit(tx, {
    actor: { type: "guest", guestId: guest.id },
    action: "order.placed",
    entityType: "table_session",
    entityId: guest.sessionId,
    data: { round, orderIds, lines: lines.length },
  });

  const orders = await tx.order.findMany({
    where: { id: { in: orderIds } },
    include: ticketInclude,
    orderBy: { station: "asc" },
  });
  return { cartVersion: cartVersion + 1, version, tickets: orders.map(toTicketDTO) };
}

/** After commit: tell the table, the kitchen screens and the staff. */
export async function publishSubmit(db: Db, realtime: Realtime, sessionId: string, tableId: string, r: SubmitResult) {
  realtime.emit(rooms.session(sessionId), "cart:updated", { version: r.cartVersion, cart: [] });
  realtime.emit(rooms.session(sessionId), "order:created", { version: r.version, tickets: r.tickets });
  for (const t of r.tickets) emitTicket(realtime, t);
  await emitTableStatus(db, realtime, tableId);
}

/**
 * Guest cancels a whole round — only while EVERY ticket of it is still
 * "received". If the kitchen started any part, nothing is cancelled.
 */
export async function cancelRound(db: Db, realtime: Realtime, guest: AuthedGuest, orderId: string) {
  const anyTicket = await db.order.findFirst({ where: { id: orderId, sessionId: guest.sessionId } });
  if (!anyTicket) throw errors.notFound("Order");

  const changes = await db.$transaction(async (tx) => {
    const tickets = await tx.order.findMany({ where: { sessionId: guest.sessionId, round: anyTicket.round } });
    const res = await tx.order.updateMany({
      where: { sessionId: guest.sessionId, round: anyTicket.round, status: "RECEIVED" },
      data: { status: "CANCELLED", cancelledAt: new Date(), statusChangedAt: new Date() },
    });
    if (res.count !== tickets.length) {
      throw new ApiError(
        409,
        "TOO_LATE_TO_CANCEL",
        "The kitchen has already started this order, so it can't be cancelled. Please ask a member of staff.",
      );
    }
    const out: { id: string; version: number }[] = [];
    for (const t of tickets) out.push({ id: t.id, version: await bumpVersion(tx, guest.sessionId) });
    await audit(tx, {
      actor: { type: "guest", guestId: guest.id },
      action: "order.cancelled",
      entityType: "table_session",
      entityId: guest.sessionId,
      data: { round: anyTicket.round },
    });
    return out;
  });

  const tickets = await db.order.findMany({ where: { id: { in: changes.map((c) => c.id) } }, include: ticketInclude });
  for (const c of changes) {
    const t = toTicketDTO(tickets.find((x) => x.id === c.id)!);
    realtime.emit(rooms.session(guest.sessionId), "order:updated", {
      version: c.version,
      orderId: t.id,
      round: t.round,
      station: t.station,
      status: t.status,
      at: t.statusChangedAt,
    });
    emitTicket(realtime, t);
  }
  await emitTableStatus(db, realtime, guest.tableId);
  return { round: anyTicket.round, version: changes.at(-1)!.version };
}

const STAMP: Partial<Record<DbOrderStatus, "preparingAt" | "readyAt" | "servedAt" | "cancelledAt">> = {
  PREPARING: "preparingAt",
  READY: "readyAt",
  SERVED: "servedAt",
  CANCELLED: "cancelledAt",
};

/**
 * Kitchen moves a ticket one step forward (or cancels it while received).
 * Compare-and-set on the current status, so two screens can't skip a step.
 */
export async function updateTicketStatus(
  db: Db,
  realtime: Realtime,
  orderId: string,
  to: OrderStatus,
  staffId: string,
  ip?: string,
) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { session: { select: { tableId: true } } },
  });
  if (!order) throw errors.notFound("Order");
  const from = enums.orderStatus.fromDb(order.status);
  if (!canTransition(from, to)) {
    throw new ApiError(409, "INVALID_TRANSITION", `A ${from} order can't become ${to}.`, { from, to });
  }
  const dbTo = enums.orderStatus.toDb(to);
  const now = new Date();
  const version = await db.$transaction(async (tx) => {
    const res = await tx.order.updateMany({
      where: { id: orderId, status: order.status },
      data: { status: dbTo, statusChangedAt: now, ...(STAMP[dbTo] ? { [STAMP[dbTo]!]: now } : {}) },
    });
    if (res.count === 0) throw new ApiError(409, "STALE_STATUS", "Someone else just updated this order. Refreshing.");
    await audit(tx, {
      actor: { type: "staff", staffId },
      action: "order.status_changed",
      entityType: "order",
      entityId: orderId,
      data: { from, to },
      ip,
    });
    return bumpVersion(tx, order.sessionId);
  });

  const full = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: ticketInclude });
  const ticket = toTicketDTO(full);
  realtime.emit(rooms.session(order.sessionId), "order:updated", {
    version,
    orderId,
    round: ticket.round,
    station: ticket.station,
    status: ticket.status,
    at: ticket.statusChangedAt,
  });
  emitTicket(realtime, ticket);
  await emitTableStatus(db, realtime, order.session.tableId);
  return ticket;
}
