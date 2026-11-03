/**
 * Turns the shared demo menu (packages/shared/src/seed) into database rows.
 * Pure function — no database access — so it is unit-tested. IDs are stable,
 * which makes `npm run db:seed` safe to run repeatedly (it upserts).
 */
import { toMinutes, type Menu } from "@app/shared";
import type { Allergen, DietaryTag, Station, Weekday } from "./generated/prisma/enums.ts";
import { enums, toDbEnum } from "./lib/enums.ts";

export interface SeedPlan {
  categories: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    station: Station;
    sortOrder: number;
    availability: { days: Weekday[]; fromMinute: number; toMinute: number }[];
  }[];
  items: {
    id: string;
    slug: string;
    categoryId: string;
    name: string;
    description: string;
    priceCents: number;
    imageUrl: string;
    imageAlt: string;
    tags: DietaryTag[];
    allergens: Allergen[];
    calories: number | null;
    inStock: boolean;
    featured: boolean;
    sortOrder: number;
    groups: {
      id: string;
      name: string;
      minSelect: number;
      maxSelect: number;
      sortOrder: number;
      options: { id: string; name: string; priceDeltaCents: number; isDefault: boolean; sortOrder: number }[];
    }[];
  }[];
  suggestions: { itemId: string; suggestItemId: string; sortOrder: number }[];
  combos: { id: string; name: string; discountCents: number; itemIds: string[]; sortOrder: number }[];
  tables: { number: number; seats: number }[];
}

/** Modifier ids in the seed are only unique per item ("side"), so they get prefixed. */
export const groupDbId = (itemId: string, groupId: string) => `${itemId}--${groupId}`;
export const optionDbId = (itemId: string, groupId: string, optionId: string) =>
  `${itemId}--${groupId}--${optionId}`;

export function buildSeedPlan(menu: Menu, tableCount = 12): SeedPlan {
  const categories = menu.categories.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description ?? null,
    station: enums.station.toDb(c.station),
    sortOrder: c.sortOrder,
    availability: (c.availability ?? []).map((w) => ({
      days: (w.days ?? []).map((d) => toDbEnum<Weekday>(d)),
      fromMinute: toMinutes(w.from),
      toMinute: toMinutes(w.to),
    })),
  }));

  const perCategory = new Map<string, number>();
  const items = menu.items.map((item) => {
    const sortOrder = perCategory.get(item.categoryId) ?? 0;
    perCategory.set(item.categoryId, sortOrder + 1);
    return {
      id: item.id,
      slug: item.slug,
      categoryId: item.categoryId,
      name: item.name,
      description: item.description,
      priceCents: item.price,
      imageUrl: item.image,
      imageAlt: item.imageAlt,
      tags: item.tags.map(enums.tag.toDb),
      allergens: item.allergens.map(enums.allergen.toDb),
      calories: item.calories ?? null,
      inStock: item.inStock,
      featured: item.featured ?? false,
      sortOrder,
      groups: item.modifierGroups.map((g, gi) => ({
        id: groupDbId(item.id, g.id),
        name: g.name,
        minSelect: g.minSelect,
        maxSelect: g.maxSelect,
        sortOrder: gi,
        options: g.options.map((o, oi) => ({
          id: optionDbId(item.id, g.id, o.id),
          name: o.name,
          priceDeltaCents: o.priceDelta,
          isDefault: o.isDefault ?? false,
          sortOrder: oi,
        })),
      })),
    };
  });

  const suggestionCount = new Map<string, number>();
  const suggestions: SeedPlan["suggestions"] = [];
  const combos: SeedPlan["combos"] = [];
  for (const rule of menu.upsells) {
    if (rule.kind === "suggest") {
      const n = suggestionCount.get(rule.itemId) ?? 0;
      suggestionCount.set(rule.itemId, n + 1);
      suggestions.push({ itemId: rule.itemId, suggestItemId: rule.suggestItemId, sortOrder: n });
    } else {
      combos.push({
        id: rule.id,
        name: rule.name,
        discountCents: rule.discount,
        itemIds: rule.itemIds,
        sortOrder: combos.length,
      });
    }
  }

  const tables = Array.from({ length: tableCount }, (_, i) => ({ number: i + 1, seats: i % 3 === 0 ? 2 : 4 }));

  return { categories, items, suggestions, combos, tables };
}
