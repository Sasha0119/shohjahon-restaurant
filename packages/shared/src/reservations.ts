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
