"use client";

/**
 * Per-phone UI state that doesn't belong on the server.
 * (Cart, orders and calls live on the server since Phase 6; the tip choice
 * moves to the server with payments in Phase 7.)
 */
import type { Money } from "@app/shared";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type CallType = "water" | "assistance" | "bill";
export type TipChoice = { kind: "percent"; value: number } | { kind: "amount"; value: Money };

interface TableState {
  /** Session this state belongs to; a new session starts fresh. */
  sessionId: string | null;
  tip: TipChoice;
  /** When each call type may be used again (ms timestamps, from the server's cooldown). */
  cooldownUntil: Partial<Record<CallType, number>>;
  /** Receipt of the last successful payment made on this phone (shown after the table closes). */
  lastReceiptToken: string | null;
  /** Visits already rated on this phone (so we never ask twice). */
  reviewedSessions: string[];

  bindSession: (sessionId: string) => void;
  setTip: (tip: TipChoice) => void;
  setCooldown: (type: CallType, until: number) => void;
  setLastReceipt: (token: string) => void;
  markReviewed: (sessionId: string) => void;
}

const fresh = () => ({ tip: { kind: "percent", value: 0 } as TipChoice, cooldownUntil: {} });

export const useTableStore = create<TableState>()(
  persist(
    (set, get) => ({
      sessionId: null,
      lastReceiptToken: null,
      reviewedSessions: [],
      ...fresh(),
      bindSession: (sessionId) => {
        if (get().sessionId !== sessionId) set({ sessionId, ...fresh() });
      },
      setTip: (tip) => set({ tip }),
      setCooldown: (type, until) => set({ cooldownUntil: { ...get().cooldownUntil, [type]: until } }),
      setLastReceipt: (token) => set({ lastReceiptToken: token }),
      markReviewed: (sessionId) => set({ reviewedSessions: [...get().reviewedSessions.filter((x) => x !== sessionId), sessionId].slice(-20) }),
    }),
    {
      name: "table-session",
      version: 4,
      migrate: () => ({}) as TableState,
      storage: createJSONStorage(() => sessionStorage),
      skipHydration: true,
    },
  ),
);
