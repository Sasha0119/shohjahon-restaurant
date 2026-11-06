import { describe, expect, it } from "vitest";
import {
  ALLERGENS,
  DIETARY_TAGS,
  canGuestCancel,
  canTransition,
  cartCount,
  defaultSelection,
  isAvailableAt,
  lineSignature,
  lineTotal,
  openState,
  selectionSummary,
  suggestionsForCart,
  suggestionsForItem,
  toggleOption,
  unitPrice,
  validateSelection,
  type MenuItem,
} from "../src";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { seedMenu } from "../src/seed";
import { seedMenu as classicMenu } from "./fixtures/classic-menu";
import type { OpeningHours } from "@app/config";

/** Logic tests use a fixed fixture menu, so they don't change when the demo menu does. */
const byId = new Map(classicMenu.items.map((i) => [i.id, i]));
const get = (slug: string) => classicMenu.items.find((i) => i.slug === slug) as MenuItem;
const seedById = new Map(seedMenu.items.map((i) => [i.id, i]));

describe("seed menu", () => {
  it("has 25 items across 5 categories", () => {
    expect(seedMenu.categories).toHaveLength(5);
    expect(seedMenu.items).toHaveLength(25);
    for (const c of seedMenu.categories) {
      expect(seedMenu.items.filter((i) => i.categoryId === c.id).length).toBe(5);
    }
  });

  it("is internally consistent", () => {
    const ids = new Set<string>();
    for (const item of seedMenu.items) {
      expect(ids.has(item.id)).toBe(false);
      ids.add(item.id);
      expect(Number.isInteger(item.price) && item.price > 0).toBe(true);
      item.tags.forEach((t) => expect(DIETARY_TAGS).toContain(t));
      item.allergens.forEach((a) => expect(ALLERGENS).toContain(a));
      for (const g of item.modifierGroups) {
        expect(g.minSelect).toBeLessThanOrEqual(g.maxSelect);
        expect(g.options.length).toBeGreaterThanOrEqual(1);
        expect(new Set(g.options.map((o) => o.id)).size).toBe(g.options.length);
      }
    }
    for (const rule of seedMenu.upsells) {
      if (rule.kind === "suggest") {
        expect(seedById.has(rule.itemId)).toBe(true);
        expect(seedById.has(rule.suggestItemId)).toBe(true);
      } else {
        rule.itemIds.forEach((id) => expect(seedById.has(id)).toBe(true));
      }
    }
  });

  it("is written in Uzbek with English and Russian for every text", () => {
    const check = (
      base: string,
      t: Record<string, Record<string, string | undefined> | undefined> | undefined,
      field: string,
      where: string,
    ) => {
      expect(base.trim(), where).not.toBe("");
      expect(base, where).not.toMatch(/[Ѐ-ӿ]/); // the base text is Uzbek (Latin)
      expect(t?.en?.[field]?.trim(), `${where} (en)`).toBeTruthy();
      expect(t?.ru?.[field], `${where} (ru)`).toMatch(/[Ѐ-ӿ]/); // Russian is Cyrillic
    };
    for (const c of seedMenu.categories) {
      check(c.name, c.translations, "name", c.id);
      check(c.description ?? "", c.translations, "description", c.id);
    }
    for (const item of seedMenu.items) {
      check(item.name, item.translations, "name", item.id);
      check(item.description, item.translations, "description", item.id);
      for (const g of item.modifierGroups) {
        check(g.name, g.translations, "name", `${item.id}/${g.id}`);
        for (const o of g.options) check(o.name, o.translations, "name", `${item.id}/${g.id}/${o.id}`);
      }
    }
    for (const rule of seedMenu.upsells)
      if (rule.kind === "combo") check(rule.name, rule.translations, "name", rule.id);
  });

  it("prices whole so'm and has a photo for every dish", () => {
    const publicDir = fileURLToPath(new URL("../../../apps/web/public", import.meta.url));
    for (const item of seedMenu.items) {
      expect(item.price % 1000, item.id).toBe(0); // realistic so'm prices
      expect(item.price, item.id).toBeGreaterThanOrEqual(5_000);
      expect(existsSync(publicDir + item.image), item.image).toBe(true);
    }
  });

  it("vegan items never declare milk or eggs", () => {
    for (const item of seedMenu.items.filter((i) => i.tags.includes("vegan"))) {
      expect(item.allergens).not.toContain("milk");
      expect(item.allergens).not.toContain("eggs");
    }
  });
});

describe("modifiers", () => {
  const steak = get("steak-frites");
  const burger = get("double-smash-burger");

  it("requires a choice in required groups without a default", () => {
    const sel = defaultSelection(steak);
    expect(validateSelection(steak, sel)).toEqual([{ groupId: "doneness", kind: "too-few", min: 1 }]);
    sel.doneness = ["medium-rare"];
    expect(validateSelection(steak, sel)).toEqual([]);
  });

  it("pre-selects defaults so simple items are valid immediately", () => {
    expect(validateSelection(burger, defaultSelection(burger))).toEqual([]);
  });

  it("rejects too many choices and unknown options", () => {
    const sel = { side: ["fries"], extras: ["patty", "cheese", "bacon-jam", "jalapenos"] };
    expect(validateSelection(burger, sel)).toContainEqual({ groupId: "extras", kind: "too-many", max: 3 });
    expect(validateSelection(burger, { side: ["nope"], extras: [] })).toContainEqual({
      groupId: "side",
      kind: "unknown-option",
      optionId: "nope",
    });
  });

  it("toggles single-choice like a radio and caps multi-choice", () => {
    const side = burger.modifierGroups[0]!;
    const extras = burger.modifierGroups[1]!;
    expect(toggleOption(side, ["fries"], "salad")).toEqual(["salad"]);
    expect(toggleOption(side, ["fries"], "fries")).toEqual(["fries"]); // required stays selected
    expect(toggleOption(extras, ["patty", "cheese", "bacon-jam"], "jalapenos")).toEqual([
      "patty",
      "cheese",
      "bacon-jam",
    ]);
    expect(toggleOption(extras, ["patty"], "patty")).toEqual([]);
    const sauce = steak.modifierGroups[1]!; // optional single
    expect(toggleOption(sauce, ["peppercorn"], "peppercorn")).toEqual([]);
  });

  it("prices modifiers per unit", () => {
    const sel = { side: ["truffle-fries"], extras: ["patty", "cheese"] };
    expect(unitPrice(burger, sel)).toBe(1850 + 250 + 500 + 150);
    expect(lineTotal(burger, { quantity: 2, selection: sel })).toBe(2 * 2750);
    expect(selectionSummary(burger, sel)).toEqual(["Truffle parmesan fries", "Extra patty", "Extra cheddar"]);
  });

  it("merges identical lines regardless of option order or note case", () => {
    const a = lineSignature({ itemId: "x", selection: { g: ["a", "b"] }, note: "No onion", addedByGuestId: "1" });
    const b = lineSignature({ itemId: "x", selection: { g: ["b", "a"] }, note: " no onion ", addedByGuestId: "1" });
    const c = lineSignature({ itemId: "x", selection: { g: ["a"] }, note: "No onion", addedByGuestId: "1" });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(cartCount([{ quantity: 2 }, { quantity: 3 }])).toBe(5);
  });
});

describe("upsells", () => {
  it("suggests in-stock pairings for an item", () => {
    const names = suggestionsForItem("item-double-smash-burger", classicMenu.upsells, byId).map((i) => i.slug);
    expect(names).toEqual(["parmesan-fries", "house-iced-tea"]);
  });

  it("does not suggest what is already in the cart", () => {
    const out = suggestionsForCart(["item-double-smash-burger", "item-parmesan-fries"], classicMenu.upsells, byId).map(
      (i) => i.slug,
    );
    expect(out).toContain("house-iced-tea");
    expect(out).not.toContain("parmesan-fries");
  });
});

/** Fixed timetable for the opening-hours tests (independent of the brand's demo hours). */
const HOURS: OpeningHours = {
  mon: [{ open: "11:30", close: "22:00" }],
  tue: [{ open: "11:30", close: "22:00" }],
  wed: [{ open: "11:30", close: "22:00" }],
  thu: [{ open: "11:30", close: "23:00" }],
  fri: [{ open: "11:30", close: "00:30" }],
  sat: [{ open: "10:00", close: "00:30" }],
  sun: [{ open: "10:00", close: "21:00" }],
};

describe("opening hours & time-based menus", () => {
  // 2026-11-02 is a Monday.
  const at = (day: number, hh: number, mm = 0) => new Date(2026, 10, 2 + day, hh, mm);

  it("knows when the venue is open", () => {
    expect(openState(HOURS, at(0, 12))).toEqual({ isOpen: true, until: "22:00" });
    expect(openState(HOURS, at(0, 9))).toEqual({ isOpen: false, until: "11:30", nextDay: "mon" });
    expect(openState(HOURS, at(0, 22, 30))).toEqual({ isOpen: false, until: "11:30", nextDay: "tue" });
  });

  it("handles closing after midnight", () => {
    // Friday 11:30–00:30 → Saturday 00:15 is still open.
    expect(openState(HOURS, at(5, 0, 15))).toEqual({ isOpen: true, until: "00:30" });
    expect(openState(HOURS, at(4, 23, 45)).isOpen).toBe(true);
  });

  it("filters time-based menus", () => {
    const breakfast = [{ from: "08:00", to: "11:00", days: ["sat", "sun"] as ("sat" | "sun")[] }];
    expect(isAvailableAt(undefined, at(0, 3))).toBe(true);
    expect(isAvailableAt(breakfast, at(5, 9))).toBe(true); // Saturday 9:00
    expect(isAvailableAt(breakfast, at(0, 9))).toBe(false); // Monday
    expect(isAvailableAt(breakfast, at(5, 11))).toBe(false); // end is exclusive
  });
});

describe("order status rules", () => {
  it("allows cancelling only while received", () => {
    expect(canGuestCancel("received")).toBe(true);
    expect(canGuestCancel("preparing")).toBe(false);
  });

  it("moves one step forward at a time", () => {
    expect(canTransition("received", "preparing")).toBe(true);
    expect(canTransition("received", "ready")).toBe(false);
    expect(canTransition("served", "received")).toBe(false);
    expect(canTransition("preparing", "cancelled")).toBe(false);
  });
});
