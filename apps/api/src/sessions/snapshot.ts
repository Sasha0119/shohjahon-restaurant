import type { ModifierSelection } from "@app/shared";
import type { BillDTO, CartLineDTO, OrderTicketDTO, SessionSnapshotDTO } from "@app/shared/api";
import type { Db } from "../db.ts";
import { enums } from "../lib/enums.ts";
import { ticketInclude, toTicketDTO } from "../orders/tickets.ts";
import { computeSessionBill } from "../billing/bill.ts";

/** Selection JSON from the DB, defensively narrowed. */
export function readSelection(json: unknown): ModifierSelection {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const out: ModifierSelection = {};
  for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
    if (Array.isArray(v)) out[k] = v.filter((x): x is string => typeof x === "string");
  }
  return out;
}

/** Base price + chosen (active) options, for one unit. */
export function cartUnitPrice(
  item: { priceCents: number; modifierGroups: { id: string; options: { id: string; priceDeltaCents: number; active: boolean }[] }[] },
  selection: ModifierSelection,
): number {
  let price = item.priceCents;
  for (const g of item.modifierGroups) {
    for (const id of selection[g.id] ?? []) {
      const o = g.options.find((x) => x.id === id && x.active);
      if (o) price += o.priceDeltaCents;
    }
  }
  return price;
}

/** The authoritative bill (see billing/bill.ts). */
export async function buildBill(db: Db, sessionId: string): Promise<BillDTO> {
  return (await computeSessionBill(db, sessionId)).dto;
}

export async function buildCart(db: Db, sessionId: string): Promise<CartLineDTO[]> {
  const cart = await db.cartItem.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    include: {
      guest: { select: { nickname: true } },
      item: { select: { priceCents: true, modifierGroups: { select: { id: true, options: { select: { id: true, priceDeltaCents: true, active: true } } } } } },
    },
  });
  return cart.map((c) => {
    const selection = readSelection(c.selection);
    return {
      id: c.id,
      itemId: c.itemId,
      quantity: c.quantity,
      selection,
      note: c.note,
      guestId: c.guestId,
      addedBy: c.guest.nickname,
      unitPriceCents: cartUnitPrice(c.item, selection),
      updatedAt: c.updatedAt.toISOString(),
    };
  });
}

export async function buildTickets(db: Db, sessionId: string): Promise<OrderTicketDTO[]> {
  const orders = await db.order.findMany({
    where: { sessionId },
    orderBy: [{ round: "asc" }, { station: "asc" }],
    include: ticketInclude,
  });
  return orders.map(toTicketDTO);
}

/** Everything one guest's phone needs to render the table's state. */
export async function buildSnapshot(db: Db, sessionId: string, guestId: string): Promise<SessionSnapshotDTO> {
  const session = await db.tableSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: {
      table: { select: { id: true, number: true, label: true } },
      guests: { select: { id: true, nickname: true }, orderBy: { createdAt: "asc" } },
      calls: { where: { status: "OPEN" }, orderBy: { createdAt: "asc" } },
    },
  });
  const me = session.guests.find((g) => g.id === guestId) ?? { id: guestId, nickname: "" };
  const [cart, orders, bill] = await Promise.all([
    buildCart(db, sessionId),
    buildTickets(db, sessionId),
    buildBill(db, sessionId),
  ]);
  return {
    sessionId: session.id,
    version: session.version,
    table: session.table,
    me,
    guests: session.guests,
    cart,
    orders,
    calls: session.calls.map((c) => ({
      id: c.id,
      type: enums.callType.fromDb(c.type),
      status: c.status === "OPEN" ? "open" : "handled",
      tableNumber: session.table.number,
      createdAt: c.createdAt.toISOString(),
      amountCents: c.amountCents,
      paymentId: c.paymentId,
    })),
    bill,
    status: session.status === "OPEN" ? "open" : "closed",
    closeReason: session.closeReason ? (session.closeReason.toLowerCase() as "paid" | "staff" | "expired") : null,
  };
}
