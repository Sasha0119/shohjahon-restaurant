import { tableInput, zId, type AdminTableDTO } from "@app/shared/api";
import QRCode from "qrcode";
import { z } from "zod";
import { audit } from "../audit.ts";
import type { Db } from "../db.ts";
import type { Env } from "../env.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { errors, parse } from "../http/errors.ts";
import type { createRegistrar } from "../http/registrar.ts";
import type { Realtime } from "../realtime/types.ts";
import { tableStatus } from "../sessions/rules.ts";
import { closeSession, emitTableStatus } from "../sessions/service.ts";
import { createQrToken, guestTableUrl } from "./qr-token.ts";

type On = ReturnType<typeof createRegistrar>["on"];

const qrQuery = z.object({
  format: z.enum(["svg", "png"]).default("svg"),
  size: z.coerce.number().int().min(128).max(2048).default(512),
});

export function registerTableAdminRoutes(on: On, db: Db, env: Env, realtime: Realtime) {
  const urlFor = (t: { id: string; qrVersion: number }) =>
    guestTableUrl(env.PUBLIC_WEB_URL, createQrToken(env.QR_TOKEN_SECRET, t.id, t.qrVersion));

  const loadTables = async (where: Prisma.DiningTableWhereInput = {}): Promise<AdminTableDTO[]> => {
    const tables = await db.diningTable.findMany({
      where,
      orderBy: { number: "asc" },
      include: {
        sessions: {
          where: { status: "OPEN" },
          include: {
            _count: { select: { guests: true, orders: { where: { status: { not: "CANCELLED" } } } } },
            calls: { where: { type: "BILL", status: "OPEN" }, select: { id: true } },
          },
        },
      },
    });
    return tables.map((t) => {
      const s = t.sessions[0];
      return {
        id: t.id,
        number: t.number,
        label: t.label,
        seats: t.seats,
        active: t.active,
        url: urlFor(t),
        status: tableStatus({
          hasOpenSession: !!s,
          hasActiveOrders: (s?._count.orders ?? 0) > 0,
          billRequested: (s?.calls.length ?? 0) > 0,
        }),
        session: s
          ? {
              id: s.id,
              guestCount: s._count.guests,
              openedAt: s.openedAt.toISOString(),
              lastActivityAt: s.lastActivityAt.toISOString(),
            }
          : null,
      };
    });
  };

  const loadOne = async (rawId: unknown) => {
    const id = parse(zId, rawId);
    const table = await db.diningTable.findUnique({ where: { id } });
    if (!table) throw errors.notFound("Table");
    return table;
  };

  const numberTaken = (e: unknown) =>
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
      ? errors.conflict("TABLE_NUMBER_TAKEN", "Another table already has this number.")
      : e;

  on("GET", "/api/admin/tables", async (_req, res) => {
    res.json({ tables: await loadTables() });
  });

  on("POST", "/api/admin/tables", async (req, res) => {
    const input = parse(tableInput, req.body);
    try {
      const t = await db.diningTable.create({ data: { ...input, label: input.label || null } });
      await audit(db, {
        actor: { type: "staff", staffId: req.staff!.id },
        action: "table.created",
        entityType: "table",
        entityId: t.id,
        data: { number: t.number },
        ip: req.ip,
      });
      await emitTableStatus(db, realtime, t.id);
      res.status(201).json({ table: (await loadTables({ id: t.id }))[0] });
    } catch (e) {
      throw numberTaken(e);
    }
  });

  on("PUT", "/api/admin/tables/:tableId", async (req, res) => {
    const table = await loadOne(req.params.tableId);
    const input = parse(tableInput, req.body);
    try {
      await db.diningTable.update({ where: { id: table.id }, data: { ...input, label: input.label || null } });
    } catch (e) {
      throw numberTaken(e);
    }
    // Deactivating a table ends its current visit.
    if (table.active && !input.active) {
      const open = await db.tableSession.findFirst({ where: { tableId: table.id, status: "OPEN" }, select: { id: true } });
      if (open) await closeSession(db, realtime, open.id, "STAFF", { staffId: req.staff!.id, ip: req.ip });
    }
    await audit(db, {
      actor: { type: "staff", staffId: req.staff!.id },
      action: "table.updated",
      entityType: "table",
      entityId: table.id,
      data: input,
      ip: req.ip,
    });
    await emitTableStatus(db, realtime, table.id);
    res.json({ table: (await loadTables({ id: table.id }))[0] });
  });

  on("GET", "/api/admin/tables/:tableId/qr", async (req, res) => {
    const table = await loadOne(req.params.tableId);
    const { format, size } = parse(qrQuery, req.query);
    const url = urlFor(table);
    const opts = { errorCorrectionLevel: "M" as const, margin: 2, width: size, color: { dark: "#111111", light: "#ffffff" } };
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Disposition", `inline; filename="table-${table.number}-qr.${format}"`);
    if (format === "png") {
      res.type("png").send(await QRCode.toBuffer(url, opts));
    } else {
      res.type("image/svg+xml").send(await QRCode.toString(url, { ...opts, type: "svg" }));
    }
  });

  on("POST", "/api/admin/tables/:tableId/rotate-qr", async (req, res) => {
    const table = await loadOne(req.params.tableId);
    const updated = await db.diningTable.update({ where: { id: table.id }, data: { qrVersion: { increment: 1 } } });
    await audit(db, {
      actor: { type: "staff", staffId: req.staff!.id },
      action: "table.qr_rotated",
      entityType: "table",
      entityId: table.id,
      data: { qrVersion: updated.qrVersion },
      ip: req.ip,
    });
    res.json({ table: (await loadTables({ id: table.id }))[0] });
  });
}
