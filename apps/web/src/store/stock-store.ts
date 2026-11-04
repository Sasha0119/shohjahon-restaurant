import { createStore, type StoreApi } from "zustand/vanilla";

/**
 * Live "in stock / sold out" state for staff screens (kitchen + manager).
 *
 *  • Optimistic: a tap shows the new state at once.
 *  • One request per item at a time. Taps made while it is on its way are
 *    merged: when it returns, only the latest choice is sent (if it differs).
 *  • The server decides. Every server state carries `stockVersion`; the highest
 *    wins, whether it comes from our own reply, a socket event or a menu reload.
 *  • On failure the item falls back to the last server state and `onError` runs.
 */
export interface StockEntry {
  inStock: boolean;
  version: number;
}

export interface StockSnapshot {
  id: string;
  inStock: boolean;
  stockVersion: number;
}

export type SendStock = (id: string, inStock: boolean) => Promise<{ inStock: boolean; stockVersion: number }>;
export type StockError = (id: string, error: unknown) => void;

export interface StockState {
  /** Newest state the server has confirmed, per item. */
  confirmed: Record<string, StockEntry>;
  /** The state this screen shows while a change is on its way. */
  desired: Record<string, boolean>;
  /** Items with a request in flight. */
  sending: Record<string, true>;
  /** Take server states from a (re)loaded menu; older ones are ignored. */
  seed: (items: readonly StockSnapshot[]) => void;
  /** A server state from a socket event; older ones are ignored. */
  applyServer: (id: string, inStock: boolean, version: number) => void;
  /** The user flipped the switch. */
  setInStock: (id: string, inStock: boolean) => void;
}

/** What an item should show right now. */
export const shownInStock = (s: StockState, id: string, fallback: boolean): boolean =>
  s.desired[id] ?? s.confirmed[id]?.inStock ?? fallback;

const without = <T>(rec: Record<string, T>, id: string): Record<string, T> => {
  if (!(id in rec)) return rec;
  const next = { ...rec };
  delete next[id];
  return next;
};

export function createStockStore(send: SendStock, onError: StockError): StoreApi<StockState> {
  return createStore<StockState>((set, get) => {
    const isNewer = (id: string, version: number) => {
      const cur = get().confirmed[id];
      return !cur || version > cur.version;
    };
    const adopt = (id: string, inStock: boolean, version: number) => {
      if (isNewer(id, version)) set((s) => ({ confirmed: { ...s.confirmed, [id]: { inStock, version } } }));
    };

    const flush = async (id: string): Promise<void> => {
      const want = get().desired[id];
      if (want === undefined) return;
      // Already the server's state (e.g. tapped back, or another screen did it): nothing to send.
      if (want === get().confirmed[id]?.inStock) {
        set((s) => ({ desired: without(s.desired, id) }));
        return;
      }
      set((s) => ({ sending: { ...s.sending, [id]: true } }));
      try {
        const saved = await send(id, want);
        adopt(id, saved.inStock, saved.stockVersion);
      } catch (e) {
        // Roll back to the last server state.
        set((s) => ({ desired: without(s.desired, id), sending: without(s.sending, id) }));
        onError(id, e);
        return;
      }
      set((s) => ({ sending: without(s.sending, id) }));
      // Tapped again while that was on its way: send the latest choice.
      if (get().desired[id] !== want) return flush(id);
      set((s) => ({ desired: without(s.desired, id) }));
    };

    return {
      confirmed: {},
      desired: {},
      sending: {},

      seed: (items) => {
        const fresh = items.filter((i) => isNewer(i.id, i.stockVersion));
        if (!fresh.length) return;
        set((s) => {
          const confirmed = { ...s.confirmed };
          for (const i of fresh) confirmed[i.id] = { inStock: i.inStock, version: i.stockVersion };
          return { confirmed };
        });
      },

      applyServer: adopt,

      setInStock: (id, inStock) => {
        const s = get();
        // A repeated event for the state already shown (double-click, double delivery).
        if (shownInStock(s, id, !inStock) === inStock) return;
        set({ desired: { ...s.desired, [id]: inStock } });
        if (!s.sending[id]) void flush(id);
      },
    };
  });
}
