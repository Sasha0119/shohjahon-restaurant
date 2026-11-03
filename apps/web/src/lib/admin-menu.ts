"use client";

import type { AdminMenuDTO } from "@app/shared/api";
import { useCallback, useEffect, useState } from "react";
import { useStaffSocket } from "@/hooks/use-staff-socket";
import { api } from "@/lib/api";

export type AdminItem = AdminMenuDTO["items"][number];
export type AdminCategory = AdminMenuDTO["categories"][number];
export type AdminCombo = AdminMenuDTO["combos"][number];

/** The full menu for editors; reloads when anyone changes it (other managers, kitchen stock). */
export function useAdminMenu() {
  const [menu, setMenu] = useState<AdminMenuDTO | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    try {
      setMenu(await api<AdminMenuDTO>("GET", "/api/admin/menu"));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);
  useStaffSocket({ "menu:updated": () => void reload(), "menu:stock": () => void reload() }, () => void reload());

  return { menu, failed, reload, setMenu };
}

/** Admin item → body for PUT /api/admin/items/:id (the full item is always sent). */
export function itemToInput(item: AdminItem) {
  return {
    slug: item.slug,
    categoryId: item.categoryId,
    name: item.name,
    description: item.description,
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
      minSelect: g.minSelect,
      maxSelect: g.maxSelect,
      options: g.options.map((o) => ({
        id: o.id,
        name: o.name,
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
