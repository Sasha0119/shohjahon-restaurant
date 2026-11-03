"use client";

import type { Menu, MenuItem } from "@app/shared";
import { useCallback, useEffect, useMemo } from "react";
import { useMenuStore } from "@/store/menu-store";

export interface MenuState {
  menu: Menu | null;
  itemsById: Map<string, MenuItem>;
  error: boolean;
  retry: () => void;
}

/** Re-check the menu this often even without a push (time-based menus change on the clock). */
const REFRESH_MS = 5 * 60_000;

/**
 * The live menu from the API. Refreshes on mount, every few minutes, when the
 * tab becomes visible again, and whenever the server pushes `menu:updated`.
 */
export function useMenu(): MenuState {
  const menu = useMenuStore((s) => s.menu);
  const error = useMenuStore((s) => s.error);
  const load = useMenuStore((s) => s.load);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const itemsById = useMemo(() => new Map((menu?.items ?? []).map((i) => [i.id, i])), [menu]);
  const retry = useCallback(() => {
    useMenuStore.setState({ error: false });
    void load();
  }, [load]);

  return { menu, itemsById, error, retry };
}
