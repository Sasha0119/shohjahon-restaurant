/**
 * Brute-force protection per staff account (on top of per-IP rate limits).
 * A 4-digit PIN has only 10 000 combinations, so this matters.
 *
 *   • 5 wrong attempts in a row → locked for 15 minutes
 *   • every further wrong attempt after a lock doubles the lock (max 24 h)
 *   • a successful login resets the counter
 */
export const LOCKOUT = {
  threshold: 5,
  baseMinutes: 15,
  maxMinutes: 24 * 60,
} as const;

export interface LockState {
  failedLogins: number;
  lockedUntil: Date | null;
}

export function isLocked(state: LockState, now: Date): boolean {
  return !!state.lockedUntil && state.lockedUntil.getTime() > now.getTime();
}

/** State after one more failed attempt. */
export function afterFailure(state: LockState, now: Date): LockState {
  const failedLogins = state.failedLogins + 1;
  if (failedLogins < LOCKOUT.threshold) return { failedLogins, lockedUntil: state.lockedUntil };
  const extra = failedLogins - LOCKOUT.threshold; // 0 on the 5th failure
  const minutes = Math.min(LOCKOUT.baseMinutes * 2 ** extra, LOCKOUT.maxMinutes);
  return { failedLogins, lockedUntil: new Date(now.getTime() + minutes * 60_000) };
}

export function afterSuccess(): LockState {
  return { failedLogins: 0, lockedUntil: null };
}
