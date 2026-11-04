import { describe, expect, it, vi } from "vitest";
import { createStockStore, shownInStock, type SendStock } from "../src/store/stock-store";

/**
 * A fake PATCH /api/menu/items/:id/stock backed by a fake database row.
 * Requests stay pending until the test resolves them, so we can control
 * exactly when replies (and other users' changes) arrive.
 */
function fakeServer(initial = { inStock: true, version: 1 }) {
  const row = { ...initial };
  const pending: { inStock: boolean; resolve: () => void; reject: (e: unknown) => void }[] = [];
  const send: SendStock = vi.fn(
    (_id: string, inStock: boolean) =>
      new Promise<{ inStock: boolean; stockVersion: number }>((resolve, reject) => {
        pending.push({
          inStock,
          // Like the real route: the UPDATE commits now and returns the new version.
          resolve: () => {
            row.inStock = inStock;
            row.version += 1;
            resolve({ inStock, stockVersion: row.version });
          },
          reject,
        });
      }),
  );
  /** Another screen changes the item; returns the socket event it causes. */
  const otherUser = (inStock: boolean) => {
    row.inStock = inStock;
    row.version += 1;
    return { inStock, version: row.version };
  };
  return { row, pending, send, otherUser };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(initial?: { inStock: boolean; version: number }) {
  const server = fakeServer(initial);
  const onError = vi.fn();
  const store = createStockStore(server.send, onError);
  store.getState().seed([{ id: "a", inStock: server.row.inStock, stockVersion: server.row.version }]);
  const shown = () => shownInStock(store.getState(), "a", !server.row.inStock);
  return { ...server, store, onError, shown };
}

describe("stock toggle store", () => {
  it("shows the change instantly, then keeps the server's answer", async () => {
    const { store, pending, shown, row } = setup();
    store.getState().setInStock("a", false);
    expect(shown()).toBe(false); // optimistic, before the server replies
    expect(store.getState().sending.a).toBe(true);

    pending[0]!.resolve();
    await flush();
    expect(shown()).toBe(false);
    expect(store.getState().confirmed.a).toEqual({ inStock: false, version: row.version });
    expect(store.getState().sending.a).toBeUndefined();
    expect(store.getState().desired.a).toBeUndefined();
  });

  it("rapid clicking: one request at a time, and the last click wins", async () => {
    const { store, pending, send, shown, row } = setup();
    // Five taps while the first request is still on its way: off, on, off, on, off.
    for (const v of [false, true, false, true, false]) store.getState().setInStock("a", v);
    expect(shown()).toBe(false);
    expect(send).toHaveBeenCalledTimes(1); // no request storm

    pending[0]!.resolve(); // server: off
    await flush();
    // The latest choice (off) is what the server now has: nothing more to send.
    expect(send).toHaveBeenCalledTimes(1);
    expect(shown()).toBe(false);
    expect(row.inStock).toBe(false);
  });

  it("rapid clicking: sends the final choice once the first request returns", async () => {
    const { store, pending, send, shown, row } = setup();
    store.getState().setInStock("a", false);
    store.getState().setInStock("a", true); // changed mind while the first is in flight
    expect(shown()).toBe(true);

    pending[0]!.resolve(); // server: off
    await flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith("a", true);
    expect(shown()).toBe(true); // never flickers back to "off" in between

    pending[1]!.resolve(); // server: on
    await flush();
    expect(shown()).toBe(true);
    expect(row.inStock).toBe(true);
    expect(store.getState().confirmed.a!.inStock).toBe(row.inStock);
  });

  it("ignores a repeated event for the state already shown (double-click)", () => {
    const { store, send } = setup();
    store.getState().setInStock("a", false);
    store.getState().setInStock("a", false);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("server failure: rolls back to the server state and reports the error", async () => {
    const { store, pending, shown, onError } = setup();
    store.getState().setInStock("a", false);
    expect(shown()).toBe(false);

    const boom = new Error("500");
    pending[0]!.reject(boom);
    await flush();
    expect(shown()).toBe(true); // back to what the server has
    expect(onError).toHaveBeenCalledWith("a", boom);
    expect(store.getState().sending.a).toBeUndefined();

    // The switch works again afterwards.
    store.getState().setInStock("a", false);
    expect(shown()).toBe(false);
    expect(pending).toHaveLength(2);
  });

  it("server failure after a newer event arrived: shows that newer state", async () => {
    const { store, pending, shown, otherUser, row } = setup();
    store.getState().setInStock("a", false);
    const ev = otherUser(false); // someone else turned it off too
    store.getState().applyServer("a", ev.inStock, ev.version);
    pending[0]!.reject(new Error("timeout"));
    await flush();
    expect(shown()).toBe(row.inStock);
  });

  it("two users at once: the change the server committed last wins on every screen", async () => {
    // Kitchen and manager screens, each with its own store, plus the shared "database".
    const server = fakeServer();
    const kitchen = createStockStore(server.send, vi.fn());
    const manager = createStockStore(server.send, vi.fn());
    for (const s of [kitchen, manager]) s.getState().seed([{ id: "a", inStock: true, stockVersion: 1 }]);
    const events: { inStock: boolean; version: number }[] = [];

    kitchen.getState().setInStock("a", false); // kitchen: sold out
    manager.getState().setInStock("a", false); // manager: sold out too…
    manager.getState().setInStock("a", true); // …no, back in stock (queued behind its first request)

    // The server commits the kitchen's request, then the manager's first one.
    server.pending[0]!.resolve();
    events.push({ inStock: server.row.inStock, version: server.row.version });
    server.pending[1]!.resolve();
    events.push({ inStock: server.row.inStock, version: server.row.version });
    await flush();
    // Manager now sends its final choice (in stock); the server commits it.
    expect(server.pending).toHaveLength(3);
    server.pending[2]!.resolve();
    events.push({ inStock: server.row.inStock, version: server.row.version });
    await flush();

    // Socket events reach both screens — in reverse order, to prove order doesn't matter.
    for (const ev of [...events].reverse()) {
      for (const s of [kitchen, manager]) s.getState().applyServer("a", ev.inStock, ev.version);
    }
    for (const s of [kitchen, manager]) {
      expect(shownInStock(s.getState(), "a", false)).toBe(server.row.inStock);
      expect(s.getState().confirmed.a).toEqual({ inStock: server.row.inStock, version: server.row.version });
    }
    expect(server.row.inStock).toBe(true);
  });

  it("another user's change while ours is in flight: no flicker, then the server's final state", async () => {
    const { store, pending, shown, otherUser, row } = setup();
    store.getState().setInStock("a", false);
    // Our request commits first (version 2)…
    pending[0]!.resolve();
    const ours = row.version;
    // …then another screen turns it back on (version 3), and its event beats our reply.
    const ev = otherUser(true);
    store.getState().applyServer("a", ev.inStock, ev.version);
    await flush();
    expect(ours).toBeLessThan(ev.version);
    expect(shown()).toBe(true); // the newest server state, not our older reply
    expect(store.getState().confirmed.a!.version).toBe(row.version);
  });

  it("an event arriving while our request is in flight doesn't flip the switch under the user's finger", () => {
    const { store, shown, otherUser } = setup();
    store.getState().setInStock("a", false);
    const ev = otherUser(true);
    store.getState().applyServer("a", ev.inStock, ev.version);
    expect(shown()).toBe(false); // still what the user just chose, until our reply settles it
  });

  it("ignores old events and stale menu reloads", () => {
    const { store, shown } = setup({ inStock: true, version: 5 });
    store.getState().applyServer("a", false, 4); // late, out-of-order event
    expect(shown()).toBe(true);
    store.getState().seed([{ id: "a", inStock: false, stockVersion: 3 }]); // reload that started earlier
    expect(shown()).toBe(true);
    store.getState().applyServer("a", false, 6);
    expect(shown()).toBe(false);
  });

  it("seed ignores items that are already up to date (no needless re-render)", () => {
    const { store } = setup({ inStock: true, version: 2 });
    const before = store.getState().confirmed;
    store.getState().seed([{ id: "a", inStock: true, stockVersion: 2 }]);
    expect(store.getState().confirmed).toBe(before);
  });

  it("items are independent: toggling one never blocks or changes another", async () => {
    const server = fakeServer();
    const store = createStockStore(server.send, vi.fn());
    store.getState().seed([
      { id: "a", inStock: true, stockVersion: 1 },
      { id: "b", inStock: true, stockVersion: 1 },
    ]);
    store.getState().setInStock("a", false);
    store.getState().setInStock("b", false);
    expect(server.send).toHaveBeenCalledTimes(2);
    server.pending[1]!.reject(new Error("fail")); // only b fails
    server.pending[0]!.resolve();
    await flush();
    expect(shownInStock(store.getState(), "a", true)).toBe(false);
    expect(shownInStock(store.getState(), "b", false)).toBe(true);
  });
});
