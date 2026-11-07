import type { Server as HttpServer } from "node:http";
import {
  rooms,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SocketData,
  type SyncAck,
} from "@app/shared/api";
import { kdsSubscribePayload, sessionSyncPayload } from "@app/shared/api";
import { parse as parseCookies } from "cookie";
import type { Logger } from "pino";
import { Server } from "socket.io";
import { STAFF_COOKIE, resolveStaffSession } from "../auth/session.ts";
import type { Db } from "../db.ts";
import type { Env } from "../env.ts";
import { connectionAddress, createConnectionLimiter } from "../http/client-ip.ts";
import { ApiError, safeForLogs } from "../http/errors.ts";
import { GUEST_COOKIE, resolveGuest } from "../sessions/service.ts";
import { buildSnapshot } from "../sessions/snapshot.ts";
import type { Realtime } from "./types.ts";

/** Is the login or visit a disconnected socket belonged to still valid? */
async function stillAllowed(db: Db, data: SocketData, now = new Date()): Promise<boolean> {
  try {
    if (data?.kind === "staff") {
      const s = await db.staffSession.findUnique({
        where: { id: data.sessionId },
        select: { revokedAt: true, expiresAt: true, staff: { select: { active: true } } },
      });
      return !!s && !s.revokedAt && s.expiresAt > now && s.staff.active;
    }
    if (data?.kind === "guest") {
      const s = await db.tableSession.findUnique({ where: { id: data.sessionId }, select: { status: true } });
      return s?.status === "OPEN";
    }
    return false;
  } catch {
    return false; // a normal reconnect still works; it just re-syncs
  }
}

/** The longest delay setTimeout accepts. */
const MAX_TIMER_MS = 2 ** 31 - 1;

export type IoServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/**
 * Socket.io server.
 *  • Authenticates the handshake from the same httpOnly cookies as REST.
 *  • The server picks the rooms; clients can't subscribe to anything else.
 *  • Only two client events exist (`session:sync`, `kds:subscribe`); all
 *    changes go through REST so nothing is lost if a socket drops.
 */
export function createSocketServer(httpServer: HttpServer, deps: { db: Db; env: Env; logger: Logger }) {
  const { db, env, logger } = deps;
  const allowConnection = createConnectionLimiter();
  const io: IoServer = new Server(httpServer, {
    path: "/socket.io",
    cors: { origin: env.CORS_ORIGINS, credentials: true },
    serveClient: false,
    // CORS doesn't cover WebSockets, so check the Origin here. Browsers always send it
    // on WebSockets and cross-site requests, and can't fake it.
    allowRequest: (req, done) => {
      const { origin } = req.headers;
      if (origin && !env.CORS_ORIGINS.includes(origin)) return done("Origin not allowed", false);
      done(null, allowConnection(connectionAddress(req, env.TRUST_PROXY)));
    },
    pingInterval: 20_000,
    pingTimeout: 20_000,
    maxHttpBufferSize: 10_000,
    // Recover short disconnects (e.g. phone switching networks) without a resync.
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60_000, skipMiddlewares: false },
  });

  const realtime: Realtime = {
    emit(target, event, ...args) {
      io.to(target).emit(event, ...args);
    },
    disconnectStaffSessions(sessionIds) {
      if (sessionIds.length) io.in(sessionIds.map(rooms.staffSession)).disconnectSockets(true);
    },
    disconnectTableSession(sessionId) {
      io.in(rooms.session(sessionId)).disconnectSockets(true);
    },
  };

  const sessionCfg = { qrSecret: env.QR_TOKEN_SECRET, idleMinutes: env.SESSION_IDLE_MINUTES };

  // Socket.io replays events missed during a short disconnect BEFORE the auth check
  // below runs, so a login that was revoked or a visit that closed meanwhile must
  // not get that far.
  const adapter = io.of("/").adapter;
  const restoreSession = adapter.restoreSession.bind(adapter);
  adapter.restoreSession = async (pid, offset) => {
    const session = await restoreSession(pid, offset);
    return session && (await stillAllowed(db, session.data as SocketData))
      ? session
      : (null as unknown as typeof session);
  };

  io.use(async (socket, next) => {
    try {
      const cookies = parseCookies(socket.request.headers.cookie ?? "");
      // Staff take precedence when a device has both cookies (e.g. a manager testing the guest view).
      const staff = await resolveStaffSession(db, cookies[STAFF_COOKIE]);
      if (staff) {
        socket.data = {
          kind: "staff",
          staffId: staff.id,
          role: staff.role,
          sessionId: staff.sessionId,
          expiresAt: staff.expiresAt.getTime(),
        };
        return next();
      }
      const guest = await resolveGuest(db, realtime, sessionCfg, cookies[GUEST_COOKIE]);
      socket.data = { kind: "guest", guestId: guest.id, sessionId: guest.sessionId };
      next();
    } catch (e) {
      const err = new Error(e instanceof ApiError ? e.code : "UNAUTHORIZED") as Error & { data?: unknown };
      err.data = e instanceof ApiError ? { code: e.code, details: e.details } : { code: "UNAUTHORIZED" };
      next(err);
    }
  });

  io.on("connection", (socket) => {
    const data = socket.data;
    // The server picks the rooms, including for a recovered connection (whose cookie may have changed).
    if (socket.recovered) {
      for (const room of socket.rooms) if (room !== socket.id) void socket.leave(room);
    }
    void socket.join(rooms.everyone);
    if (data.kind === "guest") {
      void socket.join(rooms.session(data.sessionId));
    } else if (data.role === "manager") {
      void socket.join([rooms.managers, rooms.waiters]);
    } else if (data.role === "waiter") {
      void socket.join(rooms.waiters);
    }

    // A staff socket lasts no longer than the login it was opened with.
    if (data.kind === "staff") {
      void socket.join(rooms.staffSession(data.sessionId));
      const expiry = setTimeout(() => socket.disconnect(true), Math.min(data.expiresAt - Date.now(), MAX_TIMER_MS));
      socket.on("disconnect", () => clearTimeout(expiry));
    }

    // Light per-socket flood protection.
    let tokens = 10;
    const refill = setInterval(() => (tokens = Math.min(10, tokens + 1)), 1000);
    socket.on("disconnect", () => clearInterval(refill));
    const allow = () => tokens-- > 0;

    socket.on("session:sync", async (payload, ack) => {
      if (typeof ack !== "function") return;
      const reply = (r: SyncAck) => ack(r);
      const parsed = sessionSyncPayload.safeParse(payload);
      if (data.kind !== "guest" || !allow() || !parsed.success) return reply({ ok: false, error: "NO_SESSION" });
      try {
        const session = await db.tableSession.findUnique({
          where: { id: data.sessionId },
          select: { status: true, version: true },
        });
        if (!session) return reply({ ok: false, error: "NO_SESSION" });
        if (session.status === "CLOSED") return reply({ ok: false, error: "SESSION_CLOSED" });
        const { version } = parsed.data;
        if (version === session.version) return reply({ ok: true, upToDate: true, version });
        reply({
          ok: true,
          upToDate: false,
          snapshot: await buildSnapshot(db, data.sessionId, data.guestId, env.QR_TOKEN_SECRET),
        });
      } catch (e) {
        logger.error({ err: safeForLogs(e) }, "session:sync failed");
        reply({ ok: false, error: "NO_SESSION" });
      }
    });

    socket.on("kds:subscribe", async (payload, ack) => {
      if (typeof ack !== "function") return;
      const parsed = kdsSubscribePayload.safeParse(payload);
      if (
        data.kind !== "staff" ||
        (data.role !== "kitchen" && data.role !== "manager") ||
        !allow() ||
        !parsed.success
      ) {
        return ack({ ok: false });
      }
      const wanted = parsed.data.stations;
      for (const station of ["kitchen", "bar"] as const) {
        if (wanted.includes(station)) await socket.join(rooms.kds(station));
        else await socket.leave(rooms.kds(station));
      }
      ack({ ok: true });
    });
  });

  return { io, realtime };
}
