"use client";

import { translateError } from "@/i18n/errors";
import { brand, type LocaleCode } from "@app/config";
import { currencyDigits } from "@app/shared";
import { cloneElement, isValidElement, useEffect, useId, useState, type ReactNode } from "react";
import { ApiClientError } from "@/lib/api";
import { Segmented } from "@/components/ui/misc";
import { localeNames, useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { currencyLabel, parsePrice } from "@/lib/format";

/** Shared admin form building blocks — one look for every editor. */

export const inputClass =
  "h-12 w-full rounded-2xl bg-muted px-4 ring-1 ring-inset ring-line text-[16px] placeholder:text-fg-muted focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-danger";

/** Same look as inputClass, for multi-line text. */
export const textareaClass = inputClass.replace("h-12 ", "") + " resize-none py-3";

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  const auto = useId();
  const messageId = `${auto}-msg`;
  // Link the label (and hint/error) to the control even when no id was given.
  let control = children;
  let target = htmlFor;
  if (isValidElement<{ id?: string; "aria-describedby"?: string }>(children)) {
    const linkable = typeof children.type === "string" || children.type === MoneyField;
    target = htmlFor ?? children.props.id ?? (linkable ? auto : undefined);
    if (linkable) {
      control = cloneElement(children, {
        id: target,
        "aria-describedby": error || hint ? messageId : undefined,
      });
    }
  }
  return (
    <div className={className}>
      <label htmlFor={target} className="block text-sm font-semibold">
        {label}
      </label>
      <div className="mt-1.5">{control}</div>
      {error ? (
        <p id={messageId} className="mt-1.5 text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      ) : (
        hint && (
          <p id={messageId} className="mt-1.5 text-sm text-fg-muted">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  hint,
  compact,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  compact?: boolean;
}) {
  return (
    <label className={cn("flex cursor-pointer items-center justify-between gap-4", !compact && "min-h-14 rounded-2xl bg-muted/50 px-4 py-2")}>
      <span className={cn(compact && "sr-only")}>
        <span className="block font-semibold">{label}</span>
        {hint && <span className="block text-sm text-fg-muted">{hint}</span>}
      </span>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden
        className="relative h-7 w-12 shrink-0 rounded-full bg-fg/20 transition-colors after:absolute after:left-1 after:top-1 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-primary peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2"
      />
    </label>
  );
}

export function ToggleChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-card px-3.5 text-sm font-semibold transition-colors",
        on ? "bg-primary text-on-primary shadow-[inset_0_1px_0_rgb(255_255_255/0.35)]" : "glass-chip text-fg-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

/** Money input in the brand currency; reports cents (null while invalid). */
export function MoneyField({
  id,
  cents,
  onChange,
  invalid,
  className,
  ...aria
}: {
  "aria-describedby"?: string;
  "aria-label"?: string;
  id?: string;
  cents: number | null;
  onChange: (cents: number | null) => void;
  invalid?: boolean;
  className?: string;
}) {
  const auto = useId();
  const digits = currencyDigits(brand.currency.code);
  const show = (c: number | null) => (c == null ? "" : (c / 10 ** digits).toFixed(digits));
  const [text, setText] = useState(show(cents));
  // Follow outside changes (e.g. form reset) without fighting the user's typing.
  useEffect(() => {
    if (parsePrice(text) !== cents) setText(show(cents));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cents]);
  const symbol = currencyLabel();
  return (
    <div className={cn("relative", className)}>
      {/* The currency as a suffix, so a word like "soʻm" never covers the digits. */}
      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-fg-muted">{symbol}</span>
      <input
        id={id ?? auto}
        inputMode="decimal"
        autoComplete="off"
        value={text}
        aria-invalid={invalid || (text !== "" && parsePrice(text) === null)}
        {...aria}
        onChange={(e) => {
          const v = e.target.value.replace(/[^\d.,]/g, "").slice(0, 10);
          setText(v);
          onChange(v === "" ? null : parsePrice(v));
        }}
        className={cn(inputClass, "pr-16 tabular")}
      />
    </div>
  );
}

/**
 * Fields a 400 VALIDATION_ERROR points at, keyed by path ("modifierGroups.0.name").
 * The server's own wording is English, so each field gets a translated hint instead.
 */
export function fieldErrors(e: unknown, t: (key: "admin.fieldInvalid") => string): Record<string, string> {
  if (!(e instanceof ApiClientError) || !Array.isArray(e.details)) return {};
  const out: Record<string, string> = {};
  for (const d of e.details as { path?: string }[]) {
    if (d.path && !out[d.path]) out[d.path] = t("admin.fieldInvalid");
  }
  return out;
}

/** A translated message for an API error (see i18n/errors.ts). */
export function apiMessage(e: unknown, t: Parameters<typeof translateError>[1]): string {
  return translateError(e, t);
}

/** "Lemon Tart!" → "lemon-tart" */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// ── Menu texts in several languages ─────────────────────────────────────────

type Tr = Partial<Record<string, Partial<Record<string, string>>>>;

/**
 * Read a text in the language being edited: the plain field for the main
 * language, otherwise the matching entry in `translations` ("" = not yet translated).
 */
export function textIn(lang: LocaleCode, base: string, translations: Tr | undefined, field: string): string {
  return lang === brand.defaultLanguage ? base : (translations?.[lang]?.[field] ?? "");
}

/** The new `translations` object after editing one field in one language. */
export function withText(translations: Tr | undefined, lang: LocaleCode, field: string, value: string): Tr {
  return { ...translations, [lang]: { ...translations?.[lang], [field]: value } };
}

/**
 * "Editing language" switch for menu editors: the main language edits the
 * plain fields; the others edit translations (empty = falls back to the main one).
 */
export function EditLanguageBar({ value, onChange, className }: { value: LocaleCode; onChange: (l: LocaleCode) => void; className?: string }) {
  const t = useT();
  if (brand.languages.length < 2) return null;
  const main = localeNames[brand.defaultLanguage];
  return (
    <div className={cn("rounded-2xl bg-muted/50 p-3 ring-1 ring-inset ring-gold-line", className)}>
      <p className="mb-2 text-[11px] font-label uppercase tracking-[0.08em] text-primary">{t("admin.menu.editLanguage")}</p>
      <Segmented<LocaleCode>
        label={t("admin.menu.editLanguage")}
        value={value}
        onChange={onChange}
        options={brand.languages.map((l) => ({
          value: l,
          label: l === brand.defaultLanguage ? t("admin.menu.mainLanguage", { language: localeNames[l] }) : localeNames[l],
        }))}
      />
      {value !== brand.defaultLanguage && <p className="mt-2 text-xs text-fg-muted">{t("admin.menu.translationHint", { language: main })}</p>}
    </div>
  );
}
