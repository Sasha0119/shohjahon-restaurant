import { joinSessionBody, rooms, updateGuestBody, zId } from "@app/shared/api";
import type { Db } from "../db.ts";
import type { Env } from "../env.ts";
import { errors, parse } from "../http/errors.ts";
import type { createRegistrar } from "../http/registrar.ts";
import type { Realtime } from "../realtime/types.ts";
import { GUEST_COOKIE, GUEST_COOKIE_HOURS, bumpVersion, closeSession, guestsOf, joinTable } from "./service.ts";
import { buildSnapshot } from "./snapshot.ts";

type On = ReturnType<typeof createRegistrar>["on"];

function guestCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: GUEST_COOKIE_HOURS * 3_600_000,
  };
}

export function registerSessionRoutes(on: On, db: Db, env: Env, realtime: Realtime) {
  const cfg = { qrSecret: env.QR_TOKEN_SECRET, idleMinutes: env.SESSION_IDLE_MINUTES };

  on("POST", "/api/tables/:qrToken/join", async (req, res) => {
    const body = parse(joinSessionBody, req.body ?? {});
    const result = await joinTable(db, realtime, cfg, {
      qrToken: String(req.params.qrToken),
      guestToken: req.cookies?.[GUEST_COOKIE],
      confirmJoin: body.confirmJoin,
      confirmSwitch: body.confirmSwitch,
      confirmReserved: body.confirmReserved,
    });
    if (result.newGuestToken) {
      res.cookie(GUEST_COOKIE, result.newGuestToken, guestCookieOptions(env.COOKIE_SECURE));
    }
    res.status(result.rejoined ? 200 : 201).json({
      rejoined: result.rejoined,
      snapshot: await buildSnapshot(db, result.sessionId, result.guestId),
    });
  });

  on("GET", "/api/session", async (req, res) => {
    const g = req.guest!;
    res.json({ snapshot: await buildSnapshot(db, g.sessionId, g.id) });
  });

  on("PATCH", "/api/session/me", async (req, res) => {
    const g = req.guest!;
    const { nickname } = parse(updateGuestBody, req.body);
    await db.sessionGuest.update({ where: { id: g.id }, data: { nickname } });
    const version = await bumpVersion(db, g.sessionId);
    const guests = await guestsOf(db, g.sessionId);
    realtime.emit(rooms.session(g.sessionId), "session:guests", { version, guests });
    res.json({ version, me: { id: g.id, nickname }, guests });
  });

  on("POST", "/api/waiter/sessions/:sessionId/close", async (req, res) => {
    const sessionId = parse(zId, req.params.sessionId);
    const exists = await db.tableSession.findUnique({ where: { id: sessionId }, select: { status: true } });
    if (!exists) throw errors.notFound("Session");
    const closed = await closeSession(db, realtime, sessionId, "STAFF", { staffId: req.staff!.id, ip: req.ip });
    if (!closed) throw errors.conflict("ALREADY_CLOSED", "This session is already closed.");
    res.json({ ok: true, version: closed.version });
  });
}
