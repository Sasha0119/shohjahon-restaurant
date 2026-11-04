import { brand, localize, type LocaleCode } from "@app/config";
import { currencyDigits, formatMoney, parseMoney, type Money } from "@app/shared";

/** UI language → the locale used for dates, times and numbers. */
export const LOCALE_TAGS: Record<LocaleCode, string> = {
  uz: "uz-Latn-UZ",
  en: "en-GB",
  ru: "ru-RU",
};

/*
 * The current UI language. Set by <I18nProvider> on every render, so all
 * formatting below follows the language the guest picked — without threading
 * a locale argument through every component.
 */
let current: LocaleCode = brand.defaultLanguage;
export function setFormatLanguage(lang: LocaleCode) {
  current = lang;
}
export const formatLanguage = (): LocaleCode => current;
/** BCP 47 tag for Intl APIs, e.g. "uz-Latn-UZ". */
export const formatLocale = (): string => LOCALE_TAGS[current];

const digits = currencyDigits(brand.currency.code);

/**
 * Brand currency. With a `symbol` in brand.ts the amount is grouped in the
 * brand's number style and followed by the word for the current language:
 * 85000 → "85 000 soʻm" (uz, en) / "85 000 сум" (ru). Otherwise the standard
 * currency format is used ("$18.50").
 */
/**
 * "85000" → "85 000": thousands joined by no-break spaces, decimals after a
 * comma. Done by hand rather than with Intl, because browsers without Uzbek
 * number data (e.g. Chrome) would otherwise fall back to "85,000".
 */
function groupDigits(value: number): string {
  const [whole = "0", frac] = Math.abs(value).toFixed(digits).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${value < 0 ? "−" : ""}${grouped}${frac ? `,${frac}` : ""}`;
}

export function formatPrice(amount: Money, lang: LocaleCode = current): string {
  const symbol = brand.currency.symbol;
  if (!symbol) return formatMoney(amount, brand.currency.code, LOCALE_TAGS[lang]);
  const n = groupDigits(amount / 10 ** digits);
  // No-break space keeps "85 000 soʻm" on one line.
  return `${n.replace(/\s/gu, "\u00A0")}\u00A0${localize(symbol, lang, brand.defaultLanguage)}`;
}

/** The currency on its own, for input adornments: "soʻm" / "сум" / "$". */
export function currencyLabel(lang: LocaleCode = current): string {
  if (brand.currency.symbol) return localize(brand.currency.symbol, lang, brand.defaultLanguage);
  return (
    new Intl.NumberFormat(LOCALE_TAGS[lang], { style: "currency", currency: brand.currency.code })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value ?? brand.currency.code
  );
}

/** Parse a typed amount in the brand currency ("85 000", "85,000", "4.5"). */
export const parsePrice = (input: string) => parseMoney(input, brand.currency.code);

/** 8 → "8%", 8.875 → "8.875%" */
export const formatPercent = (value: number) =>
  `${new Intl.NumberFormat(formatLocale(), { maximumFractionDigits: 3 }).format(value)}%`;

/** A plain count in the current language: 1284 → "1 284" / "1,284". */
export function formatNumber(value: number): string {
  // Whole counts in Uzbek are grouped by hand (see groupDigits); Chrome has no uz data.
  if (current === "uz" && Number.isInteger(value)) {
    const grouped = Math.abs(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return `${value < 0 ? "−" : ""}${grouped}`;
  }
  return new Intl.NumberFormat(formatLocale()).format(value);
}

/** "23:00" → "23:00" (uz/ru/en-GB 24-hour clock). */
export function formatClock(hhmm: string, locale = formatLocale()): string {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(
    new Date(2000, 0, 1, h, m),
  );
}

export function formatTime(timestamp: number, locale = formatLocale()): string {
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(timestamp);
}

/** "mon" → "dushanba" / "Monday" / "понедельник" in the current language. */
export function weekdayName(day: string, style: "long" | "short" = "long", locale = formatLocale()): string {
  const index = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(day);
  // 2023-01-01 was a Sunday.
  return formatDate(new Date(2023, 0, 1 + index), { weekday: style }, locale);
}

/*
 * Dates. Some browsers (Chrome) ship no Uzbek date data and print
 * "2026 M11 4" for uz-Latn-UZ, so Uzbek dates are put together by hand there:
 * "4-noyabr, 2026", "4-noyabr, 2026, 14:05", "Se".
 */
const UZ_MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const UZ_DAYS = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];
const UZ_DAYS_SHORT = ["Ya", "Du", "Se", "Ch", "Pa", "Ju", "Sh"];
const EN_DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

let uzDateData: boolean | undefined;
function browserHasUzbekDates(): boolean {
  if (uzDateData === undefined) {
    try {
      const month = new Intl.DateTimeFormat("uz-Latn-UZ", { month: "long", timeZone: "UTC" }).format(Date.UTC(2024, 0, 15));
      uzDateData = month.toLowerCase() === "yanvar";
    } catch {
      uzDateData = false;
    }
  }
  return uzDateData;
}

/** Intl date formatting in the current language, with the Uzbek fallback above. */
export function formatDate(date: Date | number, opts: Intl.DateTimeFormatOptions, locale = formatLocale()): string {
  if (!locale.startsWith("uz") || browserHasUzbekDates()) return new Intl.DateTimeFormat(locale, opts).format(date);
  return uzbekDate(date, opts);
}

/** Exported for tests: the hand-built Uzbek format. */
export function uzbekDate(date: Date | number, opts: Intl.DateTimeFormatOptions): string {
  const { dateStyle, timeStyle, timeZone } = opts;
  const want = {
    weekday: dateStyle === "full" ? "long" : opts.weekday,
    day: dateStyle ? "numeric" : opts.day,
    month: dateStyle === "short" ? "2-digit" : dateStyle ? "long" : opts.month,
    year: dateStyle ? "numeric" : opts.year,
    hour: timeStyle ? "2-digit" : opts.hour,
    minute: timeStyle ? "2-digit" : opts.minute,
  };
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      weekday: "short",
      day: "numeric",
      month: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const dayIndex = EN_DAYS_SHORT.indexOf(parts.weekday ?? "");
  const out: string[] = [];

  if (want.weekday) out.push(want.weekday === "long" ? (UZ_DAYS[dayIndex] ?? "") : (UZ_DAYS_SHORT[dayIndex] ?? ""));
  if (want.month === "numeric" || want.month === "2-digit") {
    out.push([want.day && parts.day?.padStart(2, "0"), parts.month?.padStart(2, "0"), want.year && parts.year].filter(Boolean).join("."));
  } else if (want.month) {
    const name = UZ_MONTHS[Number(parts.month) - 1] ?? "";
    const dayMonth = want.day ? `${Number(parts.day)}-${name}` : name;
    out.push(want.year ? (want.day ? `${dayMonth}, ${parts.year}` : `${dayMonth} ${parts.year}`) : dayMonth);
  } else if (want.day) {
    out.push(String(Number(parts.day)));
  }
  if (want.hour) out.push(want.minute ? `${parts.hour}:${parts.minute}` : String(Number(parts.hour)));
  return out.join(", ");
}

/** "5 minutes ago", "yesterday", "3 days ago" — in the current language. */
export function formatRelative(timestamp: number, now = Date.now(), locale = formatLocale()): string {
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
  const say = locale.startsWith("uz") && !browserHasUzbekRelative() ? uzbekRelative : (v: number, u: Intl.RelativeTimeFormatUnit) => rtf.format(v, u);
  let value = diff;
  for (const [unit, size] of steps) {
    if (Math.abs(value) < size) return say(Math.round(value), unit);
    value /= size;
  }
  return say(Math.round(value), "year");
}

/* Uzbek relative times by hand, for browsers without the data (Chrome prints "-4 s"). */
const UZ_UNITS: Partial<Record<Intl.RelativeTimeFormatUnit, string>> = {
  second: "soniya",
  minute: "daqiqa",
  hour: "soat",
  day: "kun",
  month: "oy",
  year: "yil",
};
let uzRelativeData: boolean | undefined;
function browserHasUzbekRelative(): boolean {
  if (uzRelativeData === undefined) {
    try {
      uzRelativeData = new Intl.RelativeTimeFormat("uz-Latn-UZ").format(-5, "minute").includes("daqiqa");
    } catch {
      uzRelativeData = false;
    }
  }
  return uzRelativeData;
}
/** Exported for tests. Only ever asked about the past (see formatRelative). */
export function uzbekRelative(value: number, unit: Intl.RelativeTimeFormatUnit): string {
  const n = Math.abs(value);
  if (unit === "second" && n < 10) return "hozir";
  if (unit === "day" && n === 1) return "kecha";
  return `${n} ${UZ_UNITS[unit] ?? unit} oldin`;
}

/** 75_000 ms → "1:15" */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
