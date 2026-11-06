import type { CookieOptions } from "express";
import type { Db } from "../db.ts";
import type { StaffRole } from "../generated/prisma/enums.ts";
import { enums } from "../lib/enums.ts";
import { hashToken, newToken } from "./tokens.ts";

export const STAFF_COOKIE = "staff_session";

export interface AuthedStaff {
  id: string;
  name: string;
  role: "manager" | "waiter" | "kitchen";
  sessionId: string;
}

export function staffCookieOptions(secure: boolean, maxAgeMs?: number): CookieOptions {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    ...(maxAgeMs !== undefined ? { maxAge: maxAgeMs } : {}),
  };
}

export async function createStaffSession(
  db: Db,
  staffId: string,
  opts: { hours: number; ip?: string; userAgent?: string },
): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + opts.hours * 3_600_000);
  await db.staffSession.create({
    data: {
      staffId,
      tokenHash: hashToken(token),
      expiresAt,
      ip: opts.ip ?? null,
      userAgent: opts.userAgent?.slice(0, 300) ?? null,
    },
  });
  return { token, expiresAt };
}

/** Raw cookie token → signed-in staff member, or null if invalid / expired / revoked / deactivated. */
export async function resolveStaffSession(
  db: Db,
  token: string | undefined,
  now = new Date(),
): Promise<AuthedStaff | null> {
  if (!token || token.length > 100) return null;
  const session = await db.staffSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { staff: { select: { id: true, name: true, role: true, active: true } } },
  });
  if (!session || session.revokedAt || session.expiresAt <= now || !session.staff.active) return null;

  // Track activity, but write at most once every 5 minutes.
  if (now.getTime() - session.lastSeenAt.getTime() > 5 * 60_000) {
    await db.staffSession.update({ where: { id: session.id }, data: { lastSeenAt: now } });
  }
  return {
    id: session.staff.id,
    name: session.staff.name,
    role: enums.role.fromDb(session.staff.role as StaffRole),
    sessionId: session.id,
  };
}

export async function revokeSession(db: Db, sessionId: string): Promise<void> {
  await db.staffSession.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
}
