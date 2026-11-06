"use client";

import { brand } from "@app/config";
import { currencyDigits } from "@app/shared";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { useT } from "@/i18n";
import { currencyLabel, formatLocale, formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";

/*
 * Small, dependency-free charts for the admin dashboard.
 * Rules followed (see README → Phase 9): one series per chart in the theme's
 * validated `--chart-color`; bars ≤ 24px with 4px rounded data-ends, square at
 * the baseline; 2px surface gaps; hairline gridlines; text in text colours
 * only; every chart has hover + keyboard read-outs and a table view.
 */

// ── number formatting ───────────────────────────────────────────────────────

const digits = currencyDigits(brand.currency.code);

/** Axis ticks: 1 200 000 → "1,2 mln soʻm" / "$1.2K" — short, in the current language. */
export function compactMoney(minor: number): string {
  const value = minor / 10 ** digits;
  if (brand.currency.symbol) {
    const n = new Intl.NumberFormat(formatLocale(), { notation: "compact", maximumFractionDigits: 1 }).format(value);
    return `${n} ${currencyLabel()}`;
  }
  return new Intl.NumberFormat(formatLocale(), {
    style: "currency",
    currency: brand.currency.code,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export const formatCount = (n: number) => formatNumber(n);

/** Clean axis ticks: 0 and 3–5 round steps covering `max`. */
function niceTicks(max: number, target = 4): number[] {
  if (max <= 0) return [0];
  const raw = max / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  const ticks: number[] = [];
  for (let v = 0; v < max + step; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

// ── containers ──────────────────────────────────────────────────────────────

export function ChartCard({
  title,
  subtitle,
  children,
  table,
  className,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Same numbers as a plain table (accessible, copyable). */
  table?: ReactNode;
  className?: string;
}) {
  const t = useT();
  const id = useId();
  return (
    <section aria-labelledby={id} className={cn("card p-5 sm:p-6", className)}>
      <h2 id={id} className="font-display text-xl font-semibold">
        {title}
      </h2>
      {subtitle && <p className="text-sm text-fg-muted">{subtitle}</p>}
      <div className="mt-5">{children}</div>
      {table && (
        <details className="group mt-4 border-t border-line pt-3">
          <summary className="cursor-pointer select-none text-sm font-semibold text-fg-muted hover:text-fg">
            {t("admin.overview.table.show")}
          </summary>
          <div className="mt-3 max-h-80 overflow-auto">{table}</div>
        </details>
      )}
    </section>
  );
}

export function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-fg-muted">
          {head.map((h, i) => (
            <th key={h} scope="col" className={cn("pb-2 font-semibold", i > 0 && "text-right")}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="tabular">
        {rows.map((r, ri) => (
          <tr key={ri} className="border-t border-line/50">
            {r.map((c, i) => (
              <td key={i} className={cn("py-1.5", i > 0 && "text-right")}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Value-first tooltip: the number is strong, the label secondary. */
function Tooltip({ leftPct, top, children }: { leftPct: number; top: number | string; children: ReactNode }) {
  // Keep the bubble inside the chart near the edges.
  const shift = leftPct < 15 ? "0%" : leftPct > 85 ? "-100%" : "-50%";
  return (
    <div
      role="presentation"
      className="pointer-events-none absolute z-10 min-w-28 rounded-xl bg-surface px-3 py-2 text-sm shadow-soft ring-1 ring-line"
      style={{ left: `${leftPct}%`, top, transform: `translate(${shift}, calc(-100% - 8px))` }}
    >
      {children}
    </div>
  );
}

/** Arrow-key navigation over a 1-D or 2-D set of marks. */
function useArrowKeys(count: number, active: number | null, set: (i: number | null) => void, cols = count) {
  return (e: KeyboardEvent) => {
    const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols };
    if (e.key === "Escape") return set(null);
    if (e.key === "Home") return (e.preventDefault(), set(0));
    if (e.key === "End") return (e.preventDefault(), set(count - 1));
    const d = moves[e.key];
    if (d === undefined || (cols === count && Math.abs(d) === cols && cols !== 1)) return;
    e.preventDefault();
    const next = (active ?? (d > 0 ? -d : count)) + d;
    if (next >= 0 && next < count) set(next);
  };
}

// ── column chart (one series over time) ─────────────────────────────────────

export interface ColumnPoint {
  key: string;
  /** Short axis label, e.g. "Nov 3". */
  axisLabel: string;
  /** Tooltip heading, e.g. "Tue, Nov 3". */
  title: string;
  value: number;
  valueLabel: string;
  detail?: string;
}

export function ColumnChart({
  points,
  label,
  formatTick,
}: {
  points: ColumnPoint[];
  label: string;
  formatTick: (v: number) => string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const plot = useRef<HTMLDivElement>(null);
  const max = Math.max(0, ...points.map((p) => p.value));
  const ticks = niceTicks(max);
  const top = ticks.at(-1) || 1;
  const n = points.length;
  const onKey = useArrowKeys(n, active, setActive);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = plot.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onMove = (e: PointerEvent) => {
    const r = plot.current?.getBoundingClientRect();
    if (!r || n === 0) return;
    const i = Math.floor(((e.clientX - r.left) / r.width) * n);
    setActive(Math.min(n - 1, Math.max(0, i)));
  };

  // Evenly spaced axis labels (about one per 72px, at most 6), always including the last day.
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.min(6, Math.floor(width / 72)))));
  const labelled = new Set(points.map((_, i) => i).filter((i) => (n - 1 - i) % every === 0));
  const cur = active !== null ? points[active] : undefined;

  return (
    <div className="flex gap-2">
      {/* y axis */}
      <div className="relative h-56 w-12 shrink-0 text-right text-xs text-fg-muted tabular" aria-hidden>
        {ticks.map((v) => (
          <span
            key={v}
            className="absolute right-0"
            style={{ bottom: `${(v / top) * 100}%`, transform: "translateY(50%)" }}
          >
            {formatTick(v)}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div
          ref={plot}
          role="group"
          tabIndex={0}
          aria-label={label}
          aria-roledescription="chart"
          onPointerMove={onMove}
          onPointerLeave={() => setActive(null)}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
          className="relative h-56 touch-pan-y rounded-sm outline-offset-4"
        >
          {ticks.map((v) => (
            <div
              key={v}
              aria-hidden
              className="absolute inset-x-0 border-t border-line"
              style={{ bottom: `${(v / top) * 100}%` }}
            />
          ))}
          <div className="absolute inset-0 flex items-end" aria-hidden>
            {points.map((p, i) => (
              <div key={p.key} className={cn("flex h-full flex-1 items-end justify-center", n <= 120 && "px-px")}>
                {p.value > 0 && (
                  <div
                    className={cn(
                      "w-full max-w-6 rounded-t-[4px] bg-chart transition-[filter,opacity] duration-150",
                      active !== null && active !== i && "opacity-55",
                      active === i && "brightness-110",
                    )}
                    style={{ height: `${Math.max(1, (p.value / top) * 100)}%` }}
                  />
                )}
              </div>
            ))}
          </div>
          {cur && active !== null && (
            <Tooltip leftPct={((active + 0.5) / n) * 100} top={0}>
              <p className="font-semibold tabular">{cur.valueLabel}</p>
              <p className="text-fg-muted">{cur.title}</p>
              {cur.detail && <p className="text-fg-muted">{cur.detail}</p>}
            </Tooltip>
          )}
          <p className="sr-only" aria-live="polite">
            {cur ? `${cur.title}: ${cur.valueLabel}${cur.detail ? `, ${cur.detail}` : ""}` : ""}
          </p>
        </div>
        {/* x axis */}
        <div className="relative mt-2 h-4 text-xs text-fg-muted" aria-hidden>
          {points.map((p, i) =>
            labelled.has(i) ? (
              <span
                key={p.key}
                className="absolute whitespace-nowrap"
                style={{
                  left: `${((i + 0.5) / n) * 100}%`,
                  transform:
                    i === n - 1 && n > 1 ? "translateX(-100%)" : i === 0 && n > 1 ? "none" : "translateX(-50%)",
                }}
              >
                {p.axisLabel}
              </span>
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}

// ── horizontal bar list (ranked categories) ─────────────────────────────────

export interface BarRow {
  key: string;
  label: ReactNode;
  value: number;
  valueLabel: string;
}

/** Ranked bars with the value at each tip; every value is labelled directly. */
export function BarList({ rows, label }: { rows: BarRow[]; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul aria-label={label} className="space-y-3">
      {rows.map((r) => (
        <li key={r.key} className="group">
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium">{r.label}</span>
            <span className="shrink-0 font-semibold tabular">{r.valueLabel}</span>
          </div>
          <div className="h-3 rounded-r-[4px]" aria-hidden>
            {r.value > 0 && (
              <div
                className="h-full rounded-r-[4px] bg-chart transition-[filter] duration-150 group-hover:brightness-110"
                style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%` }}
              />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── heat map (weekday × hour) ───────────────────────────────────────────────

/** Ordinal steps of the one chart hue, mixed toward the surface (light → dark). */
const HEAT_STEPS = [28, 52, 76, 100];
const heatFill = (level: number) =>
  level === 0
    ? "var(--surface-muted-color)"
    : `color-mix(in oklab, var(--chart-color) ${HEAT_STEPS[level - 1]}%, var(--surface-color))`;

export function Heatmap({
  grid,
  rowLabels,
  formatHour,
  describe,
  label,
  fewer,
  more,
}: {
  /** grid[row][hour] */
  grid: number[][];
  rowLabels: string[];
  formatHour: (h: number) => string;
  describe: (row: number, hour: number, value: number) => { title: string; value: string };
  label: string;
  fewer: string;
  more: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(0, ...grid.flat());
  const level = (v: number) => (v <= 0 || max === 0 ? 0 : Math.max(1, Math.ceil((v / max) * HEAT_STEPS.length)));
  const rows = grid.length;
  const onKey = useArrowKeys(rows * 24, active, setActive, 24);
  const ar = active !== null ? Math.floor(active / 24) : -1;
  const ah = active !== null ? active % 24 : -1;
  const info = active !== null ? describe(ar, ah, grid[ar]![ah]!) : null;

  return (
    <div>
      <div className="flex gap-2">
        <div className="flex shrink-0 flex-col gap-0.5 self-start text-xs text-fg-muted" aria-hidden>
          {rowLabels.map((d) => (
            <span key={d} className="flex h-6 items-center">
              {d}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div
            role="group"
            tabIndex={0}
            aria-label={label}
            aria-roledescription="heat map"
            onKeyDown={onKey}
            onBlur={() => setActive(null)}
            onPointerLeave={() => setActive(null)}
            className="relative grid touch-pan-y gap-0.5 rounded-sm outline-offset-4"
            style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}
          >
            {grid.flatMap((row, r) =>
              row.map((v, h) => {
                const i = r * 24 + h;
                return (
                  <div
                    key={i}
                    aria-hidden
                    onPointerEnter={() => setActive(i)}
                    className={cn(
                      "h-6 rounded-[3px] transition-[filter,box-shadow] duration-100",
                      active === i && "ring-2 ring-fg/70 brightness-110",
                    )}
                    style={{ background: heatFill(level(v)) }}
                  />
                );
              }),
            )}
            {info && (
              <Tooltip leftPct={((ah + 0.5) / 24) * 100} top={ar * 26}>
                <p className="font-semibold tabular">{info.value}</p>
                <p className="whitespace-nowrap text-fg-muted">{info.title}</p>
              </Tooltip>
            )}
            <p className="sr-only" aria-live="polite">
              {info ? `${info.title}: ${info.value}` : ""}
            </p>
          </div>
          <div className="relative mt-2 h-4 text-xs text-fg-muted" aria-hidden>
            {[0, 6, 12, 18].map((h) => (
              <span key={h} className="absolute whitespace-nowrap" style={{ left: `${(h / 24) * 100}%` }}>
                {formatHour(h)}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-end gap-2 text-xs text-fg-muted" aria-hidden>
        <span>{fewer}</span>
        {[1, 2, 3, 4].map((l) => (
          <span key={l} className="size-3.5 rounded-[3px]" style={{ background: heatFill(l) }} />
        ))}
        <span>{more}</span>
      </div>
    </div>
  );
}

// ── stat tiles ──────────────────────────────────────────────────────────────

export interface Delta {
  direction: "up" | "down" | "flat" | "none";
  /** Already-translated text, e.g. "Up 12%". */
  text: string;
  /** e.g. "vs previous 30 days" */
  context: string;
}

/** Signed change vs the previous period. Up is good for every KPI shown here. */
function DeltaLine({ delta }: { delta: Delta }) {
  const Icon = delta.direction === "up" ? TrendingUp : delta.direction === "down" ? TrendingDown : Minus;
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-sm">
      {delta.direction !== "none" && (
        <span
          className={cn(
            "inline-flex items-center gap-1 font-semibold",
            delta.direction === "up" && "text-success",
            delta.direction === "down" && "text-danger",
            delta.direction === "flat" && "text-fg-muted",
          )}
        >
          <Icon className="size-4" aria-hidden />
          {delta.text}
        </span>
      )}
      <span className="text-fg-muted">{delta.direction === "none" ? delta.text : delta.context}</span>
    </p>
  );
}

export function StatTile({
  label,
  value,
  sub,
  delta,
  hero,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: Delta;
  hero?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("card relative overflow-hidden p-5", hero && "ring-gold-line", className)}>
      {/* A short gold hairline over every tile ties the row together. */}
      <span
        aria-hidden
        className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-primary/70 via-primary/30 to-transparent"
      />
      <p className="eyebrow">{label}</p>
      <p
        className={cn(
          "mt-2 font-display font-semibold tabular tracking-tight",
          hero ? "text-5xl" : "text-[2rem] leading-tight",
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-sm text-fg-muted">{sub}</p>}
      {delta && <DeltaLine delta={delta} />}
    </div>
  );
}
