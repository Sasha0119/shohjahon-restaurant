"use client";

import { brand } from "@app/config";
import Image from "next/image";
import { usePathname } from "next/navigation";
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

  // The home page's photo lives here, so one image stays on screen from the loading screen onward.
  const pathname = usePathname();
  const onHome = /^\/table\/[^/]+$/.test(pathname);
  const showHero = onHome && (phase.kind === "joining" || phase.kind === "ready");
  const heroPhoto = showHero && (
    <div aria-hidden className="absolute inset-x-0 top-0 md:pl-[calc(6rem+env(safe-area-inset-left))]">
      <div className="relative mx-auto h-svh min-h-[600px] max-h-[960px] w-full max-w-3xl overflow-hidden lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[96rem]">
        <div className="hero-settle absolute inset-0">
          <Image src={brand.heroImage.src} alt="" fill priority decoding="sync" sizes="(max-aspect-ratio: 3/2) 150vh, 100vw" className="object-cover" />
        </div>
      </div>
    </div>
  );

  if (phase.kind !== "ready" || !snapshot) {
    return (
      <>
        {heroPhoto}
        <div className="relative z-10">
          <JoinScreen phase={phase.kind === "ready" ? { kind: "joining" } : phase} onJoin={(a) => void join(a)} />
        </div>
      </>
    );
  }

  return (
    <GuestContext.Provider value={value}>
      {heroPhoto}
      <OfflineBanner />
      {/* Phones: room for the bottom nav + cart bar. md+: the nav is a left rail instead. */}
      <div className="relative z-10 min-h-svh pb-[calc(env(safe-area-inset-bottom)+10rem)] md:pb-28 md:pl-[calc(6rem+env(safe-area-inset-left))]">
        <div className="mx-auto w-full max-w-3xl lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[96rem]">{children}</div>
      </div>
      <FloatingCartBar />
      <BottomNav />
      <ItemSheet itemId={itemId} onClose={() => setItemId(null)} />
      <CallServerSheet open={callOpen} onClose={() => setCallOpen(false)} />
    </GuestContext.Provider>
  );
}
