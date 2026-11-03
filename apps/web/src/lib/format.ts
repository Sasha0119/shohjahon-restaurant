import { brand } from "@app/config";
import { formatMoney, parseMoney, type Money } from "@app/shared";

/** Format minor units in the brand currency, e.g. 1850 → "$18.50". */
export const formatPrice = (amount: Money) =>
  formatMoney(amount, brand.currency.code, brand.currency.locale);

/** Parse a typed amount in the brand currency. */
export const parsePrice = (input: string) => parseMoney(input, brand.currency.code);

/** 8 → "8%", 8.875 → "8.875%" */
export const formatPercent = (value: number) =>
  `${new Intl.NumberFormat(brand.currency.locale, { maximumFractionDigits: 3 }).format(value)}%`;

/** "23:00" → "11:00 PM" in the brand locale. */
export function formatClock(hhmm: string, locale = brand.currency.locale): string {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(
    new Date(2000, 0, 1, h, m),
  );
}

export function formatTime(timestamp: number, locale = brand.currency.locale): string {
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(timestamp);
}

/** "mon" → "Monday" / "Mon" in the given locale. */
export function weekdayName(day: string, style: "long" | "short" = "long", locale = "en"): string {
  const index = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(day);
  // 2023-01-01 was a Sunday.
  return new Intl.DateTimeFormat(locale, { weekday: style }).format(new Date(2023, 0, 1 + index));
}

/** "5 minutes ago", "yesterday", "3 days ago" */
export function formatRelative(timestamp: number, now = Date.now(), locale = brand.currency.locale): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  // Server and device clocks drift a little: never say "in 2 seconds" about the past.
  const diff = Math.min(0, (timestamp - now) / 1000);
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["second", 60],
    ["minute", 60],
    ["hour", 24],
    ["day", 30],
    ["month", 12],
  ];
  let value = diff;
  for (const [unit, size] of steps) {
    if (Math.abs(value) < size) return rtf.format(Math.round(value), unit);
    value /= size;
  }
  return rtf.format(Math.round(value), "year");
}

/** 75_000 ms → "1:15" */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
