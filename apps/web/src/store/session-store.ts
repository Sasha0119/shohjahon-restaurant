"use client";

/**
 * Server-owned state of the table session (the API is the source of truth).
 * Fed by REST responses, `session:sync` snapshots and socket events.
 * Versioned events are applied only in order; a gap asks for a resync.
 */
import { versionAction } from "@app/shared/api/realtime";
import type {
  BillDTO,
  CallDTO,
  CartLineDTO,
  GuestDTO,
  OrderTicketDTO,
  SessionCloseReasonDTO,
  SessionSnapshotDTO,
} from "@app/shared/api";
import type { OrderStatus, Station } from "@app/shared";
import { create } from "zustand";

export type JoinAnswers = { joinPin?: string; confirmSwitch?: boolean; confirmReserved?: boolean };

export type JoinPhase =
  | { kind: "joining" }
  | { kind: "reserved"; table: number; startsAt: string; answers: JoinAnswers }
  | { kind: "ready" }
  | {
      kind: "occupied";
      table: number;
      guestCount: number;
      answers?: JoinAnswers;
      pinError?: "wrong" | "locked";
    }
  | { kind: "otherTable"; currentTable: number; newTable: number }
  | { kind: "invalid" }
  | { kind: "replaced" }
  | { kind: "unavailable" }
  | { kind: "closed"; reason: SessionCloseReasonDTO }
  | { kind: "error" };

type Apply = "apply" | "ignore" | "resync";

interface SessionState {
  phase: JoinPhase;
  snapshot: SessionSnapshotDTO | null;
  /** Live connection to the server (false while reconnecting). */
  connected: boolean;

  setPhase: (phase: JoinPhase) => void;
  setConnected: (connected: boolean) => void;
  applySnapshot: (snapshot: SessionSnapshotDTO) => void;
  applyGuests: (version: number, guests: GuestDTO[]) => Apply;
  applyCart: (version: number, cart: CartLineDTO[]) => Apply;
  applyOrdersCreated: (version: number, tickets: OrderTicketDTO[]) => Apply;
  applyOrderUpdated: (
    version: number,
    u: { orderId: string; round: number; station: Station; status: OrderStatus; at: string },
  ) => Apply;
  /** Bill pushed by the server after a payment / discount change (versioned). */
  applyBill: (version: number, bill: BillDTO) => Apply;
  /** Bill fetched on demand (e.g. after an order changed) — always the latest read. */
  setBill: (bill: BillDTO) => void;
  /** Calls aren't versioned: upsert by id (open calls only are kept). */
  applyCall: (call: CallDTO) => void;
  closed: (reason: SessionCloseReasonDTO) => void;
}

export const useSessionStore = create<SessionState>((set, get) => {
  /** Apply a change only if it is exactly the next version. */
  const versioned = (version: number, mutate: (s: SessionSnapshotDTO) => SessionSnapshotDTO): Apply => {
    const snap = get().snapshot;
    if (!snap) return "resync";
    const action = versionAction(snap.version, version);
    if (action === "apply") set({ snapshot: { ...mutate(snap), version } });
    return action;
  };

  return {
    phase: { kind: "joining" },
    snapshot: null,
    connected: false,

    setPhase: (phase) => set({ phase }),
    setConnected: (connected) => set({ connected }),

    applySnapshot: (snapshot) => {
      const current = get().snapshot;
      // Never go backwards (a slow response can arrive after a newer event).
      if (current && current.sessionId === snapshot.sessionId && snapshot.version < current.version) return;
      set({
        snapshot,
        phase:
          snapshot.status === "closed"
            ? { kind: "closed", reason: snapshot.closeReason ?? "staff" }
            : { kind: "ready" },
      });
    },

    applyGuests: (version, guests) =>
      versioned(version, (s) => ({ ...s, guests, me: guests.find((g) => g.id === s.me.id) ?? s.me })),

    applyCart: (version, cart) => versioned(version, (s) => ({ ...s, cart })),

    applyOrdersCreated: (version, tickets) =>
      versioned(version, (s) => ({
        ...s,
        orders: [...s.orders.filter((o) => !tickets.some((t) => t.id === o.id)), ...tickets],
      })),

    applyOrderUpdated: (version, u) =>
      versioned(version, (s) => ({
        ...s,
        orders: s.orders.map((o) => (o.id === u.orderId ? { ...o, status: u.status, statusChangedAt: u.at } : o)),
      })),

    applyBill: (version, bill) => versioned(version, (s) => ({ ...s, bill })),

    setBill: (bill) => {
      const snap = get().snapshot;
      if (snap) set({ snapshot: { ...snap, bill } });
    },

    applyCall: (call) => {
      const snap = get().snapshot;
      if (!snap) return;
      const others = snap.calls.filter((c) => c.id !== call.id);
      set({ snapshot: { ...snap, calls: call.status === "open" ? [...others, call] : others } });
    },

    closed: (reason) => {
      const snap = get().snapshot;
      set({
        phase: { kind: "closed", reason },
        snapshot: snap ? { ...snap, status: "closed", closeReason: reason } : snap,
      });
    },
  };
});
