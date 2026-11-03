"use client";

import { brand } from "@app/config";
import type { AnalyticsDTO, AnalyticsKpisDTO } from "@app/shared/api";
import { BarChart3, CloudOff, Star } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { BarList, ChartCard, ColumnChart, DataTable, Heatmap, StatTile, compactMoney, formatCount, type Delta } from "@/components/admin/charts";
import { DateRangeFilter, formatLocalDate, presetRange, rangeQuery, type DateRange } from "@/components/admin/date-range";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { useT } from "@/i18n";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";

const locale = brand.currency.locale;
/** Monday-first short weekday names (the API's busiest-hours rows start on Monday). */
const WEEKDAYS = Array.from({ length: 7 }, (_, i) =>
  new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1 + i))),
);
const hourLabel = (h: number) =>
  new Intl.DateTimeFormat(locale, { hour: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1, h)));
const hourRange = (h: number) => {
  const f = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
  return [f.format(new Date(Date.UTC(2024, 0, 1, h))), f.format(new Date(Date.UTC(2024, 0, 1, h + 1)))] as const;
};
const pct = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 });
const rating = (v: number) => new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);

export default function OverviewPage() {
  const t = useT();
  const [range, setRange] = useState<DateRange>(() => presetRange("30"));
  const [data, setData] = useState<AnalyticsDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const req = useRef(0);

  const load = useCallback(async (r: DateRange) => {
    const id = ++req.current;
    setLoading(true);
    try {
      const res = await api<AnalyticsDTO>("GET", `/api/admin/analytics?${rangeQuery(r)}`);
      if (id !== req.current) return; // a newer range was picked meanwhile
      setData(res);
      setFailed(false);
    } catch {
      if (id === req.current) setFailed(true);
    } finally {
      if (id === req.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load(range);
  }, [load, range]);

  const context = data && data.range.days === 1 ? t("admin.overview.vsPreviousDay") : t("admin.overview.vsPrevious", { days: data?.range.days ?? 0 });
  /** Relative change for counts and money; absolute change for the rating. */
  const delta = (key: keyof AnalyticsKpisDTO, kind: "relative" | "absolute" = "relative"): Delta | undefined => {
    if (!data) return undefined;
    const cur = data.kpis[key];
    const prev = data.previous[key];
    if (cur === null || prev === null || prev === 0) return { direction: "none", text: t("admin.overview.noComparison"), context };
    const change = kind === "relative" ? (cur - prev) / prev : cur - prev;
    const shown = kind === "relative" ? pct.format(Math.abs(change)) : rating(Math.abs(change));
    if (shown === pct.format(0) || shown === rating(0)) return { direction: "flat", text: t("admin.overview.unchanged"), context };
    return change > 0
      ? { direction: "up", text: t("admin.overview.up", { value: shown }), context }
      : { direction: "down", text: t("admin.overview.down", { value: shown }), context };
  };

  return (
    <div>
      <h1 className="text-3xl font-semibold">{t("admin.overview.title")}</h1>
      <p className="mt-1 text-fg-muted">{t("admin.overview.subtitle")}</p>

      <div className="mt-6">
        <DateRangeFilter value={range} onChange={setRange} />
        <p className="mt-2 text-xs text-fg-muted">
          {data && `${formatLocalDate(data.range.from)} – ${formatLocalDate(data.range.to)} · `}
          {t("admin.range.timezone", { zone: brand.timezone.replace(/_/g, " ") })}
        </p>
      </div>

      <div className="mt-6">
        {failed && !data ? (
          <EmptyState
            icon={CloudOff}
            title={t("admin.overview.loadError")}
            action={<Button onClick={() => void load(range)}>{t("admin.overview.retry")}</Button>}
          />
        ) : !data ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-40 rounded-card sm:col-span-2" />
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-32 rounded-card" />
            ))}
            <Skeleton className="h-80 rounded-card sm:col-span-2 lg:col-span-3" />
          </div>
        ) : (
          // Refetching keeps the previous numbers on screen, dimmed — no layout jump.
          <div className={cn("space-y-4 transition-opacity", loading && "opacity-60")} aria-busy={loading}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatTile
                hero
                className="sm:col-span-2"
                label={t("admin.overview.kpi.revenue")}
                value={formatPrice(data.kpis.revenueCents)}
                sub={t("admin.overview.kpi.paidVisits", { count: data.kpis.paidVisits })}
                delta={delta("revenueCents")}
              />
              <StatTile
                label={t("admin.overview.kpi.orders")}
                value={formatCount(data.kpis.orders)}
                sub={t("admin.overview.kpi.itemsSold", { count: data.kpis.itemsSold })}
                delta={delta("orders")}
              />
              <StatTile label={t("admin.overview.kpi.avgBill")} value={formatPrice(data.kpis.avgBillCents)} delta={delta("avgBillCents")} />
              <StatTile label={t("admin.overview.kpi.guests")} value={formatCount(data.kpis.guests)} delta={delta("guests")} />
              <StatTile label={t("admin.overview.kpi.tips")} value={formatPrice(data.kpis.tipsCents)} delta={delta("tipsCents")} />
            </div>

            <ChartCard
              title={t("admin.overview.sales.title")}
              subtitle={t("admin.overview.sales.subtitle")}
              table={
                <DataTable
                  head={[t("admin.overview.table.date"), t("admin.overview.table.revenue"), t("admin.overview.table.orders")]}
                  rows={data.salesByDay.map((d) => [formatLocalDate(d.date), formatPrice(d.revenueCents), formatCount(d.orders)])}
                />
              }
            >
              {data.salesByDay.every((d) => d.revenueCents === 0) ? (
                <EmptyState icon={BarChart3} title={t("admin.overview.sales.empty")} className="py-10" />
              ) : (
                <ColumnChart
                  label={t("admin.overview.sales.title")}
                  formatTick={compactMoney}
                  points={data.salesByDay.map((d) => ({
                    key: d.date,
                    axisLabel: formatLocalDate(d.date, { month: "short", day: "numeric" }),
                    title: formatLocalDate(d.date, { weekday: "short", month: "short", day: "numeric" }),
                    value: d.revenueCents,
                    valueLabel: formatPrice(d.revenueCents),
                    detail: t("admin.overview.sales.orders", { count: d.orders }),
                  }))}
                />
              )}
            </ChartCard>

            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard
                title={t("admin.overview.topItems.title")}
                subtitle={t("admin.overview.topItems.subtitle")}
                table={
                  data.topItems.length > 0 && (
                    <DataTable
                      head={[t("admin.overview.table.item"), t("admin.overview.table.quantity"), t("admin.overview.table.revenue")]}
                      rows={data.topItems.map((i) => [i.name, formatCount(i.quantity), formatPrice(i.revenueCents)])}
                    />
                  )
                }
              >
                {data.topItems.length === 0 ? (
                  <EmptyState icon={BarChart3} title={t("admin.overview.topItems.empty")} className="py-10" />
                ) : (
                  <BarList
                    label={t("admin.overview.topItems.title")}
                    rows={data.topItems.map((i) => ({
                      key: i.itemId,
                      label: i.name,
                      value: i.quantity,
                      valueLabel: t("admin.overview.topItems.sold", { count: formatCount(i.quantity) }),
                    }))}
                  />
                )}
              </ChartCard>

              <ChartCard
                title={t("admin.overview.ratings.title")}
                subtitle={t("admin.overview.ratings.subtitle")}
                table={
                  data.ratings.count > 0 && (
                    <DataTable
                      head={[t("admin.overview.table.rating"), t("admin.overview.table.count")]}
                      rows={[5, 4, 3, 2, 1].map((s) => [t("admin.overview.ratings.stars", { count: s }), data.ratings.distribution[s - 1]!])}
                    />
                  )
                }
              >
                {data.ratings.count === 0 ? (
                  <EmptyState icon={Star} title={t("admin.overview.ratings.empty")} className="py-10" />
                ) : (
                  <>
                    <div className="mb-5 flex items-end gap-3">
                      <p className="text-5xl font-semibold tracking-tight">{rating(data.ratings.average ?? 0)}</p>
                      <div className="pb-1.5">
                        <p className="text-sm text-fg-muted">{t("admin.overview.kpi.ratingCount", { count: data.ratings.count })}</p>
                      </div>
                    </div>
                    <BarList
                      label={t("admin.overview.ratings.title")}
                      rows={[5, 4, 3, 2, 1].map((s) => ({
                        key: String(s),
                        label: (
                          <span className="inline-flex items-center gap-1">
                            {s} <Star className="size-3.5 fill-current text-fg-muted" aria-hidden />
                            <span className="sr-only">{t("admin.overview.ratings.stars", { count: s })}</span>
                          </span>
                        ),
                        value: data.ratings.distribution[s - 1]!,
                        valueLabel: formatCount(data.ratings.distribution[s - 1]!),
                      }))}
                    />
                    <div className="mt-4">
                      {(() => {
                        const d = delta("avgRating", "absolute");
                        return d ? <p className="text-sm text-fg-muted">{d.direction === "none" ? d.text : `${d.text} ${d.context}`}</p> : null;
                      })()}
                    </div>
                  </>
                )}
              </ChartCard>
            </div>

            <ChartCard
              title={t("admin.overview.hours.title")}
              subtitle={t("admin.overview.hours.subtitle")}
              table={
                <DataTable
                  head={[t("admin.overview.table.day"), t("admin.overview.table.hour"), t("admin.overview.table.orders")]}
                  rows={data.busiestHours.flatMap((row, d) =>
                    row.flatMap((v, h) => (v > 0 ? [[WEEKDAYS[d]!, hourRange(h).join("–"), v]] : [])),
                  )}
                />
              }
            >
              {data.busiestHours.flat().every((v) => v === 0) ? (
                <EmptyState icon={BarChart3} title={t("admin.overview.hours.empty")} className="py-10" />
              ) : (
                <Heatmap
                  grid={data.busiestHours}
                  rowLabels={WEEKDAYS}
                  formatHour={hourLabel}
                  label={t("admin.overview.hours.title")}
                  fewer={t("admin.overview.hours.fewer")}
                  more={t("admin.overview.hours.more")}
                  describe={(d, h, v) => {
                    const [from, to] = hourRange(h);
                    return {
                      title: t("admin.overview.hours.cell", { day: WEEKDAYS[d]!, from, to }),
                      value: v === 0 ? t("admin.overview.hours.noOrders") : t("admin.overview.hours.orders", { count: v }),
                    };
                  }}
                />
              )}
            </ChartCard>
          </div>
        )}
      </div>
    </div>
  );
}
