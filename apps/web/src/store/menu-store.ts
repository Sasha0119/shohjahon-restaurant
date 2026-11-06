"use client";

import type { Menu, MenuItem, TextTranslations, UpsellRule } from "@app/shared";
import type { MenuDTO } from "@app/shared/api";
import { create } from "zustand";

/** API menu → the shapes the guest screens use. */
export function menuFromDTO(dto: MenuDTO): Menu {
  const items: MenuItem[] = dto.items.map((i) => ({
    id: i.id,
    slug: i.slug,
    categoryId: i.categoryId,
    name: i.name,
    description: i.description,
    translations: i.translations,
    price: i.priceCents,
    image: i.imageUrl,
    imageAlt: i.imageAlt || i.name,
    tags: i.tags,
    allergens: i.allergens,
    inStock: i.inStock,
    featured: i.featured,
    ...(i.calories != null ? { calories: i.calories } : {}),
    modifierGroups: i.modifierGroups.map((g) => ({
      id: g.id,
      name: g.name,
      translations: g.translations,
      minSelect: g.minSelect,
      maxSelect: g.maxSelect,
      options: g.options.map((o) => ({
        id: o.id,
        name: o.name,
        translations: o.translations,
        priceDelta: o.priceDeltaCents,
        ...(o.isDefault ? { isDefault: true } : {}),
      })),
    })),
  }));
  const upsells: UpsellRule[] = [
    ...dto.suggestions.map((s) => ({
      id: `${s.itemId}>${s.suggestItemId}`,
      kind: "suggest" as const,
      itemId: s.itemId,
      suggestItemId: s.suggestItemId,
    })),
    ...dto.combos.map((c) => ({
      id: c.id,
      kind: "combo" as const,
      name: c.name,
      translations: c.translations,
      itemIds: c.itemIds,
      discount: c.discountCents,
    })),
  ];
  return {
    categories: dto.categories.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      ...(c.description ? { description: c.description } : {}),
      translations: c.translations,
      station: c.station,
      sortOrder: c.sortOrder,
    })),
    items,
    upsells,
  };
}

/** A text in `lang`, falling back to the default-language value. */
function pick<F extends string>(base: string, t: TextTranslations<F> | undefined, field: F, lang: string): string {
  return t?.[lang]?.[field]?.trim() || base;
}

/**
 * The menu with every name, description and option in `lang` (anything not
 * translated stays in the restaurant's default language). Ids and prices are
 * untouched, so carts and orders work the same in every language.
 */
export function localizeMenu(menu: Menu, lang: string): Menu {
  return {
    categories: menu.categories.map((c) => ({
      ...c,
      name: pick(c.name, c.translations, "name", lang),
      ...(c.description ? { description: pick(c.description, c.translations, "description", lang) } : {}),
    })),
    items: menu.items.map((i) => ({
      ...i,
      name: pick(i.name, i.translations, "name", lang),
      description: pick(i.description, i.translations, "description", lang),
      imageAlt: pick(i.imageAlt, i.translations, "imageAlt", lang),
      modifierGroups: i.modifierGroups.map((g) => ({
        ...g,
        name: pick(g.name, g.translations, "name", lang),
        options: g.options.map((o) => ({ ...o, name: pick(o.name, o.translations, "name", lang) })),
      })),
    })),
    upsells: menu.upsells.map((u) =>
      u.kind === "combo" ? { ...u, name: pick(u.name, u.translations, "name", lang) } : u,
    ),
  };
}

interface MenuState {
  menu: Menu | null;
  version: string | null;
  /** Each item's stockVersion, so late or out-of-order "menu:stock" events are ignored. */
  stockVersions: Record<string, number>;
  error: boolean;
  /** Fetch (or revalidate) the menu. Concurrent calls share one request. */
  load: () => Promise<void>;
  /** A live stock change: updates just that item (no reload). */
  applyStock: (itemId: string, inStock: boolean, stockVersion: number) => void;
}

let inflight: Promise<void> | null = null;

export const useMenuStore = create<MenuState>((set, get) => ({
  menu: null,
  version: null,
  stockVersions: {},
  error: false,

  load: () => {
    inflight ??= (async () => {
      try {
        // "no-cache" = revalidate with the ETag: an unchanged menu costs a tiny 304.
        const res = await fetch("/api/menu", { cache: "no-cache", credentials: "same-origin" });
        if (!res.ok) throw new Error(String(res.status));
        const dto = (await res.json()) as MenuDTO;
        if (dto.version !== get().version) {
          const { menu: current, stockVersions: known } = get();
          const next = menuFromDTO(dto);
          const versions: Record<string, number> = {};
          // A live stock event newer than this response (it raced the fetch) wins.
          next.items = next.items.map((item, i) => {
            const fetched = dto.items[i]!.stockVersion;
            const live = known[item.id];
            if (live !== undefined && live > fetched) {
              versions[item.id] = live;
              const shown = current?.items.find((x) => x.id === item.id);
              return shown ? { ...item, inStock: shown.inStock } : item;
            }
            versions[item.id] = fetched;
            return item;
          });
          set({ menu: next, version: dto.version, stockVersions: versions });
        }
        set({ error: false });
      } catch {
        // Keep showing the last good menu; only show the error state if we have nothing.
        if (!get().menu) set({ error: true });
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  },

  applyStock: (itemId, inStock, stockVersion) => {
    const { menu, stockVersions } = get();
    const known = stockVersions[itemId];
    const index = menu?.items.findIndex((i) => i.id === itemId) ?? -1;
    if (!menu || index < 0 || (known !== undefined && stockVersion <= known)) return;
    const items = menu.items.slice();
    items[index] = { ...items[index]!, inStock };
    // Only this item object changes, so only screens showing it re-render.
    set({ menu: { ...menu, items }, stockVersions: { ...stockVersions, [itemId]: stockVersion } });
  },
}));
