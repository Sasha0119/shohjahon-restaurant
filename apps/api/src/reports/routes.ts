import { brand } from "@app/config";
import { currencyDigits, zonedDate } from "@app/shared";
import { auditQuery, dateRangeQuery, ordersQuery, type AdminOrderDTO, type AuditEntryDTO } from "@app/shared/api";
import type { z } from "zod";
import type { Db } from "../db.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { parse } from "../http/errors.ts";
import type { createRegistrar } from "../http/registrar.ts";
import { enums } from "../lib/enums.ts";
import { buildAnalytics } from "./analytics.ts";
import { centsToDecimal, csvDocument } from "./csv.ts";
import { resolveRange } from "./range.ts";

type On = ReturnType<typeof createRegistrar>["on"];
const AUDIT_PAGE = 50;
const EXPORT_LIMIT = 20_000;

const orderInclude = {
  session: { select: { table: { select: { number: true } } } },
  items: { orderBy: { createdAt: "asc" as const }, include: { modifiers: { select: { optionName: true } } } },
} satisfies Prisma.OrderInclude;

function orderWhere(q: z.output<typeof ordersQuery>, start: Date, end: Date): Prisma.OrderWhereInput {
  return {
    createdAt: { gte: start, lt: end },
    ...(q.status ? { status: enums.orderStatus.toDb(q.status) } : {}),
    ...(q.station ? { station: enums.station.toDb(q.station) } : {}),
    ...(q.table ? { session: { table: { number: q.table } } } : {}),
  };
}

function toAdminOrder(o: Prisma.OrderGetPayload<{ include: typeof orderInclude }>): AdminOrderDTO {
  return {
    id: o.id,
    createdAt: o.createdAt.toISOString(),
    tableNumber: o.session.table.number,
    round: o.round,
    station: enums.station.fromDb(o.station),
    status: enums.orderStatus.fromDb(o.status),
    itemCount: o.items.reduce((n, i) => n + i.quantity, 0),
    totalCents: o.items.reduce((n, i) => n + i.quantity * i.unitPriceCents, 0),
    lines: o.items.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      unitPriceCents: i.unitPriceCents,
      options: i.modifiers.map((m) => m.optionName),
      note: i.note,
    })),
  };
}

export function registerReportRoutes(on: On, db: Db) {
  const tz = brand.timezone;

  on("GET", "/api/admin/analytics", async (req, res) => {
    const q = parse(dateRangeQuery, req.query);
    res.json(await buildAnalytics(db, resolveRange(q, tz), tz));
  });

  on("GET", "/api/admin/orders", async (req, res) => {
    const q = parse(ordersQuery, req.query);
    const range = resolveRange(q, tz);
    const where = orderWhere(q, range.start, range.end);
    const [orders, total] = await Promise.all([
      db.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: orderInclude,
      }),
      db.order.count({ where }),
    ]);
    res.json({ orders: orders.map(toAdminOrder), page: q.page, pageSize: q.pageSize, total, range: { from: range.from, to: range.to } });
  });

  /** One row per ordered line — easiest to pivot in a spreadsheet. */
  on("GET", "/api/admin/orders/export.csv", async (req, res) => {
    const q = parse(ordersQuery, req.query);
    const range = resolveRange(q, tz);
    const orders = await db.order.findMany({
      where: orderWhere(q, range.start, range.end),
      orderBy: { createdAt: "asc" },
      take: EXPORT_LIMIT,
      include: orderInclude,
    });
    const digits = currencyDigits(brand.currency.code);
    const time = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    const rows = orders.flatMap((o) =>
      o.items.map((i) => [
        zonedDate(o.createdAt, tz),
        time.format(o.createdAt),
        o.session.table.number,
        o.round,
        enums.station.fromDb(o.station),
        enums.orderStatus.fromDb(o.status),
        i.name,
        i.modifiers.map((m) => m.optionName).join("; "),
        i.note ?? "",
        i.quantity,
        centsToDecimal(i.unitPriceCents, digits),
        centsToDecimal(i.unitPriceCents * i.quantity, digits),
        i.addedByName,
        o.id,
      ]),
    );
    const header = [
      "date", "time", "table", "round", "station", "status", "item", "options", "note",
      "quantity", `unit_price_${brand.currency.code}`, `line_total_${brand.currency.code}`, "added_by", "order_id",
    ];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="orders_${range.from}_to_${range.to}.csv"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(csvDocument(header, rows));
  });

  on("GET", "/api/admin/audit", async (req, res) => {
    const q = parse(auditQuery, req.query);
    const range = resolveRange(q, tz);
    const where: Prisma.AuditLogWhereInput = {
      createdAt: { gte: range.start, lt: range.end },
      ...(q.action ? { action: { startsWith: q.action } } : {}),
      ...(q.entityType ? { entityType: q.entityType } : {}),
    };
    const [entries, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * AUDIT_PAGE,
        take: AUDIT_PAGE,
        include: { actorStaff: { select: { name: true } } },
      }),
      db.auditLog.count({ where }),
    ]);
    const guestIds = [...new Set(entries.map((e) => e.actorGuestId).filter((x): x is string => !!x))];
    const guests = guestIds.length
      ? new Map((await db.sessionGuest.findMany({ where: { id: { in: guestIds } }, select: { id: true, nickname: true } })).map((g) => [g.id, g.nickname]))
      : new Map<string, string>();
    const out: AuditEntryDTO[] = entries.map((e) => ({
      id: e.id,
      createdAt: e.createdAt.toISOString(),
      actor: {
        type: e.actorType === "STAFF" ? "staff" : e.actorType === "GUEST" ? "guest" : "system",
        name: e.actorType === "STAFF" ? (e.actorStaff?.name ?? null) : e.actorGuestId ? guests.get(e.actorGuestId) || null : null,
      },
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      data: e.data,
      ip: e.ip,
    }));
    res.json({ entries: out, page: q.page, pageSize: AUDIT_PAGE, total, range: { from: range.from, to: range.to } });
  });
}
