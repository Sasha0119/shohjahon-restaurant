import { createHash } from "node:crypto";
import { brand } from "@app/config";
import { isAvailableAt, type AvailabilityWindow, type TextTranslations } from "@app/shared";
import type { AdminMenuDTO, MenuDTO } from "@app/shared/api";
import type { Db } from "../db.ts";
import type { Weekday } from "../generated/prisma/enums.ts";
import { enums } from "../lib/enums.ts";

type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
const pad = (n: number) => String(n).padStart(2, "0");
/** 690 → "11:30". Windows are [from, to) and capped at 23:59. */
export const minutesToHhmm = (m: number) => {
  const v = Math.min(Math.max(m, 0), 1439);
  return `${pad(Math.floor(v / 60))}:${pad(v % 60)}`;
};
const toWire = (d: Weekday) => d.toLowerCase() as Day;

/** A JSON column → translations (anything malformed reads as "none"). */
export function tr<F extends string>(value: unknown): TextTranslations<F> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as TextTranslations<F>) : {};
}

export function windowsOf(rows: { days: Weekday[]; fromMinute: number; toMinute: number }[]): AvailabilityWindow[] {
  return rows.map((w) => ({
    ...(w.days.length ? { days: w.days.map(toWire) } : {}),
    from: minutesToHhmm(w.fromMinute),
    to: minutesToHhmm(w.toMinute),
  }));
}

const menuInclude = {
  availability: true,
  items: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      modifierGroups: {
        orderBy: { sortOrder: "asc" as const },
        include: { options: { orderBy: { sortOrder: "asc" as const } } },
      },
    },
  },
};

/** Stable content hash used as the menu ETag / version. */
export function menuVersion(content: unknown): string {
  return createHash("sha1").update(JSON.stringify(content)).digest("base64url").slice(0, 16);
}

/**
 * What guests see right now: active categories inside their time window,
 * non-archived items, active options, and suggestions/combos whose items are
 * all visible. Sold-out items stay listed (shown as "Sold out").
 */
export async function buildPublicMenu(db: Db, now = new Date(), timeZone = brand.timezone): Promise<MenuDTO> {
  const [categories, suggestions, combos] = await Promise.all([
    db.category.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, include: menuInclude }),
    db.upsellSuggestion.findMany({ orderBy: [{ itemId: "asc" }, { sortOrder: "asc" }] }),
    db.comboDeal.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, include: { items: true } }),
  ]);

  const visibleCats = categories.filter((c) => isAvailableAt(windowsOf(c.availability), now, timeZone));
  const items = visibleCats.flatMap((c) =>
    c.items
      .filter((i) => !i.archived)
      .map((i) => ({
        id: i.id,
        slug: i.slug,
        categoryId: i.categoryId,
        name: i.name,
        description: i.description,
        translations: tr(i.translations),
        priceCents: i.priceCents,
        imageUrl: i.imageUrl,
        imageAlt: i.imageAlt,
        tags: i.tags.map(enums.tag.fromDb),
        allergens: i.allergens.map(enums.allergen.fromDb),
        calories: i.calories,
        inStock: i.inStock,
        featured: i.featured,
        modifierGroups: i.modifierGroups
          .map((g) => ({
            id: g.id,
            name: g.name,
            translations: tr(g.translations),
            minSelect: g.minSelect,
            maxSelect: g.maxSelect,
            options: g.options
              .filter((o) => o.active)
              .map((o) => ({ id: o.id, name: o.name, translations: tr(o.translations), priceDeltaCents: o.priceDeltaCents, isDefault: o.isDefault })),
          }))
          .filter((g) => g.options.length > 0),
      })),
  );
  const visible = new Set(items.map((i) => i.id));

  const content = {
    categories: visibleCats.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.description,
      translations: tr(c.translations),
      station: enums.station.fromDb(c.station),
      sortOrder: c.sortOrder,
    })),
    items,
    suggestions: suggestions
      .filter((s) => visible.has(s.itemId) && visible.has(s.suggestItemId))
      .map((s) => ({ itemId: s.itemId, suggestItemId: s.suggestItemId })),
    combos: combos
      .filter((c) => c.items.length > 1 && c.items.every((i) => visible.has(i.itemId)))
      .map((c) => ({ id: c.id, name: c.name, translations: tr(c.translations), discountCents: c.discountCents, itemIds: c.items.map((i) => i.itemId) })),
  };
  return { version: menuVersion(content), ...content };
}

/** Everything, for the manager's editor. */
export async function buildAdminMenu(db: Db): Promise<AdminMenuDTO> {
  const [categories, suggestions, combos] = await Promise.all([
    db.category.findMany({ orderBy: { sortOrder: "asc" }, include: menuInclude }),
    db.upsellSuggestion.findMany({ orderBy: [{ itemId: "asc" }, { sortOrder: "asc" }] }),
    db.comboDeal.findMany({ orderBy: { sortOrder: "asc" }, include: { items: true } }),
  ]);
  return {
    categories: categories.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.description,
      translations: tr(c.translations),
      station: enums.station.fromDb(c.station),
      sortOrder: c.sortOrder,
      active: c.active,
      availability: c.availability.map((w) => ({
        days: w.days.map(toWire),
        from: minutesToHhmm(w.fromMinute),
        to: minutesToHhmm(w.toMinute),
      })),
      itemCount: c.items.filter((i) => !i.archived).length,
    })),
    items: categories.flatMap((c) =>
      c.items.map((i) => ({
        id: i.id,
        slug: i.slug,
        categoryId: i.categoryId,
        name: i.name,
        description: i.description,
        translations: tr(i.translations),
        priceCents: i.priceCents,
        imageUrl: i.imageUrl,
        imageAlt: i.imageAlt,
        tags: i.tags.map(enums.tag.fromDb),
        allergens: i.allergens.map(enums.allergen.fromDb),
        calories: i.calories,
        inStock: i.inStock,
        featured: i.featured,
        archived: i.archived,
        sortOrder: i.sortOrder,
        modifierGroups: i.modifierGroups.map((g) => ({
          id: g.id,
          name: g.name,
          translations: tr(g.translations),
          minSelect: g.minSelect,
          maxSelect: g.maxSelect,
          options: g.options.map((o) => ({
            id: o.id,
            name: o.name,
            translations: tr(o.translations),
            priceDeltaCents: o.priceDeltaCents,
            isDefault: o.isDefault,
            active: o.active,
          })),
        })),
      })),
    ),
    suggestions: suggestions.map((s) => ({ id: s.id, itemId: s.itemId, suggestItemId: s.suggestItemId })),
    combos: combos.map((c) => ({
      id: c.id,
      name: c.name,
      translations: tr(c.translations),
      discountCents: c.discountCents,
      itemIds: c.items.map((i) => i.itemId),
      active: c.active,
    })),
  };
}
