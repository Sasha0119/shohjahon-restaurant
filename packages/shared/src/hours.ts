import type { OpeningHours, OpeningSlot, Weekday } from "@app/config";
import type { AvailabilityWindow } from "./types";

export const WEEKDAYS: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** "HH:MM" → minutes after midnight. */
export function toMinutes(hhmm: string): number {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!m) throw new RangeError(`Invalid time "${hhmm}" (expected HH:MM)`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Does a slot cover `minute` on its own day, or on the following day if it runs past midnight? */
function slotCovers(slot: { open: string; close: string }, minute: number, dayOffset: 0 | 1): boolean {
  const open = toMinutes(slot.open);
  const close = toMinutes(slot.close);
  const overnight = close <= open;
  if (dayOffset === 0) return overnight ? minute >= open : minute >= open && minute < close;
  return overnight && minute < close;
}

export interface OpenState {
  isOpen: boolean;
  /** When open: today's closing time "HH:MM". When closed: next opening "HH:MM". */
  until?: string;
  /** When closed: weekday of the next opening. */
  nextDay?: Weekday;
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/**
 * Day of week (0 = Sunday) and minutes after midnight of `date` in `timeZone`
 * (IANA name). Without a time zone, the device/server local time is used.
 */
export function localParts(date: Date, timeZone?: string): { dayIdx: number; minute: number } {
  if (!timeZone) return { dayIdx: date.getDay(), minute: date.getHours() * 60 + date.getMinutes() };
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { dayIdx: WEEKDAY_INDEX[get("weekday")] ?? 0, minute: Number(get("hour")) * 60 + Number(get("minute")) };
}

/** Is the venue open at `date`? Pass the restaurant time zone on servers. */
export function openState(hours: OpeningHours, date: Date, timeZone?: string): OpenState {
  const { dayIdx, minute } = localParts(date, timeZone);
  const today = WEEKDAYS[dayIdx]!;
  const yesterday = WEEKDAYS[(dayIdx + 6) % 7]!;

  for (const slot of hours[yesterday] ?? []) {
    if (slotCovers(slot, minute, 1)) return { isOpen: true, until: slot.close };
  }
  for (const slot of hours[today] ?? []) {
    if (slotCovers(slot, minute, 0)) return { isOpen: true, until: slot.close };
  }

  // Closed: find the next opening within the next 7 days.
  for (let offset = 0; offset < 8; offset++) {
    const day = WEEKDAYS[(dayIdx + offset) % 7]!;
    const slots: OpeningSlot[] = [...(hours[day] ?? [])].sort(
      (a, b) => toMinutes(a.open) - toMinutes(b.open),
    );
    const next = slots.find((s) => offset > 0 || toMinutes(s.open) > minute);
    if (next) return { isOpen: false, until: next.open, nextDay: day };
  }
  return { isOpen: false };
}

/** Time-based menus: is a category available at `date`? No windows = always. */
export function isAvailableAt(windows: AvailabilityWindow[] | undefined, date: Date, timeZone?: string): boolean {
  if (!windows || windows.length === 0) return true;
  const { dayIdx, minute } = localParts(date, timeZone);
  const day = WEEKDAYS[dayIdx]!;
  return windows.some((w) => {
    if (w.days && !w.days.includes(day)) return false;
    return minute >= toMinutes(w.from) && minute < toMinutes(w.to);
  });
}

/** Minutes the zone is ahead of UTC at `date` (e.g. New York in winter → −300). */
export function zoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
}

/** Local midnight of a "YYYY-MM-DD" date in `timeZone`, as a UTC instant (DST-safe). */
export function zonedStartOfDay(localDate: string, timeZone: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!m) throw new RangeError(`Invalid date "${localDate}" (expected YYYY-MM-DD)`);
  const guess = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  let instant = guess - zoneOffsetMinutes(new Date(guess), timeZone) * 60_000;
  // Re-check once: the offset can differ on the day DST changes.
  instant = guess - zoneOffsetMinutes(new Date(instant), timeZone) * 60_000;
  return new Date(instant);
}

/** The local calendar date ("YYYY-MM-DD") of an instant in `timeZone`. */
export function zonedDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** "2026-11-03" + n days → "2026-11-0x" (pure calendar arithmetic). */
export function addDays(localDate: string, days: number): string {
  const [y, mo, d] = localDate.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, mo - 1, d + days)).toISOString().slice(0, 10);
}

/** Every local date from `from` to `to`, inclusive. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 1000; d = addDays(d, 1)) out.push(d);
  return out;
}
