import { brand } from "@app/config";
import {
  RESERVATION_GRACE_MINUTES,
  RESERVATION_MAX_DAYS_AHEAD,
  RESERVATION_MAX_PER_PHONE,
  RESERVATION_MIN_NOTICE_MINUTES,
  RESERVATION_MINUTES,
  bookableTimes,
  bookingDeposit,
  bookingRefund,
  normalizePhone,
  reservationInstant,
} from "@app/shared";
import { createReservationBody, zBookingLink, zId, type ManagedBookingDTO, type ReservationDTO } from "@app/shared/api";
import type { Prisma } from "../generated/prisma/client.ts";
import type { PaymentProvider } from "../billing/provider.ts";
import type { Env } from "../env.ts";
import { idempotent } from "../http/idempotency.ts";
import { enums } from "../lib/enums.ts";
import {
  bookingLinkToken,
  cancelBooking,
  chargeDeposit,
  priceDishes,
  reservationIdFromLink,
  seatBooking,
  upcomingBookings,
} from "./booking.ts";
import { audit } from "../audit.ts";
import type { Db } from "../db.ts";
import { ApiError, errors, parse } from "../http/errors.ts";
import type { createRegistrar } from "../http/registrar.ts";
import type { Realtime } from "../realtime/types.ts";
import { emitTableStatus } from "../sessions/service.ts";

type On = ReturnType<typeof createRegistrar>["on"];

const MINUTE = 60_000;
/** Bookings run one at a time, so two guests can't both get the last table. Any fixed number works. */
const BOOKING_LOCK = 7_240_001;

/** The next reservation a table's card should show: starting within 24 hours, or just started. */
export function upcomingReservationInclude(now: Date) {
  return {
    where: {
      status: "ACTIVE" as const,
      startsAt: {
        gte: new Date(now.getTime() - RESERVATION_GRACE_MINUTES * MINUTE),
        lt: new Date(now.getTime() + 24 * 60 * MINUTE),
      },
    },
    orderBy: { startsAt: "asc" as const },
    take: 1,
    select: { startsAt: true, partySize: true, guestName: true },
  };
}

export function reservationSummary(r: { startsAt: Date; partySize: number; guestName: string } | undefined) {
  return r ? { startsAt: r.startsAt.toISOString(), partySize: r.partySize, guestName: r.guestName } : null;
}

export function registerReservationRoutes(on: On, db: Db, env: Env, realtime: Realtime, provider: PaymentProvider) {
  const bookingFromLink = async (raw: unknown) => {
    const id = reservationIdFromLink(env.COOKIE_SECRET, parse(zBookingLink, raw));
    const row = id
      ? await db.reservation.findUnique({
          where: { id },
          include: { table: { select: { number: true } }, items: { orderBy: { createdAt: "asc" } }, deposit: true },
        })
      : null;
    if (!row) throw errors.notFound("Reservation");
    return row;
  };

  on("POST", "/api/reservations", async (req, res) => {
    const input = parse(createReservationBody, req.body);
    const now = new Date();
    const startsAt = reservationInstant(input.date, input.time, brand.timezone);
    const earliest = now.getTime() + RESERVATION_MIN_NOTICE_MINUTES * MINUTE;
    const latest = now.getTime() + (RESERVATION_MAX_DAYS_AHEAD + 1) * 24 * 60 * MINUTE;
    if (
      !bookableTimes(brand.openingHours, input.date).includes(input.time) ||
      startsAt.getTime() < earliest ||
      startsAt.getTime() > latest
    ) {
      throw new ApiError(422, "RESERVATION_TIME_INVALID", "We can't take a reservation at this time.");
    }

    const phone = normalizePhone(input.phone);
    const holdStart = new Date(startsAt.getTime() - RESERVATION_MINUTES * MINUTE);
    const holdEnd = new Date(startsAt.getTime() + RESERVATION_MINUTES * MINUTE);
    const startsSoon = startsAt.getTime() < now.getTime() + RESERVATION_MINUTES * MINUTE;

    // Prices come from the menu, never from the guest.
    const { dishes, totalCents } = await priceDishes(db, input.items, startsAt);
    const depositCents = bookingDeposit(totalCents);
    if (input.expectedDepositCents !== undefined && input.expectedDepositCents !== depositCents) {
      throw new ApiError(409, "AMOUNT_CHANGED", "The menu changed. Please check the amount and try again.", {
        depositCents,
      });
    }

    let fresh = false;
    const result = await idempotent(db, req, "reservation.create", phone, async (tx) => {
      fresh = true;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BOOKING_LOCK}::bigint)`;
      const held = await tx.reservation.count({
        where: { guestPhone: phone, status: { in: ["ACTIVE", "PENDING"] }, startsAt: { gt: now } },
      });
      if (held >= RESERVATION_MAX_PER_PHONE) {
        throw new ApiError(429, "TOO_MANY_RESERVATIONS", "This number already has several reservations.");
      }
      // The smallest free table that fits, so big tables stay open for big parties.
      const table = await tx.diningTable.findFirst({
        where: {
          active: true,
          seats: { gte: input.partySize },
          reservations: { none: { status: { in: ["ACTIVE", "PENDING"] }, startsAt: { gt: holdStart, lt: holdEnd } } },
          // Don't promise a table to someone arriving soon while guests are still sitting at it.
          ...(startsSoon ? { sessions: { none: { status: "OPEN" } } } : {}),
        },
        orderBy: [{ seats: "asc" }, { number: "asc" }],
        select: { id: true, number: true },
      });
      if (!table) throw errors.conflict("NO_TABLE_AVAILABLE", "No table is free at this time.");
      const reservation = await tx.reservation.create({
        data: {
          tableId: table.id,
          startsAt,
          partySize: input.partySize,
          guestName: input.name,
          guestPhone: phone,
          status: "PENDING",
          items: {
            create: dishes.map((d) => ({ ...d, modifiers: d.modifiers as unknown as Prisma.InputJsonValue })),
          },
          deposit: {
            create: {
              amountCents: depositCents,
              method: enums.paymentMethod.toDb(input.method),
              provider: provider.name,
            },
          },
        },
      });
      // The name and phone stay out of the audit log.
      await audit(tx, {
        actor: { type: "system" },
        action: "reservation.created",
        entityType: "reservation",
        entityId: reservation.id,
        data: {
          table: table.number,
          startsAt: startsAt.toISOString(),
          partySize: input.partySize,
          dishesCents: totalCents,
          depositCents,
        },
        ip: req.ip,
      });
      return {
        status: 201,
        body: { reservationId: reservation.id, tableId: table.id, tableNumber: table.number },
      };
    });
    const created = result.body as { reservationId: string; tableId: string; tableNumber: number };
    if (fresh) await emitTableStatus(db, realtime, created.tableId); // the table is held while paying
    await chargeDeposit(db, realtime, provider, created.reservationId);

    res.status(201).json({
      reservation: {
        tableNumber: created.tableNumber,
        startsAt: startsAt.toISOString(),
        partySize: input.partySize,
        dishesCents: totalCents,
        depositCents,
        manageToken: bookingLinkToken(env.COOKIE_SECRET, created.reservationId),
      },
    });
  });

  on("GET", "/api/reservations/manage/:token", async (req, res) => {
    res.setHeader("X-Robots-Tag", "noindex");
    res.setHeader("Cache-Control", "private, no-store");
    const row = await bookingFromLink(req.params.token);
    if (row.status === "PENDING") throw errors.notFound("Reservation");
    const depositCents = row.deposit?.status === "PAID" ? row.deposit.amountCents : 0;
    const started = row.startsAt.getTime() <= Date.now();
    const booking: ManagedBookingDTO = {
      tableNumber: row.table.number,
      partySize: row.partySize,
      startsAt: row.startsAt.toISOString(),
      status: row.status === "ACTIVE" ? "active" : row.status === "SEATED" ? "seated" : "cancelled",
      lines: row.items.map((i) => ({
        id: i.id,
        name: i.name,
        quantity: i.quantity,
        unitPriceCents: i.unitPriceCents,
      })),
      dishesCents: row.items.reduce((n, i) => n + i.unitPriceCents * i.quantity, 0),
      depositCents,
      refundCents: row.deposit?.refundCents ?? 0,
      refundIfCancelledCents: started ? null : bookingRefund(depositCents, row.startsAt, new Date()),
    };
    res.json({ booking });
  });

  on("POST", "/api/reservations/manage/:token/cancel", async (req, res) => {
    const row = await bookingFromLink(req.params.token);
    if (row.startsAt.getTime() <= Date.now()) {
      throw errors.conflict("BOOKING_STARTED", "This booking has already started, so it can't be cancelled.");
    }
    res.json(await cancelBooking(db, realtime, provider, row.id, { ip: req.ip }));
  });

  on("GET", "/api/kds/bookings", async (_req, res) => {
    res.json({ bookings: await upcomingBookings(db), serverTime: new Date().toISOString() });
  });

  on("POST", "/api/waiter/reservations/:reservationId/seat", async (req, res) => {
    const id = parse(zId, req.params.reservationId);
    res.json(await seatBooking(db, realtime, id, { staffId: req.staff!.id, ip: req.ip }));
  });

  on("GET", "/api/waiter/reservations", async (_req, res) => {
    const rows = await db.reservation.findMany({
      where: { status: "ACTIVE", startsAt: { gte: new Date(Date.now() - RESERVATION_GRACE_MINUTES * MINUTE) } },
      orderBy: { startsAt: "asc" },
      take: 200,
      include: { table: { select: { number: true } }, deposit: { select: { status: true, amountCents: true } } },
    });
    const reservations: ReservationDTO[] = rows.map((r) => ({
      id: r.id,
      tableId: r.tableId,
      tableNumber: r.table.number,
      startsAt: r.startsAt.toISOString(),
      partySize: r.partySize,
      guestName: r.guestName,
      guestPhone: r.guestPhone,
      depositCents: r.deposit?.status === "PAID" ? r.deposit.amountCents : 0,
    }));
    res.json({ reservations });
  });

  on("POST", "/api/waiter/reservations/:reservationId/cancel", async (req, res) => {
    const id = parse(zId, req.params.reservationId);
    const row = await db.reservation.findUnique({ where: { id }, select: { id: true } });
    if (!row) throw errors.notFound("Reservation");
    const { refundCents } = await cancelBooking(db, realtime, provider, id, { staffId: req.staff!.id, ip: req.ip });
    res.json({ ok: true, refundCents });
  });
}
