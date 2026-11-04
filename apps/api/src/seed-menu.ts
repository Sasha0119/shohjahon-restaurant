import type { Db } from "./db.ts";
import type { SeedPlan } from "./seed-plan.ts";

/**
 * Writes a menu seed plan (categories, items, options, suggestions, combos).
 * Upserts by stable id, so running it again updates rows instead of duplicating.
 * Used by prisma/seed.ts (demo menu) and by the integration tests (fixture menu).
 */
export async function writeMenu(db: Db, plan: Pick<SeedPlan, "categories" | "items" | "suggestions" | "combos">) {
  for (const { availability, ...c } of plan.categories) {
    await db.category.upsert({ where: { id: c.id }, create: c, update: c });
    await db.categoryAvailability.deleteMany({ where: { categoryId: c.id } });
    if (availability.length) {
      await db.categoryAvailability.createMany({
        data: availability.map((w) => ({ ...w, categoryId: c.id })),
      });
    }
  }

  for (const { groups, ...item } of plan.items) {
    await db.menuItem.upsert({ where: { id: item.id }, create: item, update: item });
    for (const { options, ...g } of groups) {
      const group = { ...g, itemId: item.id };
      await db.modifierGroup.upsert({ where: { id: g.id }, create: group, update: group });
      for (const o of options) {
        const option = { ...o, groupId: g.id };
        await db.modifierOption.upsert({ where: { id: o.id }, create: option, update: option });
      }
    }
  }

  for (const s of plan.suggestions) {
    await db.upsellSuggestion.upsert({
      where: { itemId_suggestItemId: { itemId: s.itemId, suggestItemId: s.suggestItemId } },
      create: s,
      update: { sortOrder: s.sortOrder },
    });
  }

  for (const { itemIds, ...combo } of plan.combos) {
    await db.comboDeal.upsert({ where: { id: combo.id }, create: combo, update: combo });
    await db.comboDealItem.deleteMany({ where: { comboId: combo.id } });
    await db.comboDealItem.createMany({ data: itemIds.map((itemId) => ({ comboId: combo.id, itemId })) });
  }
}
