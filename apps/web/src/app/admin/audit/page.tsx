"use client";

import type { AuditEntryDTO } from "@app/shared/api";
import { Bot, CloudOff, Loader2, ScrollText, User, UserCog } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { DateRangeFilter, formatStamp, presetRange, rangeQuery, type DateRange } from "@/components/admin/date-range";
import { inputClass } from "@/components/admin/form";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { useT } from "@/i18n";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

/** Activity groups → audit action prefixes. */
const CATEGORIES = [
  "all",
  "staff",
  "table",
  "session",
  "order",
  "call",
  "payment",
  "discount",
  "menu",
  "review",
  "feedback",
  "image",
] as const;
type Category = (typeof CATEGORIES)[number];

interface Page {
  entries: AuditEntryDTO[];
  page: number;
  pageSize: number;
  total: number;
}

/** "order.status_changed" → "Order · status changed" */
const actionLabel = (a: string) => {
  const [head = "", ...rest] = a.split(".");
  const words = (s: string) => s.replace(/_/g, " ");
  const h = words(head);
  return rest.length ? `${h.charAt(0).toUpperCase()}${h.slice(1)} · ${words(rest.join(" "))}` : h;
};

export default function AuditPage() {
  const t = useT();
  const [range, setRange] = useState<DateRange>(() => presetRange("7"));
  const [category, setCategory] = useState<Category>("all");
  const [data, setData] = useState<Page | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const req = useRef(0);

  const query = `${rangeQuery(range)}${category !== "all" ? `&action=${category}` : ""}`;

  const load = useCallback(async (q: string, page: number) => {
    const id = ++req.current;
    setLoading(true);
    try {
      const res = await api<Page>("GET", `/api/admin/audit?${q}&page=${page}`);
      if (id !== req.current) return;
      setData((prev) => (page > 1 && prev ? { ...res, entries: [...prev.entries, ...res.entries] } : res));
      setFailed(false);
    } catch {
      if (id === req.current) setFailed(true);
    } finally {
      if (id === req.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load(query, 1);
  }, [load, query]);

  return (
    <div>
      <h1 className="text-[2.1rem] font-semibold leading-tight">{t("admin.audit.title")}</h1>
      <p className="mt-1 text-fg-muted">{t("admin.audit.subtitle")}</p>

      <div className="mt-6 space-y-4">
        <DateRangeFilter value={range} onChange={setRange} />
        <label className="inline-block">
          <span className="mb-1 block text-sm font-semibold">{t("admin.audit.category")}</span>
          <select
            className={cn(inputClass, "w-56")}
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`admin.audit.categories.${c}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-6">
        {failed && !data ? (
          <EmptyState
            icon={CloudOff}
            title={t("admin.audit.loadError")}
            action={<Button onClick={() => void load(query, 1)}>{t("common.retry")}</Button>}
          />
        ) : !data ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-16 rounded-2xl" />
            ))}
          </div>
        ) : data.entries.length === 0 ? (
          <EmptyState icon={ScrollText} title={t("admin.audit.empty")} />
        ) : (
          <div className={cn("transition-opacity", loading && data.page === 1 && "opacity-60")} aria-busy={loading}>
            <p className="mb-3 text-sm text-fg-muted">{t("admin.audit.count", { count: data.total })}</p>
            <ol className="divide-y divide-line overflow-hidden card">
              {data.entries.map((e) => {
                const Icon = e.actor.type === "staff" ? UserCog : e.actor.type === "guest" ? User : Bot;
                const details =
                  e.data && typeof e.data === "object" && Object.keys(e.data).length > 0
                    ? JSON.stringify(e.data, null, 2)
                    : null;
                return (
                  <li key={e.id} className="flex gap-3 p-4">
                    <span
                      className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-fg-muted"
                      aria-hidden
                    >
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{actionLabel(e.action)}</p>
                      <p className="text-sm text-fg-muted">
                        {t(`admin.audit.actor.${e.actor.type}`)}: {e.actor.name ?? t("admin.audit.unknownActor")} ·{" "}
                        {formatStamp(e.createdAt)}
                        {e.ip && <span className="tabular"> · {e.ip}</span>}
                      </p>
                      {details && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-sm font-semibold text-fg-muted hover:text-fg">
                            {t("admin.audit.details")}
                          </summary>
                          <pre className="mt-2 max-h-60 overflow-auto rounded-xl bg-muted p-3 text-xs">
                            {`${e.entityType} ${e.entityId}\n${details}`}
                          </pre>
                        </details>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
            {data.entries.length < data.total && (
              <div className="mt-4 flex justify-center">
                <Button variant="secondary" disabled={loading} onClick={() => void load(query, data.page + 1)}>
                  {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
                  {t("admin.audit.loadMore")}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
