import { resetPasswordBody, resetPinBody, staffInput, staffUpdateInput, zId } from "@app/shared/api";
import { audit } from "../audit.ts";
import { hashSecret } from "../auth/hash.ts";
import { afterSuccess } from "../auth/lockout.ts";
import type { Db } from "../db.ts";
import { Prisma, type Staff } from "../generated/prisma/client.ts";
import { ApiError, errors, parse } from "../http/errors.ts";
import type { createRegistrar } from "../http/registrar.ts";
import { enums } from "../lib/enums.ts";

type On = ReturnType<typeof createRegistrar>["on"];

const toDTO = (s: Staff, now = new Date()) => ({
  id: s.id,
  name: s.name,
  role: enums.role.fromDb(s.role),
  email: s.email,
  active: s.active,
  locked: !!s.lockedUntil && s.lockedUntil > now,
  lastLoginAt: s.lastLoginAt?.toISOString() ?? null,
  createdAt: s.createdAt.toISOString(),
});

export function registerStaffAdminRoutes(on: On, db: Db) {
  const load = async (rawId: unknown) => {
    const id = parse(zId, rawId);
    const staff = await db.staff.findUnique({ where: { id } });
    if (!staff) throw errors.notFound("Staff member");
    return staff;
  };

  on("GET", "/api/admin/staff", async (_req, res) => {
    const staff = await db.staff.findMany({ orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }] });
    res.json({ staff: staff.map((s) => toDTO(s)) });
  });

  on("POST", "/api/admin/staff", async (req, res) => {
    const input = parse(staffInput, req.body);
    const data =
      input.role === "manager"
        ? {
            name: input.name,
            role: "MANAGER" as const,
            email: input.email,
            passwordHash: await hashSecret(input.password),
          }
        : { name: input.name, role: enums.role.toDb(input.role), pinHash: await hashSecret(input.pin) };
    try {
      const created = await db.$transaction(async (tx) => {
        const s = await tx.staff.create({ data });
        await audit(tx, {
          actor: { type: "staff", staffId: req.staff!.id },
          action: "staff.created",
          entityType: "staff",
          entityId: s.id,
          data: { name: s.name, role: input.role },
          ip: req.ip,
        });
        return s;
      });
      res.status(201).json({ staff: toDTO(created) });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw errors.conflict("EMAIL_TAKEN", "Another account already uses this email.");
      }
      throw e;
    }
  });

  on("PATCH", "/api/admin/staff/:staffId", async (req, res) => {
    const staff = await load(req.params.staffId);
    const input = parse(staffUpdateInput, req.body);

    if (input.active === false && staff.active) {
      if (staff.id === req.staff!.id) {
        throw errors.badRequest("CANNOT_DEACTIVATE_SELF", "You can't deactivate your own account.");
      }
      if (staff.role === "MANAGER") {
        const others = await db.staff.count({ where: { role: "MANAGER", active: true, id: { not: staff.id } } });
        if (others === 0) throw errors.badRequest("LAST_MANAGER", "At least one manager must stay active.");
      }
    }

    const updated = await db.$transaction(async (tx) => {
      const s = await tx.staff.update({ where: { id: staff.id }, data: input });
      if (input.active === false) {
        await tx.staffSession.updateMany({
          where: { staffId: s.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await audit(tx, {
        actor: { type: "staff", staffId: req.staff!.id },
        action: "staff.updated",
        entityType: "staff",
        entityId: s.id,
        data: input,
        ip: req.ip,
      });
      return s;
    });
    res.json({ staff: toDTO(updated) });
  });

  /** Shared by PIN and password reset: set the secret, unlock, sign out other sessions. */
  const resetSecret = async (
    req: Parameters<Parameters<On>[2]>[0],
    staff: Staff,
    data: { pinHash: string } | { passwordHash: string },
    action: string,
  ) => {
    return db.$transaction(async (tx) => {
      const s = await tx.staff.update({ where: { id: staff.id }, data: { ...data, ...afterSuccess() } });
      // Signs the member out everywhere — except the manager's own current session when resetting their own password.
      await tx.staffSession.updateMany({
        where: { staffId: s.id, revokedAt: null, id: { not: req.staff!.sessionId } },
        data: { revokedAt: new Date() },
      });
      await audit(tx, {
        actor: { type: "staff", staffId: req.staff!.id },
        action,
        entityType: "staff",
        entityId: s.id,
        ip: req.ip,
      });
      return s;
    });
  };

  on("POST", "/api/admin/staff/:staffId/reset-pin", async (req, res) => {
    const staff = await load(req.params.staffId);
    if (staff.role === "MANAGER") throw new ApiError(400, "WRONG_CREDENTIAL_TYPE", "Managers sign in with a password.");
    const { pin } = parse(resetPinBody, req.body);
    const updated = await resetSecret(req, staff, { pinHash: await hashSecret(pin) }, "staff.pin_reset");
    res.json({ staff: toDTO(updated) });
  });

  on("POST", "/api/admin/staff/:staffId/reset-password", async (req, res) => {
    const staff = await load(req.params.staffId);
    if (staff.role !== "MANAGER")
      throw new ApiError(400, "WRONG_CREDENTIAL_TYPE", "Waiters and kitchen staff use a PIN.");
    const { password } = parse(resetPasswordBody, req.body);
    const updated = await resetSecret(req, staff, { passwordHash: await hashSecret(password) }, "staff.password_reset");
    res.json({ staff: toDTO(updated) });
  });
}
