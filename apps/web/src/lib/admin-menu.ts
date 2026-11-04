"use client";

import type { AdminMenuDTO } from "@app/shared/api";
import { useI18n } from "@/i18n";
import { useCallback, useEffect, useState } from "react";
import { useStaffSocket } from "@/hooks/use-staff-socket";
import { api } from "@/lib/api";
import { stockStore } from "@/lib/stock";

export type AdminItem = AdminMenuDTO["items"][number];
export type AdminCategory = AdminMenuDTO["categories"][number];
export type AdminCombo = AdminMenuDTO["combos"][number];

/**
 * The full menu for editors; reloads when a manager edits it. Stock changes
 * (kitchen or another manager) update only that one item, no reload.
 */
export function useAdminMenu() {
  const [menu, setMenu] = useState<AdminMenuDTO | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    try {
      const next = await api<AdminMenuDTO>("GET", "/api/admin/menu");
      stockStore.getState().seed(next.items);
      setMenu(next);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);
  useStaffSocket(
    {
      "menu:updated": () => void reload(),
      "menu:stock": ({ itemId, inStock, stockVersion }) => {
        stockStore.getState().applyServer(itemId, inStock, stockVersion);
        setMenu((m) => {
          const i = m?.items.findIndex((x) => x.id === itemId) ?? -1;
          if (!m || i < 0 || m.items[i]!.stockVersion >= stockVersion) return m;
          const items = m.items.slice();
          items[i] = { ...items[i]!, inStock, stockVersion };
          return { ...m, items };
        });
      },
    },
    () => void reload(),
  );

  return { menu, failed, reload, setMenu };
}

/** Admin item → body for PUT /api/admin/items/:id (the full item is always sent). */
export function itemToInput(item: AdminItem) {
  return {
    slug: item.slug,
    categoryId: item.categoryId,
    name: item.name,
    description: item.description,
    translations: item.translations ?? {},
    priceCents: item.priceCents,
    imageUrl: item.imageUrl,
    imageAlt: item.imageAlt,
    tags: item.tags,
    allergens: item.allergens,
    calories: item.calories,
    inStock: item.inStock,
    featured: item.featured,
    archived: item.archived,
    sortOrder: item.sortOrder,
    modifierGroups: item.modifierGroups.map((g) => ({
      id: g.id,
      name: g.name,
      translations: g.translations ?? {},
      minSelect: g.minSelect,
      maxSelect: g.maxSelect,
      options: g.options.map((o) => ({
        id: o.id,
        name: o.name,
        translations: o.translations ?? {},
        priceDeltaCents: o.priceDeltaCents,
        isDefault: o.isDefault,
        active: o.active,
      })),
    })),
  };
}

export function categoryToInput(c: AdminCategory) {
  return {
    slug: c.slug,
    name: c.name,
    description: c.description ?? undefined,
    translations: c.translations ?? {},
    station: c.station,
    sortOrder: c.sortOrder,
    active: c.active,
    availability: c.availability,
  };
}

/** Move element `index` by `delta` (−1 up, +1 down) and return the new id order. */
export function moved<T extends { id: string }>(list: T[], index: number, delta: number): string[] {
  const ids = list.map((x) => x.id);
  const target = index + delta;
  if (target < 0 || target >= ids.length) return ids;
  [ids[index], ids[target]] = [ids[target]!, ids[index]!];
  return ids;
}

/** A menu entry's name in the admin's UI language (falls back to the main language). */
export function useNameIn() {
  const { locale } = useI18n();
  return (x: { name: string; translations?: Partial<Record<string, { name?: string }>> }) =>
    x.translations?.[locale]?.name?.trim() || x.name;
}
