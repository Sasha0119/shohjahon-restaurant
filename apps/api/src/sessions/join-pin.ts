import { createHmac } from "node:crypto";
import { audit } from "../audit.ts";
import { safeEqual } from "../auth/tokens.ts";
import type { Db } from "../db.ts";
import { ApiError } from "../http/errors.ts";

/**
 * The 6-digit PIN that seated guests see and anyone else must enter to join
 * their table. A photo of the printed QR alone therefore can't get into a visit.
 * Derived from the session id, so it needs no storage, is different for every
 * visit, and isn't readable from a database leak without QR_TOKEN_SECRET.
 */
export function joinPinFor(secret: string, sessionId: string): string {
  const number = createHmac("sha256", secret).update(`join-pin:v1:${sessionId}`).digest().readUInt32BE(0);
  return String(number % 1_000_000).padStart(6, "0");
}

export const JOIN_PIN_LIMIT = { attempts: 10, windowMinutes: 15 } as const;

const WRONG_PIN_ACTION = "session.join_pin_failed";

export type JoinPinVerdict = "ok" | "wrong" | "locked";

/**
 * Check a PIN, allowing a limited number of wrong tries per visit from any
 * device or IP. Runs one at a time per visit, so parallel guesses can't slip
 * past the limit. The audit log is the attempt counter; the PIN is never logged.
 */
export function checkJoinPin(
  db: Db,
  secret: string,
  sessionId: string,
  pin: string,
  ctx: { ip?: string; now?: Date } = {},
): Promise<JoinPinVerdict> {
  const now = ctx.now ?? new Date();
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`join-pin:${sessionId}`}))`;
    const wrongTries = await tx.auditLog.count({
      where: {
        action: WRONG_PIN_ACTION,
        entityType: "table_session",
        entityId: sessionId,
        createdAt: { gte: new Date(now.getTime() - JOIN_PIN_LIMIT.windowMinutes * 60_000) },
      },
    });
    if (wrongTries >= JOIN_PIN_LIMIT.attempts) return "locked";
    if (safeEqual(pin, joinPinFor(secret, sessionId))) return "ok";
    await audit(tx, {
      actor: { type: "system" },
      action: WRONG_PIN_ACTION,
      entityType: "table_session",
      entityId: sessionId,
      ip: ctx.ip,
    });
    return "wrong";
  });
}

export function joinPinError(verdict: "wrong" | "locked", details: { table: number; guestCount: number }): ApiError {
  return verdict === "locked"
    ? new ApiError(
        429,
        "JOIN_PIN_LOCKED",
        "Too many wrong PINs. Please wait a few minutes or ask a member of staff.",
        details,
      )
    : new ApiError(403, "JOIN_PIN_WRONG", "That PIN isn't right. Please check it and try again.", details);
}
