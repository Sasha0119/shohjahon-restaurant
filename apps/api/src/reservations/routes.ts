import { brand } from "@app/config";
import {
  RESERVATION_GRACE_MINUTES,
  RESERVATION_MAX_DAYS_AHEAD,
  RESERVATION_MAX_PER_PHONE,
  RESERVATION_MIN_NOTICE_MINUTES,
  RESERVATION_MINUTES,
  bookableTimes,
  normalizePhone,
  reservationInstant,
} from "@app/shared";
import { createReservationBody, zId, type ReservationDTO } from "@app/shared/api";
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

export function registerReservationRoutes(on: On, db: Db, realtime: Realtime) {
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

    const created = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BOOKING_LOCK}::bigint)`;
      const held = await tx.reservation.count({
        where: { guestPhone: phone, status: "ACTIVE", startsAt: { gt: now } },
      });
      if (held >= RESERVATION_MAX_PER_PHONE) {
        throw new ApiError(429, "TOO_MANY_RESERVATIONS", "This number already has several reservations.");
      }
      // The smallest free table that fits, so big tables stay open for big parties.
      const table = await tx.diningTable.findFirst({
        where: {
          active: true,
          seats: { gte: input.partySize },
          reservations: { none: { status: "ACTIVE", startsAt: { gt: holdStart, lt: holdEnd } } },
          // Don't promise a table to someone arriving soon while guests are still sitting at it.
          ...(startsSoon ? { sessions: { none: { status: "OPEN" } } } : {}),
        },
        orderBy: [{ seats: "asc" }, { number: "asc" }],
        select: { id: true, number: true },
      });
      if (!table) throw errors.conflict("NO_TABLE_AVAILABLE", "No table is free at this time.");
      const reservation = await tx.reservation.create({
        data: { tableId: table.id, startsAt, partySize: input.partySize, guestName: input.name, guestPhone: phone },
      });
      // The name and phone stay out of the audit log.
      await audit(tx, {
        actor: { type: "system" },
        action: "reservation.created",
        entityType: "reservation",
        entityId: reservation.id,
        data: { table: table.number, startsAt: startsAt.toISOString(), partySize: input.partySize },
        ip: req.ip,
      });
      return { tableId: table.id, tableNumber: table.number };
    });

    await emitTableStatus(db, realtime, created.tableId);
    res.status(201).json({
      reservation: { tableNumber: created.tableNumber, startsAt: startsAt.toISOString(), partySize: input.partySize },
    });
  });

  on("GET", "/api/waiter/reservations", async (_req, res) => {
    const rows = await db.reservation.findMany({
      where: { status: "ACTIVE", startsAt: { gte: new Date(Date.now() - RESERVATION_GRACE_MINUTES * MINUTE) } },
      orderBy: { startsAt: "asc" },
      take: 200,
      include: { table: { select: { number: true } } },
    });
    const reservations: ReservationDTO[] = rows.map((r) => ({
      id: r.id,
      tableId: r.tableId,
      tableNumber: r.table.number,
      startsAt: r.startsAt.toISOString(),
      partySize: r.partySize,
      guestName: r.guestName,
      guestPhone: r.guestPhone,
    }));
    res.json({ reservations });
  });

  on("POST", "/api/waiter/reservations/:reservationId/cancel", async (req, res) => {
    const id = parse(zId, req.params.reservationId);
    const row = await db.reservation.findUnique({ where: { id }, select: { tableId: true } });
    if (!row) throw errors.notFound("Reservation");
    const { count } = await db.reservation.updateMany({
      where: { id, status: "ACTIVE" },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    if (count === 0) throw errors.conflict("ALREADY_CANCELLED", "This reservation is already cancelled.");
    await audit(db, {
      actor: { type: "staff", staffId: req.staff!.id },
      action: "reservation.cancelled",
      entityType: "reservation",
      entityId: id,
      ip: req.ip,
    });
    await emitTableStatus(db, realtime, row.tableId);
    res.json({ ok: true });
  });
}
