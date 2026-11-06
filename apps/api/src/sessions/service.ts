import { rooms } from "@app/shared/api";
import { RESERVATION_GRACE_MINUTES, RESERVATION_MINUTES } from "@app/shared";
import { audit } from "../audit.ts";
import { hashToken, newToken } from "../auth/tokens.ts";
import type { Db } from "../db.ts";
import { Prisma } from "../generated/prisma/client.ts";
import type { SessionCloseReason } from "../generated/prisma/enums.ts";
import { ApiError } from "../http/errors.ts";
import type { Realtime } from "../realtime/types.ts";
import { verifyQrToken } from "../tables/qr-token.ts";
import { isIdleExpired, shouldTouch, tableStatus } from "./rules.ts";

export const GUEST_COOKIE = "guest_session";
/** A guest cookie outlives any realistic visit; the session itself expires much sooner. */
export const GUEST_COOKIE_HOURS = 12;

type Tx = Prisma.TransactionClient;

export interface SessionConfig {
  qrSecret: string;
  idleMinutes: number;
}

// ── small helpers ────────────────────────────────────────────────────────────

const ACTIVE_ORDER = { status: { not: "CANCELLED" as const } };

export async function hasActiveOrders(db: Db | Tx, sessionId: string): Promise<boolean> {
  return (await db.order.count({ where: { sessionId, ...ACTIVE_ORDER } })) > 0;
}

/** +1 on the session version; returns the new version. */
export async function bumpVersion(db: Db | Tx, sessionId: string): Promise<number> {
  const s = await db.tableSession.update({
    where: { id: sessionId },
    data: { version: { increment: 1 }, lastActivityAt: new Date() },
    select: { version: true },
  });
  return s.version;
}

export async function touch(db: Db, session: { id: string; lastActivityAt: Date }, now = new Date()) {
  if (shouldTouch(session.lastActivityAt, now)) {
    await db.tableSession.update({ where: { id: session.id }, data: { lastActivityAt: now } });
  }
}

export async function guestsOf(db: Db | Tx, sessionId: string) {
  const guests = await db.sessionGuest.findMany({
    where: { sessionId },
    select: { id: true, nickname: true },
    orderBy: { createdAt: "asc" },
  });
  return guests;
}

/** Current status of one table, broadcast to waiters and managers. */
export async function emitTableStatus(db: Db, realtime: Realtime, tableId: string): Promise<void> {
  const table = await db.diningTable.findUnique({
    where: { id: tableId },
    select: {
      id: true,
      number: true,
      sessions: {
        where: { status: "OPEN" },
        select: { id: true, calls: { where: { type: "BILL", status: "OPEN" }, select: { id: true } } },
      },
    },
  });
  if (!table) return;
  const open = table.sessions[0];
  const status = tableStatus({
    hasOpenSession: !!open,
    hasActiveOrders: open ? await hasActiveOrders(db, open.id) : false,
    billRequested: !!open && open.calls.length > 0,
  });
  realtime.emit([rooms.waiters, rooms.managers], "table:status", { tableId: table.id, number: table.number, status });
}

// ── closing ──────────────────────────────────────────────────────────────────

/**
 * Close an OPEN session. Idempotent: returns null if it was already closed.
 * Emits session:closed to the guests and the new table status to staff.
 */
export async function closeSession(
  db: Db,
  realtime: Realtime,
  sessionId: string,
  reason: SessionCloseReason,
  opts: { staffId?: string; ip?: string } = {},
): Promise<{ version: number; tableId: string } | null> {
  const result = await db.$transaction(async (tx) => {
    const updated = await tx.tableSession.updateMany({
      where: { id: sessionId, status: "OPEN" },
      data: {
        status: "CLOSED",
        closedAt: new Date(),
        closeReason: reason,
        closedById: opts.staffId ?? null,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) return null;
    const s = await tx.tableSession.findUniqueOrThrow({ where: { id: sessionId }, select: { version: true, tableId: true } });
    await audit(tx, {
      actor: opts.staffId ? { type: "staff", staffId: opts.staffId } : { type: "system" },
      action: "session.closed",
      entityType: "table_session",
      entityId: sessionId,
      data: { reason },
      ip: opts.ip,
    });
    return s;
  });
  if (!result) return null;
  realtime.emit(rooms.session(sessionId), "session:closed", {
    version: result.version,
    reason: reason.toLowerCase() as "paid" | "staff" | "expired",
  });
  await emitTableStatus(db, realtime, result.tableId);
  return result;
}

/** Background sweep: close every idle session that has nothing to pay. */
export async function expireIdleSessions(db: Db, realtime: Realtime, idleMinutes: number, now = new Date()) {
  const cutoff = new Date(now.getTime() - idleMinutes * 60_000);
  const candidates = await db.tableSession.findMany({
    where: { status: "OPEN", lastActivityAt: { lte: cutoff }, orders: { none: ACTIVE_ORDER } },
    select: { id: true },
  });
  let closed = 0;
  for (const c of candidates) {
    if (await closeSession(db, realtime, c.id, "EXPIRED")) closed++;
  }
  return closed;
}

// ── guests ───────────────────────────────────────────────────────────────────

export interface AuthedGuest {
  id: string;
  nickname: string;
  sessionId: string;
  tableId: string;
  tableNumber: number;
}

/**
 * Guest cookie → guest in an OPEN, non-expired session.
 * Throws 401 (no/unknown cookie) or 410 SESSION_CLOSED (closed or just expired).
 */
export async function resolveGuest(
  db: Db,
  realtime: Realtime,
  cfg: SessionConfig,
  token: string | undefined,
  now = new Date(),
): Promise<AuthedGuest> {
  if (!token || token.length > 100) throw new ApiError(401, "NO_SESSION", "Scan the QR code on your table to start.");
  const guest = await db.sessionGuest.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { session: { include: { table: { select: { number: true } } } } },
  });
  if (!guest) throw new ApiError(401, "NO_SESSION", "Scan the QR code on your table to start.");
  const { session } = guest;
  if (session.status === "CLOSED") {
    throw new ApiError(410, "SESSION_CLOSED", "This visit has ended.", { reason: session.closeReason?.toLowerCase() });
  }
  if (isIdleExpired(session, await hasActiveOrders(db, session.id), now, cfg.idleMinutes)) {
    await closeSession(db, realtime, session.id, "EXPIRED");
    throw new ApiError(410, "SESSION_CLOSED", "This visit has ended.", { reason: "expired" });
  }
  await touch(db, session, now);
  if (shouldTouch(guest.lastSeenAt, now)) {
    await db.sessionGuest.update({ where: { id: guest.id }, data: { lastSeenAt: now } });
  }
  return {
    id: guest.id,
    nickname: guest.nickname,
    sessionId: session.id,
    tableId: session.tableId,
    tableNumber: session.table.number,
  };
}

// ── joining a table ──────────────────────────────────────────────────────────

export interface JoinInput {
  qrToken: string;
  /** Raw guest cookie, if the browser has one. */
  guestToken?: string;
  confirmJoin: boolean;
  confirmSwitch: boolean;
  confirmReserved?: boolean;
  now?: Date;
}

export interface JoinResult {
  guestId: string;
  sessionId: string;
  /** Set when a new guest was created: the caller stores it in the guest cookie. */
  newGuestToken?: string;
  /** The guest was already part of this session (page reload / rescan). */
  rejoined: boolean;
  /** A new session was opened on this table. */
  openedSession: boolean;
}

const invalidQr = () =>
  new ApiError(404, "INVALID_QR", "This QR code isn't valid. Please scan the code on your table again.");

/**
 * Scan the table QR:
 *  1. verify the signed token, the table and its current QR version;
 *  2. if this browser is already a guest at this table → rejoin;
 *     at another table → ask before switching (409 OTHER_TABLE);
 *  3. join the table's open session — asking first if other people already
 *     joined it (409 TABLE_OCCUPIED) — or open a new one.
 * Expired sessions are closed on the way, so an old link starts fresh.
 */
export async function joinTable(db: Db, realtime: Realtime, cfg: SessionConfig, input: JoinInput): Promise<JoinResult> {
  const now = input.now ?? new Date();

  // 1. Token & table
  const verdict = verifyQrToken(cfg.qrSecret, input.qrToken);
  if (!verdict.ok) throw invalidQr();
  const table = await db.diningTable.findUnique({ where: { id: verdict.tableId } });
  if (!table) throw invalidQr();
  if (verdict.qrVersion !== table.qrVersion) {
    throw new ApiError(410, "QR_REPLACED", "This QR code has been replaced. Please ask a member of staff.");
  }
  if (!table.active) throw new ApiError(423, "TABLE_UNAVAILABLE", "This table isn't taking orders right now.");

  // 2. Who is this browser?
  if (input.guestToken && input.guestToken.length <= 100) {
    const current = await db.sessionGuest.findUnique({
      where: { tokenHash: hashToken(input.guestToken) },
      include: { session: { include: { table: { select: { number: true } } } } },
    });
    if (current && current.session.status === "OPEN") {
      const expired = isIdleExpired(current.session, await hasActiveOrders(db, current.session.id), now, cfg.idleMinutes);
      if (expired) {
        await closeSession(db, realtime, current.session.id, "EXPIRED");
      } else if (current.session.tableId === table.id) {
        await touch(db, current.session, now);
        return { guestId: current.id, sessionId: current.sessionId, rejoined: true, openedSession: false };
      } else if (!input.confirmSwitch) {
        throw new ApiError(409, "OTHER_TABLE", "You're already seated at another table.", {
          currentTable: current.session.table.number,
          newTable: table.number,
        });
      }
    }
  }

  // 3. The table's open session
  let open = await db.tableSession.findFirst({ where: { tableId: table.id, status: "OPEN" } });
  if (open && isIdleExpired(open, await hasActiveOrders(db, open.id), now, cfg.idleMinutes)) {
    await closeSession(db, realtime, open.id, "EXPIRED");
    open = null;
  }
  if (open && !input.confirmJoin) {
    const guestCount = await db.sessionGuest.count({ where: { sessionId: open.id } });
    if (guestCount > 0) {
      throw new ApiError(409, "TABLE_OCCUPIED", "Someone at this table has already started an order.", {
        table: table.number,
        guestCount,
        openedAt: open.openedAt.toISOString(),
      });
    }
  }

  // 4. A reservation is due: warn before a new visit opens. The guest may well be the one who booked.
  if (!open && !input.confirmReserved) {
    const reservation = await db.reservation.findFirst({
      where: {
        tableId: table.id,
        status: "ACTIVE",
        startsAt: {
          gte: new Date(now.getTime() - RESERVATION_GRACE_MINUTES * 60_000),
          lt: new Date(now.getTime() + RESERVATION_MINUTES * 60_000),
        },
      },
      orderBy: { startsAt: "asc" },
      select: { startsAt: true },
    });
    if (reservation) {
      throw new ApiError(409, "TABLE_RESERVED", "This table is reserved.", {
        table: table.number,
        startsAt: reservation.startsAt.toISOString(),
      });
    }
  }

  const token = newToken();
  let openedSession = false;
  let created: { guestId: string; sessionId: string; version: number };
  try {
    created = await db.$transaction(async (tx) => {
      let sessionId = open?.id;
      if (!sessionId) {
        // The partial unique index guarantees one OPEN session per table even under races.
        const s = await tx.tableSession.create({ data: { tableId: table.id, openedAt: now, lastActivityAt: now } });
        sessionId = s.id;
        openedSession = true;
      }
      const guest = await tx.sessionGuest.create({ data: { sessionId, tokenHash: hashToken(token) } });
      const version = await bumpVersion(tx, sessionId);
      return { guestId: guest.id, sessionId, version };
    });
  } catch (e) {
    // Two phones opened the table at the same instant: join the session the other one created.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && !open) {
      return joinTable(db, realtime, cfg, { ...input, guestToken: undefined, confirmJoin: true });
    }
    throw e;
  }

  realtime.emit(rooms.session(created.sessionId), "session:guests", {
    version: created.version,
    guests: await guestsOf(db, created.sessionId),
  });
  if (openedSession) await emitTableStatus(db, realtime, table.id);

  return { guestId: created.guestId, sessionId: created.sessionId, newGuestToken: token, rejoined: false, openedSession };
}

/** How long after a visit ends a guest can still rate it. */
export const REVIEW_WINDOW_MS = 24 * 3_600_000;

/**
 * Like resolveGuest, but also accepts a visit that ended recently (paying the
 * last of the bill closes the table — the guest must still be able to rate it).
 */
export async function resolveGuestIncludingClosed(
  db: Db,
  realtime: Realtime,
  cfg: SessionConfig,
  token: string | undefined,
  now = new Date(),
): Promise<AuthedGuest & { sessionOpen: boolean }> {
  try {
    return { ...(await resolveGuest(db, realtime, cfg, token, now)), sessionOpen: true };
  } catch (e) {
    if (!(e instanceof ApiError) || e.code !== "SESSION_CLOSED" || !token) throw e;
    const guest = await db.sessionGuest.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { session: { include: { table: { select: { number: true } } } } },
    });
    const closedAt = guest?.session.closedAt;
    if (!guest || !closedAt || now.getTime() - closedAt.getTime() > REVIEW_WINDOW_MS) throw e;
    return {
      id: guest.id,
      nickname: guest.nickname,
      sessionId: guest.sessionId,
      tableId: guest.session.tableId,
      tableNumber: guest.session.table.number,
      sessionOpen: false,
    };
  }
}
