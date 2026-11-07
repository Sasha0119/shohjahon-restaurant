import { createHmac, timingSafeEqual } from "node:crypto";
import { brand } from "@app/config";
import {
  RESERVATION_COOK_ALERT_MINUTES,
  RESERVATION_GRACE_MINUTES,
  RESERVATION_SEAT_EARLY_MINUTES,
  bookingRefund,
} from "@app/shared";
import { rooms, type BookingChange, type BookingTicketDTO, type CreateReservationBody } from "@app/shared/api";
import { audit } from "../audit.ts";
import type { PaymentProvider } from "../billing/provider.ts";
import type { Db } from "../db.ts";
import { Prisma } from "../generated/prisma/client.ts";
import type { Station } from "../generated/prisma/enums.ts";
import { ApiError, errors } from "../http/errors.ts";
import { enums } from "../lib/enums.ts";
import { checkSelection, loadOrderable } from "../orders/catalog.ts";
import { emitTicket, ticketInclude, toTicketDTO } from "../orders/tickets.ts";
import type { Realtime } from "../realtime/types.ts";
import { emitTableStatus } from "../sessions/service.ts";

const MINUTE = 60_000;

/** A booking whose payment never finished stops holding its table after this long. */
const UNPAID_HOLD_MINUTES = 15;

interface BookingModifier {
  optionId: string;
  groupName: string;
  optionName: string;
  priceDeltaCents: number;
}

export interface PricedDish {
  itemId: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  note: string | null;
  station: Station;
  modifiers: BookingModifier[];
}

/**
 * The guest's link for viewing or cancelling their booking, signed so it needs
 * nothing stored and can't be guessed from a booking id.
 */
export function bookingLinkToken(secret: string, reservationId: string): string {
  return `${reservationId}.${sign(secret, reservationId)}`;
}

function sign(secret: string, reservationId: string): string {
  return createHmac("sha256", secret).update(`booking-link:v1:${reservationId}`).digest("base64url");
}

/** The booking a link belongs to, or null if the link isn't genuine. */
export function reservationIdFromLink(secret: string, token: string): string | null {
  const [id, signature, extra] = token.split(".");
  if (!id || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(secret, id));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given) ? id : null;
}

/** Price the chosen dishes from the live menu, checking they can be served at the booked time. */
export async function priceDishes(
  db: Db,
  dishes: CreateReservationBody["items"],
  arrival: Date,
): Promise<{ dishes: PricedDish[]; totalCents: number }> {
  const orderable = await loadOrderable(
    db,
    dishes.map((d) => d.itemId),
    arrival,
  );
  const priced = dishes.map((d) => {
    const o = orderable.get(d.itemId)!;
    const { selection, unitPriceCents } = checkSelection(o, d.selection);
    return {
      itemId: d.itemId,
      name: o.row.name,
      unitPriceCents,
      quantity: d.quantity,
      note: d.note?.trim() || null,
      station: o.row.category.station as Station,
      modifiers: o.item.modifierGroups.flatMap((g) =>
        (selection[g.id] ?? []).map((id) => {
          const option = g.options.find((x) => x.id === id)!;
          return {
            optionId: option.id,
            groupName: g.name,
            optionName: option.name,
            priceDeltaCents: option.priceDelta,
          };
        }),
      ),
    };
  });
  return { dishes: priced, totalCents: priced.reduce((n, d) => n + d.unitPriceCents * d.quantity, 0) };
}

const bookingInclude = {
  table: { select: { number: true } },
  items: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.ReservationInclude;

type BookingRow = Prisma.ReservationGetPayload<{ include: typeof bookingInclude }>;

const readModifiers = (json: unknown): BookingModifier[] => (Array.isArray(json) ? (json as BookingModifier[]) : []);

/** What the kitchen sees: no guest name or phone. */
export function toBookingTicket(r: BookingRow): BookingTicketDTO {
  return {
    id: r.id,
    tableNumber: r.table.number,
    partySize: r.partySize,
    startsAt: r.startsAt.toISOString(),
    cookAt: new Date(r.startsAt.getTime() - RESERVATION_COOK_ALERT_MINUTES * MINUTE).toISOString(),
    lines: r.items.map((i) => ({
      id: i.id,
      itemId: i.itemId,
      name: i.name,
      quantity: i.quantity,
      unitPriceCents: i.unitPriceCents,
      modifiers: readModifiers(i.modifiers).map((m) => ({
        group: m.groupName,
        option: m.optionName,
        priceDeltaCents: m.priceDeltaCents,
      })),
      note: i.note,
      addedBy: "",
      station: enums.station.fromDb(i.station),
    })),
  };
}

function emitBooking(realtime: Realtime, change: BookingChange, r: BookingRow) {
  const stations = [...new Set(r.items.map((i) => enums.station.fromDb(i.station)))];
  realtime.emit([rooms.managers, ...stations.map(rooms.kds)], "kds:booking", { change, booking: toBookingTicket(r) });
}

/** The bookings the kitchen should know about, soonest first. */
export async function upcomingBookings(db: Db, now = new Date()): Promise<BookingTicketDTO[]> {
  const rows = await db.reservation.findMany({
    where: {
      status: "ACTIVE",
      startsAt: { gte: new Date(now.getTime() - RESERVATION_GRACE_MINUTES * MINUTE) },
      items: { some: {} },
    },
    orderBy: { startsAt: "asc" },
    take: 100,
    include: bookingInclude,
  });
  return rows.map(toBookingTicket);
}

/**
 * Take the deposit for a booking already holding its table. Safe to repeat on a
 * retried request: the provider is idempotent on the deposit id, and only a
 * pending deposit is ever charged. On success the kitchen is told straight away.
 */
export async function chargeDeposit(
  db: Db,
  realtime: Realtime,
  provider: PaymentProvider,
  reservationId: string,
): Promise<void> {
  const deposit = await db.reservationDeposit.findUniqueOrThrow({ where: { reservationId } });
  if (deposit.status === "PENDING") {
    let outcome: Awaited<ReturnType<PaymentProvider["charge"]>>;
    try {
      outcome =
        deposit.amountCents === 0
          ? { status: "succeeded", providerRef: null }
          : await provider.charge({
              paymentId: deposit.id,
              amountCents: deposit.amountCents,
              currency: brand.currency.code,
              method: enums.paymentMethod.fromDb(deposit.method) as "card" | "applePay" | "googlePay",
              description: `${brand.name} — table booking deposit`,
            });
    } catch {
      outcome = { status: "failed", providerRef: null, reason: "provider_unavailable" };
    }
    const paid = outcome.status === "succeeded";
    const settled = await db.$transaction(async (tx) => {
      const claimed = await tx.reservationDeposit.updateMany({
        where: { id: deposit.id, status: "PENDING" },
        data: paid
          ? { status: "PAID", providerRef: outcome.providerRef, paidAt: new Date() }
          : {
              status: "FAILED",
              providerRef: outcome.providerRef,
              failureReason: outcome.status === "failed" ? outcome.reason : null,
            },
      });
      if (claimed.count === 0) return false;
      await tx.reservation.update({
        where: { id: reservationId },
        data: paid ? { status: "ACTIVE" } : { status: "CANCELLED", cancelledAt: new Date() },
      });
      await audit(tx, {
        actor: { type: "system" },
        action: paid ? "reservation.deposit_paid" : "reservation.deposit_failed",
        entityType: "reservation",
        entityId: reservationId,
        data: { amountCents: deposit.amountCents },
      });
      return true;
    });
    if (settled) {
      const row = await db.reservation.findUniqueOrThrow({ where: { id: reservationId }, include: bookingInclude });
      await emitTableStatus(db, realtime, row.tableId);
      if (paid) emitBooking(realtime, "new", row);
    }
  }
  const final = await db.reservationDeposit.findUniqueOrThrow({ where: { id: deposit.id } });
  if (final.status === "FAILED") {
    throw new ApiError(402, "BOOKING_PAYMENT_FAILED", "The payment didn't go through, so the table wasn't booked.");
  }
}

/** Send a recorded refund to the provider. If it fails it stays pending and the sweeper retries. */
async function sendRefund(db: Db, provider: PaymentProvider, depositId: string): Promise<boolean> {
  const deposit = await db.reservationDeposit.findUniqueOrThrow({ where: { id: depositId } });
  if (deposit.refundStatus !== "PENDING") return true;
  try {
    await provider.refund({
      paymentId: deposit.id,
      providerRef: deposit.providerRef,
      amountCents: deposit.refundCents,
      currency: brand.currency.code,
    });
  } catch {
    return false;
  }
  await db.reservationDeposit.update({
    where: { id: deposit.id },
    data: { refundStatus: "DONE", refundedAt: new Date() },
  });
  return true;
}

export async function cancelBooking(
  db: Db,
  realtime: Realtime,
  provider: PaymentProvider,
  reservationId: string,
  by: { staffId?: string; ip?: string; now?: Date },
): Promise<{ refundCents: number }> {
  const now = by.now ?? new Date();
  const { refundCents, depositId } = await db.$transaction(async (tx) => {
    const claimed = await tx.reservation.updateMany({
      where: { id: reservationId, status: "ACTIVE" },
      data: { status: "CANCELLED", cancelledAt: now },
    });
    if (claimed.count === 0) throw errors.conflict("ALREADY_CANCELLED", "This reservation is already cancelled.");
    const row = await tx.reservation.findUniqueOrThrow({ where: { id: reservationId }, include: { deposit: true } });
    const paid = row.deposit?.status === "PAID" ? row.deposit.amountCents : 0;
    const refund = bookingRefund(paid, row.startsAt, now);
    if (row.deposit && refund > 0) {
      await tx.reservationDeposit.update({
        where: { id: row.deposit.id },
        data: { refundCents: refund, refundStatus: "PENDING" },
      });
    }
    await audit(tx, {
      actor: by.staffId ? { type: "staff", staffId: by.staffId } : { type: "system" },
      action: "reservation.cancelled",
      entityType: "reservation",
      entityId: reservationId,
      data: { refundCents: refund, depositCents: paid },
      ip: by.ip,
    });
    return { refundCents: refund, depositId: row.deposit?.id };
  });

  if (refundCents > 0 && depositId) await sendRefund(db, provider, depositId);
  const row = await db.reservation.findUniqueOrThrow({ where: { id: reservationId }, include: bookingInclude });
  await emitTableStatus(db, realtime, row.tableId);
  if (row.items.length) emitBooking(realtime, "removed", row);
  return { refundCents };
}

/**
 * The guest has arrived: open the table's visit with the chosen dishes on its
 * tickets and bill, and the deposit counted as paid. The first guest to scan the
 * table's QR then joins this visit without needing a PIN.
 */
export async function seatBooking(
  db: Db,
  realtime: Realtime,
  reservationId: string,
  by: { staffId: string; ip?: string; now?: Date },
): Promise<{ sessionId: string }> {
  const now = by.now ?? new Date();
  const result = await db
    .$transaction(async (tx) => {
      const row = await tx.reservation.findUnique({
        where: { id: reservationId },
        include: { items: { orderBy: { createdAt: "asc" } }, deposit: true },
      });
      if (!row) throw errors.notFound("Reservation");
      if (row.startsAt.getTime() - now.getTime() > RESERVATION_SEAT_EARLY_MINUTES * MINUTE) {
        throw errors.conflict("TOO_EARLY_TO_SEAT", "This booking is too far away to seat yet.");
      }
      const claimed = await tx.reservation.updateMany({
        where: { id: reservationId, status: "ACTIVE" },
        data: { status: "SEATED", seatedAt: now },
      });
      if (claimed.count === 0) throw errors.conflict("ALREADY_CANCELLED", "This reservation is no longer active.");

      // The partial unique index allows one open visit per table; see the catch below.
      const session = await tx.tableSession.create({
        data: { tableId: row.tableId, openedAt: now, lastActivityAt: now },
      });
      // Started once the kitchen was told to start; otherwise it starts like any new order.
      const cooking = row.cookAlertedAt !== null;
      const orderIds: string[] = [];
      for (const station of [...new Set(row.items.map((i) => i.station))].sort()) {
        const order = await tx.order.create({
          data: {
            sessionId: session.id,
            round: 1,
            station,
            status: cooking ? "PREPARING" : "RECEIVED",
            ...(cooking ? { preparingAt: now } : {}),
            statusChangedAt: now,
            items: {
              create: row.items
                .filter((i) => i.station === station)
                .map((i) => ({
                  itemId: i.itemId,
                  name: i.name,
                  unitPriceCents: i.unitPriceCents,
                  quantity: i.quantity,
                  note: i.note,
                  modifiers: { create: readModifiers(i.modifiers) },
                })),
            },
          },
        });
        orderIds.push(order.id);
      }
      if (row.deposit?.status === "PAID" && row.deposit.amountCents > 0) {
        await tx.payment.create({
          data: {
            sessionId: session.id,
            amountCents: row.deposit.amountCents,
            method: row.deposit.method,
            splitMode: "CUSTOM",
            status: "SUCCEEDED",
            provider: row.deposit.provider,
            idempotencyKey: `deposit:${row.deposit.id}`,
            completedAt: now,
          },
        });
      }
      await audit(tx, {
        actor: { type: "staff", staffId: by.staffId },
        action: "reservation.seated",
        entityType: "reservation",
        entityId: reservationId,
        data: { sessionId: session.id },
        ip: by.ip,
      });
      return { sessionId: session.id, tableId: row.tableId, orderIds };
    })
    .catch((e: unknown) => {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw errors.conflict("TABLE_BUSY", "Someone is still at this table. Close their visit first.");
      }
      throw e;
    });

  const tickets = await db.order.findMany({ where: { id: { in: result.orderIds } }, include: ticketInclude });
  for (const t of tickets) emitTicket(realtime, toTicketDTO(t));
  await emitTableStatus(db, realtime, result.tableId);
  const row = await db.reservation.findUniqueOrThrow({ where: { id: reservationId }, include: bookingInclude });
  if (row.items.length) emitBooking(realtime, "removed", row);
  return { sessionId: result.sessionId };
}

/**
 * Background work, run every minute: tell the kitchen when to start cooking,
 * release tables held by unfinished payments, retry refunds, and delete old
 * bookings. Deposit records stay (they hold no personal data).
 */
export async function sweepBookings(
  db: Db,
  realtime: Realtime,
  provider: PaymentProvider,
  retentionDays: number,
  now = new Date(),
): Promise<{ cookAlerts: number; released: number; purged: number }> {
  const due = await db.reservation.findMany({
    where: {
      status: "ACTIVE",
      cookAlertedAt: null,
      items: { some: {} },
      startsAt: {
        gte: new Date(now.getTime() - RESERVATION_GRACE_MINUTES * MINUTE),
        lte: new Date(now.getTime() + RESERVATION_COOK_ALERT_MINUTES * MINUTE),
      },
    },
    include: bookingInclude,
  });
  let cookAlerts = 0;
  for (const row of due) {
    const claimed = await db.reservation.updateMany({
      where: { id: row.id, status: "ACTIVE", cookAlertedAt: null },
      data: { cookAlertedAt: now },
    });
    if (claimed.count === 1) {
      cookAlerts++;
      emitBooking(realtime, "cook", row);
    }
  }

  const unpaidBefore = new Date(now.getTime() - UNPAID_HOLD_MINUTES * MINUTE);
  const abandoned = await db.reservation.findMany({
    where: { status: "PENDING", createdAt: { lt: unpaidBefore } },
    select: { id: true, tableId: true },
  });
  for (const row of abandoned) {
    await db.$transaction([
      db.reservationDeposit.updateMany({
        where: { reservationId: row.id, status: "PENDING" },
        data: { status: "FAILED", failureReason: "abandoned" },
      }),
      db.reservation.updateMany({
        where: { id: row.id, status: "PENDING" },
        data: { status: "CANCELLED", cancelledAt: now },
      }),
    ]);
    await emitTableStatus(db, realtime, row.tableId);
  }

  const refunds = await db.reservationDeposit.findMany({ where: { refundStatus: "PENDING" }, select: { id: true } });
  for (const r of refunds) await sendRefund(db, provider, r.id);

  const { count: purged } = await db.reservation.deleteMany({
    where: { startsAt: { lt: new Date(now.getTime() - retentionDays * 24 * 60 * MINUTE) } },
  });
  return { cookAlerts, released: abandoned.length, purged };
}
