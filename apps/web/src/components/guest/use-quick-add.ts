"use client";

import { defaultSelection, validateSelection, type MenuItem } from "@app/shared";
import { useCallback } from "react";
import { toast } from "@/components/ui/toast";
import { useT } from "@/i18n";
import { useGuest } from "./guest-context";
import { useGuestActions } from "./use-guest-actions";

/** Light haptic tick on supporting phones. */
export function haptic(ms = 12) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not supported */
  }
}

/**
 * "+" on a card: adds straight away when the default options are valid,
 * otherwise opens the item sheet so the guest can choose.
 */
export function useQuickAdd() {
  const t = useT();
  const { openItem } = useGuest();
  const { addToCart } = useGuestActions();

  return useCallback(
    async (item: MenuItem) => {
      if (!item.inStock) return;
      const selection = defaultSelection(item);
      if (validateSelection(item, selection).length > 0) {
        openItem(item.id);
        return;
      }
      haptic();
      if (await addToCart({ itemId: item.id, quantity: 1, selection })) {
        toast.success(t("item.added"), t("item.addedBody", { quantity: 1, name: item.name }));
      }
    },
    [addToCart, openItem, t],
  );
}

export function needsChoices(item: MenuItem): boolean {
  return validateSelection(item, defaultSelection(item)).length > 0;
}
