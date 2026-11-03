import type { TableStatusDTO } from "@app/shared/api";

/**
 * Pure session rules (unit-tested without a database).
 */

/**
 * A session expires after `idleMinutes` without activity — but only if
 * nothing was ordered. A table with an unpaid bill is never auto-closed; it
 * stays open until it's paid or a staff member closes it.
 */
export function isIdleExpired(
  session: { lastActivityAt: Date },
  hasActiveOrders: boolean,
  now: Date,
  idleMinutes: number,
): boolean {
  if (hasActiveOrders) return false;
  return now.getTime() - session.lastActivityAt.getTime() >= idleMinutes * 60_000;
}

/** Activity is written at most this often, to keep writes cheap. */
export const TOUCH_THROTTLE_MS = 30_000;

export function shouldTouch(lastActivityAt: Date, now: Date): boolean {
  return now.getTime() - lastActivityAt.getTime() >= TOUCH_THROTTLE_MS;
}

export function tableStatus(input: {
  hasOpenSession: boolean;
  hasActiveOrders: boolean;
  billRequested: boolean;
}): TableStatusDTO {
  if (!input.hasOpenSession) return "free";
  if (input.billRequested) return "billRequested";
  if (input.hasActiveOrders) return "ordered";
  return "seated";
}
