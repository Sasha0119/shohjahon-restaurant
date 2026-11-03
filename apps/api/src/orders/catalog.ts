import { brand } from "@app/config";
import { isAvailableAt, unitPrice, validateSelection, type MenuItem, type ModifierSelection } from "@app/shared";
import type { Db } from "../db.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { ApiError } from "../http/errors.ts";
import { enums } from "../lib/enums.ts";
import { windowsOf } from "../menu/read.ts";

type Tx = Prisma.TransactionClient;

const orderableInclude = {
  category: { include: { availability: true } },
  modifierGroups: {
    orderBy: { sortOrder: "asc" as const },
    include: { options: { where: { active: true }, orderBy: { sortOrder: "asc" as const } } },
  },
} satisfies Prisma.MenuItemInclude;

export type OrderableRow = Prisma.MenuItemGetPayload<{ include: typeof orderableInclude }>;

export interface Orderable {
  row: OrderableRow;
  /** Shared-logic view of the item (active options only). */
  item: MenuItem;
}

function toShared(row: OrderableRow): MenuItem {
  return {
    id: row.id,
    slug: row.slug,
    categoryId: row.categoryId,
    name: row.name,
    description: row.description,
    price: row.priceCents,
    image: row.imageUrl,
    imageAlt: row.imageAlt,
    tags: row.tags.map(enums.tag.fromDb),
    allergens: row.allergens.map(enums.allergen.fromDb),
    inStock: row.inStock,
    modifierGroups: row.modifierGroups
      .filter((g) => g.options.length > 0)
      .map((g) => ({
        id: g.id,
        name: g.name,
        minSelect: g.minSelect,
        maxSelect: g.maxSelect,
        options: g.options.map((o) => ({ id: o.id, name: o.name, priceDelta: o.priceDeltaCents, isDefault: o.isDefault })),
      })),
  };
}

export const unavailable = (names: string[]) =>
  new ApiError(409, "ITEM_UNAVAILABLE", `${names.join(", ")} can't be ordered right now.`, { items: names });
export const outOfStock = (names: string[]) =>
  new ApiError(409, "OUT_OF_STOCK", `Sorry — ${names.join(", ")} just sold out.`, { items: names });

/**
 * Load items and check they can be ordered now: exist, not archived, category
 * active and inside its time window, and in stock.
 */
export async function loadOrderable(db: Db | Tx, itemIds: string[], now = new Date()): Promise<Map<string, Orderable>> {
  const rows = await db.menuItem.findMany({ where: { id: { in: [...new Set(itemIds)] } }, include: orderableInclude });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const gone: string[] = [];
  const soldOut: string[] = [];
  const out = new Map<string, Orderable>();
  for (const id of new Set(itemIds)) {
    const row = byId.get(id);
    if (
      !row ||
      row.archived ||
      !row.category.active ||
      !isAvailableAt(windowsOf(row.category.availability), now, brand.timezone)
    ) {
      gone.push(row?.name ?? "This item");
      continue;
    }
    if (!row.inStock) soldOut.push(row.name);
    out.set(id, { row, item: toShared(row) });
  }
  if (gone.length) throw unavailable(gone);
  if (soldOut.length) throw outOfStock(soldOut);
  return out;
}

/**
 * Keep only this item's groups, de-duplicate options, then validate the
 * choices against the live menu (required groups, max choices, active options).
 */
export function checkSelection(o: Orderable, raw: ModifierSelection): { selection: ModifierSelection; unitPriceCents: number } {
  const groups = new Map(o.item.modifierGroups.map((g) => [g.id, g]));
  for (const key of Object.keys(raw)) {
    if (!groups.has(key)) throw new ApiError(400, "INVALID_SELECTION", `"${o.item.name}" has no option group ${key}.`);
  }
  const selection: ModifierSelection = {};
  for (const g of o.item.modifierGroups) {
    // A group left out entirely gets its defaults; an explicitly empty group stays empty.
    const chosen = raw[g.id] ?? g.options.filter((x) => x.isDefault).map((x) => x.id).slice(0, g.maxSelect);
    selection[g.id] = [...new Set(chosen)];
  }
  const problems = validateSelection(o.item, selection);
  if (problems.length) {
    throw new ApiError(400, "INVALID_SELECTION", `Please check the options for "${o.item.name}".`, problems);
  }
  return { selection, unitPriceCents: unitPrice(o.item, selection) };
}
