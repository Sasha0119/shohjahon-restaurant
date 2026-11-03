"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useMenu } from "@/hooks/use-menu";
import { useSessionStore } from "@/store/session-store";
import { useTableStore } from "@/store/table-store";
import { BottomNav } from "./bottom-nav";
import { CallServerSheet } from "./call-server-sheet";
import { FloatingCartBar } from "./floating-cart-bar";
import { GuestContext, type GuestContextValue } from "./guest-context";
import { ItemSheet } from "./item-sheet";
import { JoinScreen } from "./join-screens";
import { OfflineBanner } from "./offline-banner";
import { useTableSession } from "./use-table-session";

/**
 * Guest app frame for /table/<token>: joins the table session, keeps it live
 * over Socket.io, and shows the right screen for occupied / wrong / expired
 * tables. The menu, cart and bill screens render inside it.
 */
export function GuestShell({ token, children }: { token: string; children: ReactNode }) {
  const { join } = useTableSession(token);
  const phase = useSessionStore((s) => s.phase);
  const snapshot = useSessionStore((s) => s.snapshot);

  const menuState = useMenu();
  const [hydrated, setHydrated] = useState(false);
  const [itemId, setItemId] = useState<string | null>(null);
  const [callOpen, setCallOpen] = useState(false);

  // Restore per-phone settings (tip choice, call cooldowns).
  useEffect(() => {
    let alive = true;
    Promise.resolve(useTableStore.persist.rehydrate()).then(() => alive && setHydrated(true));
    return () => {
      alive = false;
    };
  }, []);

  // Those settings belong to the current session only.
  const sessionId = snapshot?.sessionId;
  useEffect(() => {
    if (hydrated && sessionId) useTableStore.getState().bindSession(sessionId);
  }, [hydrated, sessionId]);

  const openItem = useCallback((id: string) => setItemId(id), []);
  const openCallServer = useCallback(() => setCallOpen(true), []);

  const boundSessionId = useTableStore((s) => s.sessionId);
  const tableNumber = snapshot?.table.number ?? 0;
  const value = useMemo<GuestContextValue>(
    () => ({
      table: { token, number: tableNumber },
      hydrated: hydrated && !!sessionId && boundSessionId === sessionId,
      menuState,
      openItem,
      openCallServer,
      base: `/table/${encodeURIComponent(token)}`,
    }),
    [token, tableNumber, hydrated, sessionId, boundSessionId, menuState, openItem, openCallServer],
  );

  if (phase.kind !== "ready" || !snapshot) {
    return <JoinScreen phase={phase.kind === "ready" ? { kind: "joining" } : phase} onJoin={(a) => void join(a)} />;
  }

  return (
    <GuestContext.Provider value={value}>
      <OfflineBanner />
      <div className="mx-auto min-h-svh w-full max-w-3xl pb-[calc(env(safe-area-inset-bottom)+10rem)]">
        {children}
      </div>
      <FloatingCartBar />
      <BottomNav />
      <ItemSheet itemId={itemId} onClose={() => setItemId(null)} />
      <CallServerSheet open={callOpen} onClose={() => setCallOpen(false)} />
    </GuestContext.Provider>
  );
}
