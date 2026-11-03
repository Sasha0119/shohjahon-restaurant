import { describe, expect, it } from "vitest";
import { en } from "../src/i18n/en";
import { interpolate, translate } from "../src/i18n/translate";
import { formatClock, formatCountdown, formatPercent, formatPrice, formatRelative, parsePrice, weekdayName } from "../src/lib/format";

describe("translate", () => {
  it("looks up nested keys and fills placeholders", () => {
    expect(translate("en", en, en, "common.table", { number: 12 })).toBe("Table 12");
    expect(translate("en", en, en, "menu.title")).toBe("Menu");
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
    const walk = (node: unknown, path: string): void => {
      if (typeof node === "string") {
        expect(node.trim(), path).not.toBe("");
        return;
      }
      for (const [k, v] of Object.entries(node as object)) walk(v, `${path}.${k}`);
    };
    walk(en, "en");
  });
});

describe("format", () => {
  it("formats money in the brand currency", () => {
    expect(formatPrice(1850)).toBe("$18.50");
    expect(formatPrice(0)).toBe("$0.00");
    expect(parsePrice("4.5")).toBe(450);
  });

  it("formats percent, clock, weekday and countdown", () => {
    expect(formatPercent(8)).toBe("8%");
    expect(formatPercent(8.875)).toBe("8.875%");
    expect(formatClock("23:00")).toMatch(/11:00\sPM/);
    expect(weekdayName("mon")).toBe("Monday");
    expect(weekdayName("sun", "short")).toBe("Sun");
    expect(formatCountdown(75_000)).toBe("1:15");
    expect(formatCountdown(-5)).toBe("0:00");
  });

  it("formats relative times and never shows the past as future", () => {
    const now = Date.UTC(2026, 10, 3, 12);
    expect(formatRelative(now - 5 * 60_000, now)).toBe("5 minutes ago");
    expect(formatRelative(now - 26 * 3_600_000, now)).toBe("yesterday");
    expect(formatRelative(now + 2_000, now)).toBe("now");
  });
});

