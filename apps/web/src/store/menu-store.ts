"use client";

import type { Menu, MenuItem, UpsellRule } from "@app/shared";
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
      minSelect: g.minSelect,
      maxSelect: g.maxSelect,
      options: g.options.map((o) => ({
        id: o.id,
        name: o.name,
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
    ...dto.combos.map((c) => ({ id: c.id, kind: "combo" as const, name: c.name, itemIds: c.itemIds, discount: c.discountCents })),
  ];
  return {
    categories: dto.categories.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      ...(c.description ? { description: c.description } : {}),
      station: c.station,
      sortOrder: c.sortOrder,
    })),
    items,
    upsells,
  };
}

interface MenuState {
  menu: Menu | null;
  version: string | null;
  error: boolean;
  /** Fetch (or revalidate) the menu. Concurrent calls share one request. */
  load: () => Promise<void>;
}

let inflight: Promise<void> | null = null;

export const useMenuStore = create<MenuState>((set, get) => ({
  menu: null,
  version: null,
  error: false,

  load: () => {
    inflight ??= (async () => {
      try {
        // "no-cache" = revalidate with the ETag: an unchanged menu costs a tiny 304.
        const res = await fetch("/api/menu", { cache: "no-cache", credentials: "same-origin" });
        if (!res.ok) throw new Error(String(res.status));
        const dto = (await res.json()) as MenuDTO;
        if (dto.version !== get().version) set({ menu: menuFromDTO(dto), version: dto.version });
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
}));
