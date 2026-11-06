"use client";

import type { BillDTO, SessionSnapshotDTO, SyncAck } from "@app/shared/api";
import { useCallback, useEffect, useRef } from "react";
import { ApiClientError, api } from "@/lib/api";
import { createSocket, type AppSocket } from "@/lib/socket";
import { useMenuStore } from "@/store/menu-store";
import { useSessionStore, type JoinAnswers, type JoinPhase } from "@/store/session-store";

interface JoinResponse {
  rejoined: boolean;
  snapshot: SessionSnapshotDTO;
}

/** Map API errors from the join call to a screen. */
export function phaseForJoinError(e: unknown): JoinPhase {
  if (!(e instanceof ApiClientError)) return { kind: "error" };
  const d = (e.details ?? {}) as Record<string, number> & { startsAt?: string };
  switch (e.code) {
    case "TABLE_RESERVED":
      return { kind: "reserved", table: d.table ?? 0, startsAt: d.startsAt ?? "", answers: {} };
    case "TABLE_OCCUPIED":
      return { kind: "occupied", table: d.table ?? 0, guestCount: d.guestCount ?? 1 };
    case "OTHER_TABLE":
      return { kind: "otherTable", currentTable: d.currentTable ?? 0, newTable: d.newTable ?? 0 };
    case "INVALID_QR":
      return { kind: "invalid" };
    case "QR_REPLACED":
      return { kind: "replaced" };
    case "TABLE_UNAVAILABLE":
      return { kind: "unavailable" };
    default:
      return { kind: "error" };
  }
}

/**
 * Joins the table for this QR token and keeps the session live:
 *  • POST /api/tables/:token/join (with the guest's answers when asked)
 *  • Socket.io with auto-reconnect; on every (re)connect → session:sync
 *  • versioned events; a gap triggers a resync, so nothing is ever missed
 */
export function useTableSession(token: string) {
  const store = useSessionStore;
  const sessionId = useSessionStore((s) => s.snapshot?.sessionId);
  const phaseKind = useSessionStore((s) => s.phase.kind);
  const socketRef = useRef<AppSocket | null>(null);

  const join = useCallback(
    async (answers: JoinAnswers = {}) => {
      store.getState().setPhase({ kind: "joining" });
      try {
        const res = await api<JoinResponse>("POST", `/api/tables/${encodeURIComponent(token)}/join`, answers);
        store.getState().applySnapshot(res.snapshot);
      } catch (e) {
        const phase = phaseForJoinError(e);
        // Earlier answers still count: someone switching tables shouldn't be asked to switch again.
        store.getState().setPhase(phase.kind === "reserved" ? { ...phase, answers } : phase);
      }
    },
    [store, token],
  );

  useEffect(() => {
    void join();
  }, [join]);

  // One socket per open session.
  useEffect(() => {
    if (!sessionId || phaseKind !== "ready") return;
    const socket = createSocket();
    socketRef.current = socket;
    const s = store.getState;

    const sync = async () => {
      const version = s().snapshot?.version ?? -1;
      try {
        const res: SyncAck = await socket.timeout(8000).emitWithAck("session:sync", { version });
        if (!res.ok) {
          if (res.error === "SESSION_CLOSED") s().closed("expired");
          return;
        }
        if (!res.upToDate) s().applySnapshot(res.snapshot);
      } catch {
        /* timed out — the next reconnect will sync again */
      }
    };

    socket.on("connect", () => {
      s().setConnected(true);
      void sync();
      // Catch up on stock changes missed while offline (a cheap 304 if nothing changed).
      void useMenuStore.getState().load();
    });
    socket.on("disconnect", () => s().setConnected(false));
    socket.on("connect_error", (err) => {
      s().setConnected(false);
      if (err.message === "SESSION_CLOSED") {
        socket.disconnect();
        void api<{ snapshot: SessionSnapshotDTO }>("GET", "/api/session").catch((e) => {
          const reason = (e instanceof ApiClientError && (e.details as { reason?: string })?.reason) || "expired";
          s().closed(reason as "paid" | "staff" | "expired");
        });
      }
    });
    const check = (r: "apply" | "ignore" | "resync") => r === "resync" && void sync();
    socket.on("session:guests", ({ version, guests }) => check(s().applyGuests(version, guests)));
    socket.on("cart:updated", ({ version, cart }) => check(s().applyCart(version, cart)));
    // Orders change the bill: re-read it (a cheap GET; the bill itself is computed on the server).
    const refreshBill = () =>
      void api<{ bill: BillDTO }>("GET", "/api/session/bill")
        .then(({ bill }) => s().setBill(bill))
        .catch(() => {});
    socket.on("order:created", ({ version, tickets }) => {
      check(s().applyOrdersCreated(version, tickets));
      refreshBill();
    });
    socket.on("order:updated", ({ version, ...u }) => {
      check(s().applyOrderUpdated(version, u));
      if (u.status === "cancelled") refreshBill();
    });
    socket.on("bill:updated", ({ version, bill }) => check(s().applyBill(version, bill)));
    // payment:updated carries the same version as bill:updated — the bill event applies it.
    socket.on("payment:updated", ({ payment }) => {
      window.dispatchEvent(new CustomEvent("payment-updated", { detail: payment }));
    });
    socket.on("call:created", ({ call }) => s().applyCall(call));
    socket.on("call:updated", ({ call }) => s().applyCall(call));
    // Menu edits: revalidate the menu (a cheap 304 if nothing changed for us).
    socket.on("menu:updated", () => void useMenuStore.getState().load());
    // Stock changes: update just that item, no reload.
    socket.on("menu:stock", ({ itemId, inStock, stockVersion }) =>
      useMenuStore.getState().applyStock(itemId, inStock, stockVersion),
    );
    socket.on("session:closed", ({ reason }) => {
      s().closed(reason);
      socket.disconnect();
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      s().setConnected(false);
    };
  }, [sessionId, phaseKind, store]);

  return { join };
}
