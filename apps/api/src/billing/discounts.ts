import { rooms } from "@app/shared/api";
import { audit } from "../audit.ts";
import type { Db } from "../db.ts";
import type { DiscountCode } from "../generated/prisma/client.ts";
import { ApiError } from "../http/errors.ts";
import type { Realtime } from "../realtime/types.ts";
import { bumpVersion, type AuthedGuest } from "../sessions/service.ts";
import { computeSessionBill } from "./bill.ts";
import { lockSessionMoney } from "./payments.ts";

const invalid = () => new ApiError(404, "INVALID_CODE", "That code isn't valid.");

/** Wrong codes one visit can try, so codes can't be guessed from a table. */
export const CODE_ATTEMPT_LIMIT = { attempts: 5, windowMinutes: 15 } as const;
const WRONG_CODE_ACTION = "discount.wrong_code";

export function toDiscountDTO(d: DiscountCode) {
  return {
    id: d.id,
    code: d.code,
    kind: d.kind === "PERCENT" ? ("percent" as const) : ("fixed" as const),
    /** percent: 12.5 means 12.5 %; fixed: cents */
    value: d.kind === "PERCENT" ? d.value / 100 : d.value,
    active: d.active,
    startsAt: d.startsAt?.toISOString() ?? null,
    endsAt: d.endsAt?.toISOString() ?? null,
    maxRedemptions: d.maxRedemptions,
    redemptionCount: d.redemptionCount,
    minSubtotalCents: d.minSubtotalCents,
    createdAt: d.createdAt.toISOString(),
  };
}

async function publishBill(db: Db, realtime: Realtime, sessionId: string, version: number) {
  const bill = (await computeSessionBill(db, sessionId)).dto;
  realtime.emit(rooms.session(sessionId), "bill:updated", { version, bill });
  return { version, bill };
}

/**
 * Apply a manager-created code to the table's bill. Only before anyone has
 * started paying (otherwise earlier payers' shares would change). Usage limits
 * are enforced atomically.
 */
export async function applyDiscount(db: Db, realtime: Realtime, guest: AuthedGuest, rawCode: string) {
  const code = rawCode.trim().toUpperCase();
  const wrongTries = await db.auditLog.count({
    where: {
      action: WRONG_CODE_ACTION,
      entityType: "table_session",
      entityId: guest.sessionId,
      createdAt: { gte: new Date(Date.now() - CODE_ATTEMPT_LIMIT.windowMinutes * 60_000) },
    },
  });
  if (wrongTries >= CODE_ATTEMPT_LIMIT.attempts) {
    throw new ApiError(429, "TOO_MANY_CODE_ATTEMPTS", "Too many wrong codes. Please ask a member of staff.");
  }
  const version = await db
    .$transaction(async (tx) => {
      await lockSessionMoney(tx, guest.sessionId);
      const started = await tx.payment.count({
        where: { sessionId: guest.sessionId, status: { in: ["PENDING", "SUCCEEDED"] } },
      });
      if (started > 0)
        throw new ApiError(409, "PAYMENTS_STARTED", "A discount code can't be added after payment has started.");

      const d = await tx.discountCode.findUnique({ where: { code } });
      const now = new Date();
      if (!d || !d.active || (d.startsAt && d.startsAt > now) || (d.endsAt && d.endsAt <= now)) throw invalid();

      const session = await tx.tableSession.findUniqueOrThrow({
        where: { id: guest.sessionId },
        select: { discountCodeId: true },
      });
      if (session.discountCodeId === d.id) return null; // already applied — nothing changes

      if (d.minSubtotalCents != null) {
        const { subtotal } = await computeSessionBill(tx, guest.sessionId);
        if (subtotal < d.minSubtotalCents) {
          throw new ApiError(422, "CODE_MIN_SUBTOTAL", "Your order isn't big enough for this code yet.", {
            minSubtotalCents: d.minSubtotalCents,
          });
        }
      }
      // Atomic usage check: only succeeds while there are uses left.
      const claimed = await tx.discountCode.updateMany({
        where: { id: d.id, ...(d.maxRedemptions != null ? { redemptionCount: { lt: d.maxRedemptions } } : {}) },
        data: { redemptionCount: { increment: 1 } },
      });
      if (claimed.count === 0) throw new ApiError(409, "CODE_USED_UP", "This code has been fully used.");
      if (session.discountCodeId) {
        await tx.discountCode.update({
          where: { id: session.discountCodeId },
          data: { redemptionCount: { decrement: 1 } },
        });
      }
      await tx.tableSession.update({ where: { id: guest.sessionId }, data: { discountCodeId: d.id } });
      await audit(tx, {
        actor: { type: "guest", guestId: guest.id },
        action: "discount.applied",
        entityType: "table_session",
        entityId: guest.sessionId,
        data: { code },
      });
      return bumpVersion(tx, guest.sessionId);
    })
    .catch(async (e: unknown) => {
      if (e instanceof ApiError && e.code === "INVALID_CODE") {
        // What was typed isn't stored: it could be close to a real code.
        await audit(db, {
          actor: { type: "guest", guestId: guest.id },
          action: WRONG_CODE_ACTION,
          entityType: "table_session",
          entityId: guest.sessionId,
        });
      }
      throw e;
    });
  if (version === null) return { version: null, bill: (await computeSessionBill(db, guest.sessionId)).dto };
  return publishBill(db, realtime, guest.sessionId, version);
}

export async function removeDiscount(db: Db, realtime: Realtime, guest: AuthedGuest) {
  const version = await db.$transaction(async (tx) => {
    await lockSessionMoney(tx, guest.sessionId);
    const started = await tx.payment.count({
      where: { sessionId: guest.sessionId, status: { in: ["PENDING", "SUCCEEDED"] } },
    });
    if (started > 0)
      throw new ApiError(409, "PAYMENTS_STARTED", "The discount can't be removed after payment has started.");
    const session = await tx.tableSession.findUniqueOrThrow({
      where: { id: guest.sessionId },
      select: { discountCodeId: true },
    });
    if (!session.discountCodeId) return null;
    await tx.discountCode.update({
      where: { id: session.discountCodeId },
      data: { redemptionCount: { decrement: 1 } },
    });
    await tx.tableSession.update({ where: { id: guest.sessionId }, data: { discountCodeId: null } });
    await audit(tx, {
      actor: { type: "guest", guestId: guest.id },
      action: "discount.removed",
      entityType: "table_session",
      entityId: guest.sessionId,
    });
    return bumpVersion(tx, guest.sessionId);
  });
  if (version === null) return { version: null, bill: (await computeSessionBill(db, guest.sessionId)).dto };
  return publishBill(db, realtime, guest.sessionId, version);
}
