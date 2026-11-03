"use client";

import type { OrderStatus, Station } from "@app/shared";
import type { AdminOrderDTO } from "@app/shared/api";
import { ChevronDown, ChevronLeft, ChevronRight, CloudOff, Download, ReceiptText } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { DateRangeFilter, formatStamp, presetRange, rangeQuery, type DateRange } from "@/components/admin/date-range";
import { inputClass } from "@/components/admin/form";
import { Button, buttonClasses } from "@/components/ui/button";
import { Badge, EmptyState, Skeleton } from "@/components/ui/misc";
import { useT } from "@/i18n";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";

const PAGE_SIZE = 25;
const STATUSES: OrderStatus[] = ["received", "preparing", "ready", "served", "cancelled"];
const STATIONS: Station[] = ["kitchen", "bar"];

interface Page {
  orders: AdminOrderDTO[];
  page: number;
  pageSize: number;
  total: number;
}
interface Filters {
  status: OrderStatus | "";
  station: Station | "";
  table: string;
}

const statusTone = (s: OrderStatus) =>
  s === "cancelled" ? "danger" : s === "served" ? "success" : s === "ready" ? "primary" : s === "preparing" ? "warning" : "muted";

export default function OrdersPage() {
  const t = useT();
  const [range, setRange] = useState<DateRange>(() => presetRange("7"));
  const [filters, setFilters] = useState<Filters>({ status: "", station: "", table: "" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const req = useRef(0);

  const tableNo = /^\d{1,4}$/.test(filters.table) && Number(filters.table) > 0 ? filters.table : "";
  const query = [
    rangeQuery(range),
    filters.status && `status=${filters.status}`,
    filters.station && `station=${filters.station}`,
    tableNo && `table=${tableNo}`,
  ]
    .filter(Boolean)
    .join("&");

  const load = useCallback(async (q: string, p: number) => {
    const id = ++req.current;
    setLoading(true);
    try {
      const res = await api<Page>("GET", `/api/admin/orders?${q}&page=${p}&pageSize=${PAGE_SIZE}`);
      if (id !== req.current) return;
      setData(res);
      setFailed(false);
    } catch {
      if (id === req.current) setFailed(true);
    } finally {
      if (id === req.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load(query, page);
  }, [load, query, page]);

  const update = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{t("admin.orders.title")}</h1>
          <p className="mt-1 text-fg-muted">{t("admin.orders.subtitle")}</p>
        </div>
        {/* Plain link: the browser downloads it with the manager's session cookie. */}
        <a href={`/api/admin/orders/export.csv?${query}`} download className={buttonClasses("secondary")} title={t("admin.orders.exportHint")}>
          <Download className="size-5" aria-hidden />
          {t("admin.orders.export")}
        </a>
      </div>

      <div className="mt-6 space-y-4">
        <DateRangeFilter
          value={range}
          onChange={(r) => {
            setRange(r);
            setPage(1);
          }}
        />
        <div className="flex flex-wrap gap-3">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">{t("admin.orders.status")}</span>
            <select className={cn(inputClass, "w-44")} value={filters.status} onChange={(e) => update({ status: e.target.value as Filters["status"] })}>
              <option value="">{t("admin.orders.allStatuses")}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`status.${s}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">{t("admin.orders.station")}</span>
            <select className={cn(inputClass, "w-40")} value={filters.station} onChange={(e) => update({ station: e.target.value as Filters["station"] })}>
              <option value="">{t("admin.orders.allStations")}</option>
              {STATIONS.map((s) => (
                <option key={s} value={s}>
                  {t(`kitchen.stations.${s}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">{t("admin.orders.table")}</span>
            <input
              className={cn(inputClass, "w-28")}
              inputMode="numeric"
              placeholder={t("admin.orders.anyTable")}
              value={filters.table}
              onChange={(e) => update({ table: e.target.value.replace(/\D/g, "").slice(0, 4) })}
            />
          </label>
        </div>
      </div>

      <div className="mt-6">
        {failed && !data ? (
          <EmptyState icon={CloudOff} title={t("admin.orders.loadError")} action={<Button onClick={() => void load(query, page)}>{t("common.retry")}</Button>} />
        ) : !data ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-20 rounded-card" />
            ))}
          </div>
        ) : data.orders.length === 0 ? (
          <EmptyState icon={ReceiptText} title={t("admin.orders.empty")} />
        ) : (
          <div className={cn("transition-opacity", loading && "opacity-60")} aria-busy={loading}>
            <p className="mb-3 text-sm text-fg-muted">{t("admin.orders.count", { count: data.total })}</p>
            <ul className="space-y-3">
              {data.orders.map((o) => {
                const expanded = open.has(o.id);
                return (
                  <li key={o.id} className="rounded-card bg-surface shadow-soft ring-1 ring-line/60">
                    <button
                      type="button"
                      onClick={() => toggle(o.id)}
                      aria-expanded={expanded}
                      aria-controls={`lines-${o.id}`}
                      className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 p-4 text-left sm:flex-nowrap sm:p-5"
                    >
                      <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
                        <p className="font-semibold">
                          {t("admin.orders.tableNumber", { number: o.tableNumber })}
                          <span className="font-normal text-fg-muted"> · {t("admin.orders.round", { round: o.round })}</span>
                        </p>
                        <p className="text-sm text-fg-muted">
                          {formatStamp(o.createdAt)} · {t(`kitchen.stations.${o.station}`)} · {t("admin.orders.items", { count: o.itemCount })}
                        </p>
                      </div>
                      <Badge tone={statusTone(o.status)}>{t(`status.${o.status}`)}</Badge>
                      <p className={cn("ml-auto w-24 text-right font-semibold tabular sm:ml-0", o.status === "cancelled" && "text-fg-muted line-through")}>
                        {formatPrice(o.totalCents)}
                      </p>
                      <ChevronDown className={cn("size-5 shrink-0 text-fg-muted transition-transform", expanded && "rotate-180")} aria-hidden />
                      <span className="sr-only">{t("admin.orders.showLines")}</span>
                    </button>
                    {expanded && (
                      <ul id={`lines-${o.id}`} className="space-y-2 border-t border-line/60 px-4 py-3 text-sm sm:px-5">
                        {o.lines.map((l, i) => (
                          <li key={i} className="flex gap-3">
                            <span className="w-8 shrink-0 font-semibold tabular">{l.quantity}×</span>
                            <div className="min-w-0 flex-1">
                              <p>{l.name}</p>
                              {l.options.length > 0 && <p className="text-fg-muted">{l.options.join(", ")}</p>}
                              {l.note && <p className="text-fg-muted italic">{t("admin.orders.note", { note: l.note })}</p>}
                            </div>
                            <span className="tabular">{formatPrice(l.unitPriceCents * l.quantity)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
            {pages > 1 && (
              <nav className="mt-6 flex items-center justify-between gap-3" aria-label={t("admin.orders.title")}>
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="size-4" aria-hidden />
                  {t("admin.orders.previous")}
                </Button>
                <p className="text-sm text-fg-muted">{t("admin.orders.page", { page, pages })}</p>
                <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                  {t("admin.orders.next")}
                  <ChevronRight className="size-4" aria-hidden />
                </Button>
              </nav>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
