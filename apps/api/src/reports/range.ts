import { addDays, eachDay, zonedDate, zonedStartOfDay } from "@app/shared";
import { errors } from "../http/errors.ts";

const MAX_RANGE_DAYS = 366;
const DEFAULT_RANGE_DAYS = 30;

export interface ResolvedRange {
  /** Inclusive local dates. */
  from: string;
  to: string;
  days: number;
  /** UTC instants: [start, end). */
  start: Date;
  end: Date;
}

/**
 * Local "YYYY-MM-DD" bounds (inclusive) → UTC instants in the restaurant's
 * time zone. Defaults to the last 30 days, ending today.
 */
export function resolveRange(q: { from?: string; to?: string }, timeZone: string, now = new Date()): ResolvedRange {
  const today = zonedDate(now, timeZone);
  const to = q.to ?? today;
  const from = q.from ?? addDays(to, -(DEFAULT_RANGE_DAYS - 1));
  const days = eachDay(from, to).length;
  if (days === 0) throw errors.badRequest("INVALID_RANGE", "'from' must be on or before 'to'.");
  if (days > MAX_RANGE_DAYS) throw errors.badRequest("RANGE_TOO_LONG", `Choose at most ${MAX_RANGE_DAYS} days.`);
  return { from, to, days, start: zonedStartOfDay(from, timeZone), end: zonedStartOfDay(addDays(to, 1), timeZone) };
}

/** The equally long period immediately before `r` (for "vs previous period"). */
export function previousRange(r: ResolvedRange, timeZone: string): ResolvedRange {
  const to = addDays(r.from, -1);
  const from = addDays(to, -(r.days - 1));
  return {
    from,
    to,
    days: r.days,
    start: zonedStartOfDay(from, timeZone),
    end: zonedStartOfDay(addDays(to, 1), timeZone),
  };
}
