import type { Server as HttpServer } from "node:http";
import {
  rooms,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SocketData,
  type SyncAck,
} from "@app/shared/api";
import { parse as parseCookies } from "cookie";
import type { Logger } from "pino";
import { Server } from "socket.io";
import { STAFF_COOKIE, resolveStaffSession } from "../auth/session.ts";
import type { Db } from "../db.ts";
import type { Env } from "../env.ts";
import { ApiError } from "../http/errors.ts";
import { GUEST_COOKIE, resolveGuest } from "../sessions/service.ts";
import { buildSnapshot } from "../sessions/snapshot.ts";
import type { Realtime } from "./types.ts";

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
  const io: IoServer = new Server(httpServer, {
    path: "/socket.io",
    cors: { origin: env.CORS_ORIGINS, credentials: true },
    serveClient: false,
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
  };

  const sessionCfg = { qrSecret: env.QR_TOKEN_SECRET, idleMinutes: env.SESSION_IDLE_MINUTES };

  io.use(async (socket, next) => {
    try {
      const cookies = parseCookies(socket.request.headers.cookie ?? "");
      // Staff take precedence when a device has both cookies (e.g. a manager testing the guest view).
      const staff = await resolveStaffSession(db, cookies[STAFF_COOKIE]);
      if (staff) {
        socket.data = { kind: "staff", staffId: staff.id, role: staff.role };
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
    void socket.join(rooms.everyone);
    if (data.kind === "guest") {
      void socket.join(rooms.session(data.sessionId));
    } else if (data.role === "manager") {
      void socket.join([rooms.managers, rooms.waiters]);
    } else if (data.role === "waiter") {
      void socket.join(rooms.waiters);
    }

    // Light per-socket flood protection.
    let tokens = 10;
    const refill = setInterval(() => (tokens = Math.min(10, tokens + 1)), 1000);
    socket.on("disconnect", () => clearInterval(refill));
    const allow = () => tokens-- > 0;

    socket.on("session:sync", async (payload, ack) => {
      if (typeof ack !== "function") return;
      const reply = (r: SyncAck) => ack(r);
      if (data.kind !== "guest" || !allow()) return reply({ ok: false, error: "NO_SESSION" });
      try {
        const session = await db.tableSession.findUnique({
          where: { id: data.sessionId },
          select: { status: true, version: true },
        });
        if (!session) return reply({ ok: false, error: "NO_SESSION" });
        if (session.status === "CLOSED") return reply({ ok: false, error: "SESSION_CLOSED" });
        const version = Number(payload?.version);
        if (Number.isInteger(version) && version === session.version) {
          return reply({ ok: true, upToDate: true, version });
        }
        reply({ ok: true, upToDate: false, snapshot: await buildSnapshot(db, data.sessionId, data.guestId) });
      } catch (e) {
        logger.error({ err: e }, "session:sync failed");
        reply({ ok: false, error: "NO_SESSION" });
      }
    });

    socket.on("kds:subscribe", async (payload, ack) => {
      if (typeof ack !== "function") return;
      if (data.kind !== "staff" || (data.role !== "kitchen" && data.role !== "manager") || !allow()) {
        return ack({ ok: false });
      }
      const wanted = Array.isArray(payload?.stations) ? payload.stations : [];
      for (const station of ["kitchen", "bar"] as const) {
        if (wanted.includes(station)) await socket.join(rooms.kds(station));
        else await socket.leave(rooms.kds(station));
      }
      ack({ ok: true });
    });
  });

  return { io, realtime };
}
