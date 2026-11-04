import { toMinutes } from "@app/shared";
import type { categoryInput, menuItemInput } from "@app/shared/api";
import type { z } from "zod";
import type { Prisma } from "../generated/prisma/client.ts";
import type { Weekday } from "../generated/prisma/enums.ts";
import { errors } from "../http/errors.ts";
import { enums, toDbEnum } from "../lib/enums.ts";

type Tx = Prisma.TransactionClient;
type CategoryInput = z.output<typeof categoryInput>;
type ItemInput = z.output<typeof menuItemInput>;

export async function saveCategory(tx: Tx, id: string | null, input: CategoryInput): Promise<string> {
  const data = {
    slug: input.slug,
    name: input.name,
    description: input.description || null,
    translations: input.translations,
    station: enums.station.toDb(input.station),
    sortOrder: input.sortOrder,
    active: input.active,
  };
  const cat = id ? await tx.category.update({ where: { id }, data }) : await tx.category.create({ data });
  await tx.categoryAvailability.deleteMany({ where: { categoryId: cat.id } });
  if (input.availability.length) {
    await tx.categoryAvailability.createMany({
      data: input.availability.map((w) => ({
        categoryId: cat.id,
        days: w.days.map((d) => toDbEnum<Weekday>(d)),
        fromMinute: toMinutes(w.from),
        toMinute: toMinutes(w.to),
      })),
    });
  }
  return cat.id;
}

/**
 * Create or update an item and bring its modifier groups/options in line with
 * the input: entries with a known id are updated, new ones created, missing
 * ones deleted. Past orders are unaffected (they store name/price snapshots).
 */
export async function saveItem(tx: Tx, id: string | null, input: ItemInput): Promise<string> {
  const category = await tx.category.findUnique({ where: { id: input.categoryId }, select: { id: true } });
  if (!category) throw errors.badRequest("UNKNOWN_CATEGORY", "That category doesn't exist.");

  const data = {
    slug: input.slug,
    categoryId: input.categoryId,
    name: input.name,
    description: input.description,
    translations: input.translations,
    priceCents: input.priceCents,
    imageUrl: input.imageUrl,
    imageAlt: input.imageAlt || input.name,
    tags: [...new Set(input.tags)].map(enums.tag.toDb),
    allergens: [...new Set(input.allergens)].map(enums.allergen.toDb),
    calories: input.calories ?? null,
    inStock: input.inStock,
    featured: input.archived ? false : input.featured,
    archived: input.archived,
    sortOrder: input.sortOrder,
  };
  const item = id ? await tx.menuItem.update({ where: { id }, data }) : await tx.menuItem.create({ data });

  const existingGroups = await tx.modifierGroup.findMany({
    where: { itemId: item.id },
    include: { options: { select: { id: true } } },
  });
  const known = new Map(existingGroups.map((g) => [g.id, g]));
  const keep = new Set<string>();

  for (const [gi, g] of input.modifierGroups.entries()) {
    const groupData = { name: g.name, translations: g.translations, minSelect: g.minSelect, maxSelect: g.maxSelect, sortOrder: gi };
    const existing = g.id ? known.get(g.id) : undefined;
    const group = existing
      ? await tx.modifierGroup.update({ where: { id: existing.id }, data: groupData })
      : await tx.modifierGroup.create({ data: { ...groupData, itemId: item.id } });
    keep.add(group.id);

    const knownOptions = new Set(existing?.options.map((o) => o.id) ?? []);
    const keepOptions = new Set<string>();
    for (const [oi, o] of g.options.entries()) {
      const optionData = {
        name: o.name,
        translations: o.translations,
        priceDeltaCents: o.priceDeltaCents,
        isDefault: o.isDefault,
        active: o.active,
        sortOrder: oi,
      };
      const opt =
        o.id && knownOptions.has(o.id)
          ? await tx.modifierOption.update({ where: { id: o.id }, data: optionData })
          : await tx.modifierOption.create({ data: { ...optionData, groupId: group.id } });
      keepOptions.add(opt.id);
    }
    await tx.modifierOption.deleteMany({ where: { groupId: group.id, id: { notIn: [...keepOptions] } } });
  }
  await tx.modifierGroup.deleteMany({ where: { itemId: item.id, id: { notIn: [...keep] } } });
  return item.id;
}

export async function saveCombo(
  tx: Tx,
  id: string | null,
  input: { name: string; translations?: Record<string, { name?: string }>; discountCents: number; itemIds: string[]; active: boolean },
): Promise<string> {
  const itemIds = [...new Set(input.itemIds)];
  if (itemIds.length < 2) throw errors.badRequest("COMBO_TOO_SMALL", "A combo needs at least two different items.");
  const found = await tx.menuItem.count({ where: { id: { in: itemIds }, archived: false } });
  if (found !== itemIds.length) throw errors.badRequest("UNKNOWN_ITEM", "One of the items doesn't exist or is archived.");
  const data = { name: input.name, translations: input.translations ?? {}, discountCents: input.discountCents, active: input.active };
  const combo = id ? await tx.comboDeal.update({ where: { id }, data }) : await tx.comboDeal.create({ data });
  await tx.comboDealItem.deleteMany({ where: { comboId: combo.id } });
  await tx.comboDealItem.createMany({ data: itemIds.map((itemId) => ({ comboId: combo.id, itemId })) });
  return combo.id;
}
