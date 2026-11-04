"use client";

import { brand } from "@app/config";
import { addDays, zonedDate } from "@app/shared";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/misc";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { inputClass } from "./form";

export type RangePreset = "today" | "7" | "30" | "90" | "custom";
export interface DateRange {
  preset: RangePreset;
  /** Inclusive local dates (YYYY-MM-DD) in the restaurant's time zone. */
  from: string;
  to: string;
}

/** "Today" in the restaurant's time zone, not the browser's. */
export const restaurantToday = () => zonedDate(new Date(), brand.timezone);

export function presetRange(preset: Exclude<RangePreset, "custom">, today = restaurantToday()): DateRange {
  const days = preset === "today" ? 1 : Number(preset);
  return { preset, from: addDays(today, -(days - 1)), to: today };
}

export const rangeQuery = (r: DateRange) => `from=${r.from}&to=${r.to}`;

/** Local date "2026-11-03" → "Nov 3, 2026" (no time-zone shifting). */
export function formatLocalDate(d: string, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }): string {
  return formatDate(new Date(`${d}T12:00:00Z`), { ...opts, timeZone: "UTC" });
}

/** A timestamp shown in the restaurant's time zone. */
export function formatStamp(iso: string, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }): string {
  return formatDate(new Date(iso), { ...opts, timeZone: brand.timezone });
}

/** Presets first, custom range behind one more tap. Applies to everything below it. */
export function DateRangeFilter({ value, onChange, className }: { value: DateRange; onChange: (r: DateRange) => void; className?: string }) {
  const t = useT();
  const [draft, setDraft] = useState({ from: value.from, to: value.to });
  const [custom, setCustom] = useState(value.preset === "custom");
  const invalid = !draft.from || !draft.to || draft.from > draft.to;
  const today = restaurantToday();

  return (
    <div className={cn("space-y-3", className)}>
      <Segmented<RangePreset>
        label={t("admin.range.label")}
        value={custom ? "custom" : value.preset}
        onChange={(p) => {
          if (p === "custom") {
            setDraft({ from: value.from, to: value.to });
            setCustom(true);
            return;
          }
          setCustom(false);
          onChange(presetRange(p));
        }}
        options={[
          { value: "today", label: t("admin.range.today") },
          { value: "7", label: t("admin.range.last7") },
          { value: "30", label: t("admin.range.last30") },
          { value: "90", label: t("admin.range.last90") },
          { value: "custom", label: t("admin.range.custom") },
        ]}
        className="max-w-xl"
      />
      {custom && (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!invalid) onChange({ preset: "custom", ...draft });
          }}
        >
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">{t("admin.range.from")}</span>
            <input
              type="date"
              className={cn(inputClass, "w-44")}
              value={draft.from}
              max={today}
              onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">{t("admin.range.to")}</span>
            <input
              type="date"
              className={cn(inputClass, "w-44")}
              value={draft.to}
              max={today}
              onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
            />
          </label>
          <Button type="submit" disabled={invalid}>
            {t("admin.range.apply")}
          </Button>
          {draft.from && draft.to && draft.from > draft.to && (
            <p role="alert" className="w-full text-sm font-semibold text-danger">
              {t("admin.range.invalid")}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
