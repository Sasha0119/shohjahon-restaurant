"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Tailwind's breakpoints, for the few places that must decide in JS (animations, layout swaps). */
export const BREAKPOINTS = { sm: 640, md: 768, lg: 1024, xl: 1280, "2xl": 1536 } as const;

/** True while the media query matches. Always false on the server and during hydration. */
function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** True at or above a Tailwind breakpoint (e.g. `useMinWidth("md")`). */
export const useMinWidth = (bp: keyof typeof BREAKPOINTS) => useMediaQuery(`(min-width: ${BREAKPOINTS[bp]}px)`);
