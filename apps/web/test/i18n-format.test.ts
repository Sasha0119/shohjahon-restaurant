import { describe, expect, it } from "vitest";
import { en } from "../src/i18n/en";
import { ru } from "../src/i18n/ru";
import { interpolate, translate } from "../src/i18n/translate";
import { uz } from "../src/i18n/uz";
import {
  currencyLabel,
  formatClock,
  formatCountdown,
  formatNumber,
  uzbekDate,
  uzbekRelative,
  formatPercent,
  formatPrice,
  formatRelative,
  parsePrice,
  setFormatLanguage,
  weekdayName,
} from "../src/lib/format";

/** Every leaf path ("menu.title", "cart.items") of a message file. Plural objects count as one leaf. */
function leaves(node: unknown, path = ""): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const [k, v] of Object.entries(node as object)) {
    const p = path ? `${path}.${k}` : k;
    if (typeof v === "string" || (v && typeof v === "object" && "other" in v)) out.set(p, v);
    else for (const [kk, vv] of leaves(v, p)) out.set(kk, vv);
  }
  return out;
}
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const allText = (v: unknown): string[] => (typeof v === "string" ? [v] : Object.values(v as object).flatMap(allText));

describe("translate", () => {
  it("looks up nested keys and fills placeholders", () => {
    expect(translate("en", en, en, "common.table", { number: 12 })).toBe("Table 12");
    expect(translate("en", en, en, "menu.title")).toBe("Menu");
    expect(translate("uz", uz, en, "common.table", { number: 12 })).toBe("12-stol");
  });

  it("picks plural forms by count", () => {
    expect(translate("en", en, en, "cart.items", { count: 1 })).toBe("1 item");
    expect(translate("en", en, en, "cart.items", { count: 3 })).toBe("3 items");
    expect(translate("en", en, en, "cart.items", { count: 0 })).toBe("0 items");
  });

  it("falls back to English, then to the key", () => {
    const partial = { menu: { title: "Carte" } };
    expect(translate("fr", partial, en, "menu.title")).toBe("Carte");
    expect(translate("fr", partial, en, "nav.cart")).toBe("Cart");
    expect(translate("en", en, en, "does.not.exist")).toBe("does.not.exist");
  });

  it("leaves unknown placeholders visible", () => {
    expect(interpolate("Hi {name}, {missing}", { name: "Sam" })).toBe("Hi Sam, {missing}");
  });

  it("has no empty strings in the English file", () => {
    for (const text of allText(en)) expect(text.trim()).not.toBe("");
  });
});

describe("translations (uz / en / ru)", () => {
  const reference = leaves(en);

  for (const [name, dict] of [
    ["uz", uz],
    ["ru", ru],
  ] as const) {
    it(`${name} has exactly the English keys and the same {placeholders}`, () => {
      const got = leaves(dict);
      expect([...got.keys()].sort()).toEqual([...reference.keys()].sort());
      for (const [key, value] of reference) {
        for (const text of allText(got.get(key))) {
          expect(text.trim(), `${name}.${key}`).not.toBe("");
          expect(placeholders(text), `${name}.${key}`).toEqual(placeholders(allText(value)[0]!));
        }
      }
    });
  }

  it("writes Uzbek in Latin script with the proper ʻ letters", () => {
    for (const text of allText(uz)) {
      expect(text, text).not.toMatch(/[Ѐ-ӿ]/); // no Cyrillic letters
      expect(text, text).not.toMatch(/[oOgG]['‘’]/); // oʻ / gʻ use U+02BB, not an apostrophe
    }
  });

  it("covers one / few / many in every Russian plural and picks the right form", () => {
    for (const [key, value] of leaves(ru)) {
      if (typeof value === "object")
        expect(Object.keys(value as object).sort(), key).toEqual(["few", "many", "one", "other"]);
    }
    expect(translate("ru", ru, en, "cart.items", { count: 1 })).toBe("1 позиция");
    expect(translate("ru", ru, en, "cart.items", { count: 3 })).toBe("3 позиции");
    expect(translate("ru", ru, en, "cart.items", { count: 5 })).toBe("5 позиций");
    expect(translate("ru", ru, en, "cart.items", { count: 21 })).toBe("21 позиция");
    expect(translate("uz", uz, en, "cart.items", { count: 3 })).toBe("3 ta taom");
  });

  it("translates the server error codes people can see", () => {
    for (const code of ["OUT_OF_STOCK", "CART_CHANGED", "INVALID_CREDENTIALS", "TOO_LATE_TO_CANCEL", "RATE_LIMITED"]) {
      expect(translate("uz", uz, en, `errors.codes.${code}`)).not.toContain("errors.codes");
      expect(translate("ru", ru, en, `errors.codes.${code}`)).not.toContain("errors.codes");
    }
  });
});

describe("format", () => {
  /** Intl uses no-break spaces; compare them as plain spaces. */
  const plain = (s: string) => s.replace(/\s/gu, " ");

  it("formats so'm as whole numbers with the currency word in each language", () => {
    expect(plain(formatPrice(85000, "uz"))).toBe("85 000 soʻm");
    expect(plain(formatPrice(85000, "en"))).toBe("85 000 soʻm");
    expect(plain(formatPrice(85000, "ru"))).toBe("85 000 сум");
    expect(plain(formatPrice(1250000, "uz"))).toBe("1 250 000 soʻm");
    expect(plain(formatPrice(0, "uz"))).toBe("0 soʻm");
    expect(formatPrice(85000, "uz")).not.toContain(" "); // only no-break spaces: never splits across lines
    expect(currencyLabel("ru")).toBe("сум");
    expect(parsePrice("85 000")).toBe(85000);
    expect(parsePrice("85,000")).toBe(85000);
  });

  it("follows the UI language for percent, clock and weekday names", () => {
    setFormatLanguage("en");
    expect(formatPercent(8)).toBe("8%");
    expect(formatPercent(8.875)).toBe("8.875%");
    expect(formatClock("23:00")).toBe("23:00");
    expect(weekdayName("mon")).toBe("Monday");
    expect(weekdayName("sun", "short")).toBe("Sun");
    setFormatLanguage("ru");
    expect(weekdayName("mon")).toBe("понедельник");
    setFormatLanguage("uz");
    expect(weekdayName("mon").toLowerCase()).toBe("dushanba");
    expect(formatCountdown(75_000)).toBe("1:15");
    expect(formatCountdown(-5)).toBe("0:00");
  });

  it("formats relative times in the UI language and never shows the past as future", () => {
    const now = Date.UTC(2026, 10, 3, 12);
    setFormatLanguage("en");
    expect(formatRelative(now - 5 * 60_000, now)).toBe("5 minutes ago");
    expect(formatRelative(now - 26 * 3_600_000, now)).toBe("yesterday");
    expect(formatRelative(now + 2_000, now)).toBe("now");
    setFormatLanguage("ru");
    expect(formatRelative(now - 5 * 60_000, now)).toBe("5 минут назад");
    setFormatLanguage("uz");
  });

  it("groups Uzbek counts with spaces (browsers lack Uzbek number data)", () => {
    setFormatLanguage("uz");
    expect(formatNumber(1284)).toBe("1 284");
    expect(formatNumber(1_250_000)).toBe("1 250 000");
    expect(formatNumber(42)).toBe("42");
  });

  it("says Uzbek relative times by hand for browsers without the data", () => {
    expect(uzbekRelative(-4, "second")).toBe("hozir");
    expect(uzbekRelative(-5, "minute")).toBe("5 daqiqa oldin");
    expect(uzbekRelative(-1, "day")).toBe("kecha");
    expect(uzbekRelative(-3, "day")).toBe("3 kun oldin");
  });

  it("builds Uzbek dates by hand for browsers without Uzbek date data", () => {
    const at = Date.UTC(2026, 10, 4, 9, 5); // 14:05 in Tashkent
    const tz = "Asia/Tashkent";
    expect(uzbekDate(at, { dateStyle: "medium", timeZone: tz })).toBe("4-noyabr, 2026");
    expect(uzbekDate(at, { dateStyle: "medium", timeStyle: "short", timeZone: tz })).toBe("4-noyabr, 2026, 14:05");
    expect(uzbekDate(at, { weekday: "short", timeZone: tz })).toBe("Ch"); // a Wednesday
    expect(uzbekDate(at, { dateStyle: "short", timeZone: tz })).toBe("04.11.2026");
    expect(uzbekDate(at, { hour: "numeric", timeZone: tz })).toBe("14");
  });
});
