import { audit } from "../audit.ts";
import type { Db } from "../db.ts";
import type { Staff } from "../generated/prisma/client.ts";
import { ApiError, errors } from "../http/errors.ts";
import { hashSecret, verifySecret } from "./hash.ts";
import { afterFailure, afterSuccess, isLocked } from "./lockout.ts";

/** One message for every credential failure — never reveal whether the account exists. */
const invalid = () => new ApiError(401, "INVALID_CREDENTIALS", "Those details don't match. Please try again.");

let dummyHash: Promise<string> | undefined;
/** Verifying against a dummy hash when the account doesn't exist keeps response times equal. */
const burnTime = async (plain: string) => {
  dummyHash ??= hashSecret("timing-equaliser-not-a-real-secret");
  await verifySecret(await dummyHash, plain);
};

interface Ctx {
  ip?: string;
  now?: Date;
}

/**
 * Check a password or PIN against a staff record, applying the lockout policy.
 * Returns the staff member on success, throws ApiError otherwise.
 */
async function attempt(
  db: Db,
  staff: Staff | null,
  field: "passwordHash" | "pinHash",
  plain: string,
  ctx: Ctx,
): Promise<Staff> {
  const now = ctx.now ?? new Date();
  const hash = staff?.[field];
  if (!staff || !staff.active || !hash) {
    await burnTime(plain);
    throw invalid();
  }
  if (isLocked(staff, now)) {
    await burnTime(plain);
    throw errors.locked(staff.lockedUntil!);
  }

  if (await verifySecret(hash, plain)) {
    const updated = await db.staff.update({
      where: { id: staff.id },
      data: { ...afterSuccess(), lastLoginAt: now },
    });
    await audit(db, {
      actor: { type: "staff", staffId: staff.id },
      action: "staff.login",
      entityType: "staff",
      entityId: staff.id,
      data: { method: field === "pinHash" ? "pin" : "password" },
      ip: ctx.ip,
    });
    return updated;
  }

  // Atomic increment so parallel attempts can't slip past the threshold.
  const bumped = await db.staff.update({
    where: { id: staff.id },
    data: { failedLogins: { increment: 1 } },
    select: { failedLogins: true, lockedUntil: true },
  });
  const next = afterFailure({ failedLogins: bumped.failedLogins - 1, lockedUntil: bumped.lockedUntil }, now);
  const justLocked = next.lockedUntil && next.lockedUntil !== bumped.lockedUntil;
  if (justLocked) {
    await db.staff.update({ where: { id: staff.id }, data: { lockedUntil: next.lockedUntil } });
  }
  await audit(db, {
    actor: { type: "system" },
    action: justLocked ? "staff.locked" : "staff.login_failed",
    entityType: "staff",
    entityId: staff.id,
    data: { failedLogins: bumped.failedLogins },
    ip: ctx.ip,
  });
  if (justLocked) throw errors.locked(next.lockedUntil!);
  throw invalid();
}

export async function loginWithPassword(db: Db, email: string, password: string, ctx: Ctx = {}): Promise<Staff> {
  const staff = await db.staff.findUnique({ where: { email: email.toLowerCase() } });
  return attempt(db, staff?.role === "MANAGER" ? staff : null, "passwordHash", password, ctx);
}

export async function loginWithPin(db: Db, staffId: string, pin: string, ctx: Ctx = {}): Promise<Staff> {
  const staff = await db.staff.findUnique({ where: { id: staffId } });
  const pinRole = staff && (staff.role === "WAITER" || staff.role === "KITCHEN");
  return attempt(db, pinRole ? staff : null, "pinHash", pin, ctx);
}
