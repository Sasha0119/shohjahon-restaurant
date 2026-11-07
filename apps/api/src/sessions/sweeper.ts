import type { Logger } from "pino";
import type { PaymentProvider } from "../billing/provider.ts";
import type { Db } from "../db.ts";
import { safeForLogs } from "../http/errors.ts";
import { sweepBookings } from "../reservations/booking.ts";
import type { Realtime } from "../realtime/types.ts";
import { expireIdleSessions } from "./service.ts";

/**
 * Closes idle sessions in the background every minute, so tables free up
 * even if nobody touches them again. (Sessions are also checked lazily on
 * every guest request.)
 */
export function startSessionSweeper(deps: {
  db: Db;
  realtime: Realtime;
  logger: Logger;
  idleMinutes: number;
  provider: PaymentProvider;
  retentionDays: number;
  intervalMs?: number;
}): () => void {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const closed = await expireIdleSessions(deps.db, deps.realtime, deps.idleMinutes);
      if (closed) deps.logger.info({ closed }, "Expired idle table sessions");
      const bookings = await sweepBookings(deps.db, deps.realtime, deps.provider, deps.retentionDays);
      if (bookings.cookAlerts || bookings.released || bookings.purged) deps.logger.info(bookings, "Booking sweep");
    } catch (err) {
      deps.logger.error({ err: safeForLogs(err) }, "Session sweeper failed");
    } finally {
      running = false;
    }
  }, deps.intervalMs ?? 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
