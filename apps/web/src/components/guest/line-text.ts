"use client";

import type { OrderLineDTO } from "@app/shared/api";
import { useCallback, useMemo } from "react";
import { useI18n } from "@/i18n";
import { useMenuStore } from "@/store/menu-store";

/**
 * Order tickets store the dish and option names as they were when ordered (in
 * the restaurant's default language). This shows them in the guest's language
 * when the dish is still on the menu, and falls back to the stored text.
 */
export function useLineText() {
  const { locale } = useI18n();
  const raw = useMenuStore((s) => s.menu);

  const lookup = useMemo(() => {
    const items = new Map<string, { name: string; options: Map<string, string> }>();
    for (const item of raw?.items ?? []) {
      const options = new Map<string, string>();
      for (const g of item.modifierGroups) {
        for (const o of g.options) {
          options.set(`${g.name}\u0000${o.name}`, o.translations?.[locale]?.name?.trim() || o.name);
        }
      }
      items.set(item.id, { name: item.translations?.[locale]?.name?.trim() || item.name, options });
    }
    return items;
  }, [raw, locale]);

  return useCallback(
    (line: OrderLineDTO) => {
      const item = lookup.get(line.itemId);
      return {
        name: item?.name ?? line.name,
        modifiers: line.modifiers.map((m) => item?.options.get(`${m.group}\u0000${m.option}`) ?? m.option),
      };
    },
    [lookup],
  );
}
