import { passwordLoginBody, pinLoginBody } from "@app/shared/api";
import type { Response } from "express";
import type { Db } from "../db.ts";
import type { Env } from "../env.ts";
import type { Staff } from "../generated/prisma/client.ts";
import { errors, parse } from "../http/errors.ts";
import type { createRegistrar } from "../http/registrar.ts";
import { enums } from "../lib/enums.ts";
import { loginWithPassword, loginWithPin } from "./login.ts";
import { STAFF_COOKIE, createStaffSession, revokeSession, staffCookieOptions } from "./session.ts";

type On = ReturnType<typeof createRegistrar>["on"];

export const publicStaff = (s: Pick<Staff, "id" | "name" | "role">) => ({
  id: s.id,
  name: s.name,
  role: enums.role.fromDb(s.role),
});

export function registerAuthRoutes(on: On, db: Db, env: Env) {
  const startSession = async (res: Response, staff: Staff, ip: string | undefined, userAgent?: string) => {
    const { token, expiresAt } = await createStaffSession(db, staff.id, {
      hours: env.STAFF_SESSION_HOURS,
      ip,
      userAgent,
    });
    res.cookie(STAFF_COOKIE, token, staffCookieOptions(env.COOKIE_SECURE, expiresAt.getTime() - Date.now()));
    res.json({ staff: publicStaff(staff), expiresAt: expiresAt.toISOString() });
  };

  on("POST", "/api/auth/login", async (req, res) => {
    const body = parse(passwordLoginBody, req.body);
    const staff = await loginWithPassword(db, body.email, body.password, { ip: req.ip });
    await startSession(res, staff, req.ip, req.get("user-agent"));
  });

  on("GET", "/api/auth/pin-staff", async (_req, res) => {
    const staff = await db.staff.findMany({
      where: { active: true, role: { in: ["WAITER", "KITCHEN"] } },
      select: { id: true, name: true, role: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });
    res.json({ staff: staff.map(publicStaff) });
  });

  on("POST", "/api/auth/pin", async (req, res) => {
    const body = parse(pinLoginBody, req.body);
    const staff = await loginWithPin(db, body.staffId, body.pin, { ip: req.ip });
    await startSession(res, staff, req.ip, req.get("user-agent"));
  });

  on("POST", "/api/auth/logout", async (req, res) => {
    if (!req.staff) throw errors.unauthorized();
    await revokeSession(db, req.staff.sessionId);
    res.clearCookie(STAFF_COOKIE, staffCookieOptions(env.COOKIE_SECURE));
    res.status(204).end();
  });

  on("GET", "/api/auth/me", (req, res) => {
    const { id, name, role } = req.staff!;
    res.json({ staff: { id, name, role } });
  });
}
