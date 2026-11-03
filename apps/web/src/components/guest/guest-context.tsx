"use client";

import type { MenuItem } from "@app/shared";
import { createContext, useContext, useMemo } from "react";
import type { MenuState } from "@/hooks/use-menu";
import { useSessionStore } from "@/store/session-store";

export interface GuestContextValue {
  /** The table this session is at. */
  table: { token: string; number: number };
  /** True once per-phone settings have been restored on the client. */
  hydrated: boolean;
  menuState: MenuState;
  openItem: (itemId: string) => void;
  openCallServer: () => void;
  /** Base path for this table, e.g. "/table/abc". */
  base: string;
}

export const GuestContext = createContext<GuestContextValue | null>(null);

export function useGuest(): GuestContextValue {
  const ctx = useContext(GuestContext);
  if (!ctx) throw new Error("useGuest must be used inside the guest shell");
  return ctx;
}

/** Cart count and subtotal for the whole table (prices come from the server). */
export function useCartSummary() {
  const cart = useSessionStore((s) => s.snapshot?.cart);
  return useMemo(
    () => ({
      count: (cart ?? []).reduce((n, l) => n + l.quantity, 0),
      subtotal: (cart ?? []).reduce((n, l) => n + l.unitPriceCents * l.quantity, 0),
    }),
    [cart],
  );
}

export function useItem(itemId: string | null): MenuItem | undefined {
  const { menuState } = useGuest();
  return itemId ? menuState.itemsById.get(itemId) : undefined;
}
