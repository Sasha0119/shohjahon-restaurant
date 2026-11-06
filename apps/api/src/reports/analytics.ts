import { eachDay } from "@app/shared";
import type { AnalyticsDTO, AnalyticsKpisDTO } from "@app/shared/api";
import type { Db } from "../db.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { previousRange, type ResolvedRange } from "./range.ts";

/**
 * Analytics for a date range, all in the restaurant's time zone.
 * Timestamps are stored as UTC; `(col AT TIME ZONE 'UTC') AT TIME ZONE tz`
 * turns them into local wall-clock time inside PostgreSQL, so "per day" and
 * "busiest hour" follow the restaurant's calendar.
 *
 * Definitions
 *  • revenue   = confirmed payments (excluding tips), by when they completed
 *  • orders    = rounds sent to the kitchen (a round may be 2 tickets), not cancelled
 *  • avg bill  = average paid per visit, over visits with at least one payment
 *  • rating    = reviews left in the range (all ratings, public and private)
 */
const n = (v: unknown) => Number(v ?? 0);

/**
 * Columns are UTC "timestamp without time zone". Bind bounds as explicit UTC
 * so results never depend on the database server's TimeZone setting.
 */
const at = (d: Date) => Prisma.sql`(${d.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;

async function kpis(db: Db, r: ResolvedRange): Promise<AnalyticsKpisDTO> {
  const [pay, ord, guests, ratings, perVisit] = await Promise.all([
    db.$queryRaw<{ revenue: bigint | null; tips: bigint | null }[]>`
      SELECT SUM(amount_cents) AS revenue, SUM(tip_cents) AS tips
      FROM payments WHERE status = 'SUCCEEDED' AND completed_at >= ${at(r.start)} AND completed_at < ${at(r.end)}`,
    db.$queryRaw<{ rounds: bigint; items: bigint | null }[]>`
      SELECT COUNT(DISTINCT (o.session_id, o.round)) AS rounds, SUM(oi.quantity) AS items
      FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.status <> 'CANCELLED' AND o.created_at >= ${at(r.start)} AND o.created_at < ${at(r.end)}`,
    db.sessionGuest.count({ where: { createdAt: { gte: r.start, lt: r.end } } }),
    db.review.aggregate({ where: { createdAt: { gte: r.start, lt: r.end } }, _avg: { rating: true }, _count: true }),
    db.$queryRaw<{ total: bigint }[]>`
      SELECT SUM(amount_cents) AS total FROM payments
      WHERE status = 'SUCCEEDED' AND completed_at >= ${at(r.start)} AND completed_at < ${at(r.end)}
      GROUP BY session_id`,
  ]);
  const visitTotals = perVisit.map((v) => n(v.total));
  return {
    revenueCents: n(pay[0]?.revenue),
    tipsCents: n(pay[0]?.tips),
    orders: n(ord[0]?.rounds),
    itemsSold: n(ord[0]?.items),
    guests,
    paidVisits: visitTotals.length,
    avgBillCents: visitTotals.length ? Math.round(visitTotals.reduce((a, b) => a + b, 0) / visitTotals.length) : 0,
    avgRating: ratings._count ? Math.round((ratings._avg.rating ?? 0) * 100) / 100 : null,
    ratingCount: ratings._count,
  };
}

export async function buildAnalytics(db: Db, r: ResolvedRange, timeZone: string): Promise<AnalyticsDTO> {
  const prev = previousRange(r, timeZone);
  const [current, previous, salesRows, orderRows, topRows, hourRows, ratingRows] = await Promise.all([
    kpis(db, r),
    kpis(db, prev),
    db.$queryRaw<{ day: string; revenue: bigint }[]>`
      SELECT to_char((completed_at AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS day, SUM(amount_cents) AS revenue
      FROM payments WHERE status = 'SUCCEEDED' AND completed_at >= ${at(r.start)} AND completed_at < ${at(r.end)}
      GROUP BY day`,
    db.$queryRaw<{ day: string; rounds: bigint }[]>`
      SELECT to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS day,
             COUNT(DISTINCT (session_id, round)) AS rounds
      FROM orders WHERE status <> 'CANCELLED' AND created_at >= ${at(r.start)} AND created_at < ${at(r.end)}
      GROUP BY day`,
    db.$queryRaw<{ item_id: string; name: string; quantity: bigint; revenue: bigint }[]>`
      SELECT oi.item_id, MAX(oi.name) AS name, SUM(oi.quantity) AS quantity, SUM(oi.quantity * oi.unit_price_cents) AS revenue
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.status <> 'CANCELLED' AND o.created_at >= ${at(r.start)} AND o.created_at < ${at(r.end)}
      GROUP BY oi.item_id ORDER BY quantity DESC, revenue DESC LIMIT 10`,
    db.$queryRaw<{ dow: number; hour: number; rounds: bigint }[]>`
      SELECT EXTRACT(ISODOW FROM (created_at AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone})::int AS dow,
             EXTRACT(HOUR FROM (created_at AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone})::int AS hour,
             COUNT(DISTINCT (session_id, round)) AS rounds
      FROM orders WHERE status <> 'CANCELLED' AND created_at >= ${at(r.start)} AND created_at < ${at(r.end)}
      GROUP BY dow, hour`,
    db.review.groupBy({ by: ["rating"], where: { createdAt: { gte: r.start, lt: r.end } }, _count: true }),
  ]);

  const sales = new Map(salesRows.map((x) => [x.day, n(x.revenue)]));
  const rounds = new Map(orderRows.map((x) => [x.day, n(x.rounds)]));
  const busiest = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const h of hourRows) busiest[h.dow - 1]![h.hour] = n(h.rounds);
  const distribution: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  for (const g of ratingRows) if (g.rating >= 1 && g.rating <= 5) distribution[g.rating - 1] = g._count;

  return {
    range: { from: r.from, to: r.to, days: r.days, timezone: timeZone },
    kpis: current,
    previous,
    salesByDay: eachDay(r.from, r.to).map((date) => ({
      date,
      revenueCents: sales.get(date) ?? 0,
      orders: rounds.get(date) ?? 0,
    })),
    topItems: topRows.map((x) => ({
      itemId: x.item_id,
      name: x.name,
      quantity: n(x.quantity),
      revenueCents: n(x.revenue),
    })),
    busiestHours: busiest,
    ratings: { average: current.avgRating, count: current.ratingCount, distribution },
  };
}
