"use client";

import { useEffect } from "react";
import { useStore } from "zustand";
import { toast } from "@/components/ui/toast";
import { useT } from "@/i18n";
import { translateError } from "@/i18n/errors";
import { api } from "@/lib/api";
import { createStockStore, shownInStock, type StockError } from "@/store/stock-store";

let reportError: StockError = () => {};

/** The one stock state for this browser tab (kitchen and manager screens share it). */
export const stockStore = createStockStore(
  (id, inStock) => api<{ inStock: boolean; stockVersion: number }>("PATCH", `/api/menu/items/${id}/stock`, { inStock }),
  (id, e) => reportError(id, e),
);

/** Whether an item shows as in stock (re-renders only when this item changes). */
export function useInStock(id: string, fallback: boolean): boolean {
  return useStore(stockStore, (s) => shownInStock(s, id, fallback));
}

export const setInStock = (id: string, inStock: boolean) => stockStore.getState().setInStock(id, inStock);

/** Show a toast (in the screen's language) when a stock change fails and is rolled back. */
export function useStockErrorToast() {
  const t = useT();
  useEffect(() => {
    const handler: StockError = (_id, e) => toast.error(translateError(e, t));
    reportError = handler;
    return () => {
      if (reportError === handler) reportError = () => {};
    };
  }, [t]);
}
