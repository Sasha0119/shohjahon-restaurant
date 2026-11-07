import type { OpeningHours } from "@app/config";
import { WEEKDAYS, addDays, toMinutes, zonedDate, zonedStartOfDay } from "./hours";

/** How long a reservation holds its table. Two bookings on one table must be this far apart. */
export const RESERVATION_MINUTES = 120;
/** A reservation nobody arrived for releases its table this long after its start time. */
export const RESERVATION_GRACE_MINUTES = 30;
export const RESERVATION_MIN_NOTICE_MINUTES = 30;
export const RESERVATION_MAX_DAYS_AHEAD = 30;
export const RESERVATION_STEP_MINUTES = 30;
/** The last booking of the day starts this long before closing. */
export const RESERVATION_LAST_BOOKING_MINUTES = 60;
/** Active reservations one phone number can hold at once. */
export const RESERVATION_MAX_PER_PHONE = 3;
export const RESERVATION_MAX_PARTY = 20;

/** The guest who books pays this share of the dishes up front; the rest goes on the table's bill. */
export const RESERVATION_DEPOSIT_PERCENT = 50;
/** The kitchen is told to start cooking this long before the guest arrives. */
export const RESERVATION_COOK_ALERT_MINUTES = 30;
/** Staff can seat a booking this long before its time, for a guest who comes early. */
export const RESERVATION_SEAT_EARLY_MINUTES = 120;
/** Cancelling at least this long before the booking gets the bigger refund. */
export const RESERVATION_FREE_CANCEL_MINUTES = 120;
export const RESERVATION_REFUND_PERCENT = { early: 40, late: 20 } as const;
export const RESERVATION_MAX_DISHES = 30;

/** The deposit for a dish total, rounded up to a whole minor unit. */
export function bookingDeposit(dishesCents: number): number {
  return Math.ceil((dishesCents * RESERVATION_DEPOSIT_PERCENT) / 100);
}

/**
 * What a cancelling guest gets back, as a share of the deposit they paid.
 * Exactly the cut-off counts as early. From the booked time on there is no refund.
 */
export function bookingRefund(depositCents: number, startsAt: Date, now: Date): number {
  const msLeft = startsAt.getTime() - now.getTime();
  if (msLeft <= 0) return 0;
  const { early, late } = RESERVATION_REFUND_PERCENT;
  const percent = msLeft >= RESERVATION_FREE_CANCEL_MINUTES * 60_000 ? early : late;
  return Math.floor((depositCents * percent) / 100);
}

const hhmm = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

/**
 * The start times offered for a local date ("YYYY-MM-DD"), from the opening hours.
 * A slot running past midnight still ends its bookings at 23:30 on that date.
 */
export function bookableTimes(hours: OpeningHours, localDate: string): string[] {
  const [y, m, d] = localDate.split("-").map(Number) as [number, number, number];
  const day = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]!;
  const times = new Set<string>();
  for (const slot of hours[day] ?? []) {
    const open = toMinutes(slot.open);
    const close = toMinutes(slot.close);
    const end = (close <= open ? close + 1440 : close) - RESERVATION_LAST_BOOKING_MINUTES;
    const first = Math.ceil(open / RESERVATION_STEP_MINUTES) * RESERVATION_STEP_MINUTES;
    for (let t = first; t <= end && t < 1440; t += RESERVATION_STEP_MINUTES) times.add(hhmm(t));
  }
  return [...times].sort();
}

/** "2026-11-07" + "13:00" in the restaurant's time zone, as an instant. */
export function reservationInstant(localDate: string, time: string, timeZone: string): Date {
  return new Date(zonedStartOfDay(localDate, timeZone).getTime() + toMinutes(time) * 60_000);
}

/** The local dates a guest can choose, first and last. */
export function reservationDateRange(now: Date, timeZone: string): { min: string; max: string } {
  const min = zonedDate(now, timeZone);
  return { min, max: addDays(min, RESERVATION_MAX_DAYS_AHEAD) };
}

/** A phone number we can actually call: only phone characters, 7 to 15 digits. */
export function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "").length;
  return /^[+\d\s()-]+$/.test(phone.trim()) && phone.trim().length <= 24 && digits >= 7 && digits <= 15;
}

/** Keeps "+" and digits, so the same number typed two ways counts as one. */
export function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}
