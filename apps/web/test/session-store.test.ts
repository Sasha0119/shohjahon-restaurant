import type { SessionSnapshotDTO } from "@app/shared/api";
import { beforeEach, describe, expect, it } from "vitest";
import { phaseForJoinError } from "../src/components/guest/use-table-session";
import { ApiClientError } from "../src/lib/api";
import { useSessionStore } from "../src/store/session-store";

const snapshot = (over: Partial<SessionSnapshotDTO> = {}): SessionSnapshotDTO => ({
  sessionId: "s1",
  version: 3,
  table: { id: "t1", number: 12, label: null },
  me: { id: "g1", nickname: "" },
  guests: [{ id: "g1", nickname: "" }],
  cart: [],
  orders: [],
  calls: [],
  bill: {
    subtotalCents: 0,
    comboDiscountCents: 0,
    codeDiscountCents: 0,
    discountCode: null,
    serviceChargeCents: 0,
    taxCents: 0,
    totalCents: 0,
    paidCents: 0,
    tipsPaidCents: 0,
    balanceCents: 0,
    pendingCents: 0,
    outstandingCents: 0,
    claimedOrderItemIds: [],
  },
  status: "open",
  closeReason: null,
  joinPin: "123456",
  ...over,
});

describe("session store", () => {
  beforeEach(() => useSessionStore.setState({ phase: { kind: "joining" }, snapshot: null, connected: false }));
  const s = () => useSessionStore.getState();

  it("becomes ready on a snapshot", () => {
    s().applySnapshot(snapshot());
    expect(s().phase).toEqual({ kind: "ready" });
  });

  it("applies the next guest event, ignores stale ones, asks to resync on a gap", () => {
    s().applySnapshot(snapshot());
    expect(
      s().applyGuests(4, [
        { id: "g1", nickname: "Sam" },
        { id: "g2", nickname: "" },
      ]),
    ).toBe("apply");
    expect(s().snapshot?.me.nickname).toBe("Sam");
    expect(s().snapshot?.guests).toHaveLength(2);
    expect(s().applyGuests(4, [])).toBe("ignore");
    expect(s().snapshot?.guests).toHaveLength(2);
    expect(s().applyGuests(9, [])).toBe("resync");
    expect(s().snapshot?.version).toBe(4);
  });

  it("never goes backwards when a slow response arrives late", () => {
    s().applySnapshot(snapshot({ version: 7 }));
    s().applySnapshot(snapshot({ version: 5 }));
    expect(s().snapshot?.version).toBe(7);
    // …but a different session (new visit) always replaces it.
    s().applySnapshot(snapshot({ sessionId: "s2", version: 1 }));
    expect(s().snapshot?.sessionId).toBe("s2");
  });

  it("shows the closed screen with the reason", () => {
    s().applySnapshot(snapshot());
    s().closed("staff");
    expect(s().phase).toEqual({ kind: "closed", reason: "staff" });
    s().applySnapshot(snapshot({ status: "closed", closeReason: "paid", version: 10 }));
    expect(s().phase).toEqual({ kind: "closed", reason: "paid" });
  });
});

describe("phaseForJoinError", () => {
  const err = (code: string, details?: unknown) => new ApiClientError(409, code, "x", details);

  it("maps API errors to the right screen", () => {
    expect(phaseForJoinError(err("TABLE_OCCUPIED", { table: 4, guestCount: 2 }))).toEqual({
      kind: "occupied",
      table: 4,
      guestCount: 2,
    });
    expect(phaseForJoinError(err("OTHER_TABLE", { currentTable: 3, newTable: 7 }))).toEqual({
      kind: "otherTable",
      currentTable: 3,
      newTable: 7,
    });
    expect(phaseForJoinError(err("INVALID_QR"))).toEqual({ kind: "invalid" });
    expect(phaseForJoinError(err("QR_REPLACED"))).toEqual({ kind: "replaced" });
    expect(phaseForJoinError(err("TABLE_UNAVAILABLE"))).toEqual({ kind: "unavailable" });
    expect(phaseForJoinError(new ApiClientError(0, "NETWORK", "offline"))).toEqual({ kind: "error" });
    expect(phaseForJoinError(new Error("boom"))).toEqual({ kind: "error" });
  });
});

describe("session store — cart, orders and calls", () => {
  const s = () => useSessionStore.getState();
  const line = {
    id: "l1",
    itemId: "i1",
    quantity: 1,
    selection: {},
    note: null,
    guestId: "g1",
    addedBy: "",
    unitPriceCents: 500,
    updatedAt: "",
  };
  const ticket = {
    id: "o1",
    round: 1,
    station: "kitchen" as const,
    status: "received" as const,
    createdAt: "2026-11-03T19:00:00Z",
    statusChangedAt: "2026-11-03T19:00:00Z",
    tableNumber: 12,
    lines: [],
  };
  beforeEach(() => useSessionStore.setState({ phase: { kind: "joining" }, snapshot: null, connected: false }));

  it("applies cart, new orders and status changes in version order", () => {
    s().applySnapshot(snapshot({ version: 3 }));
    expect(s().applyCart(4, [line])).toBe("apply");
    expect(s().applyCart(6, [])).toBe("resync");
    expect(s().snapshot?.cart).toHaveLength(1);
    expect(s().applyCart(5, [])).toBe("apply");
    expect(s().applyOrdersCreated(6, [ticket])).toBe("apply");
    expect(
      s().applyOrderUpdated(7, { orderId: "o1", round: 1, station: "kitchen", status: "preparing", at: "x" }),
    ).toBe("apply");
    expect(s().snapshot?.orders[0]!.status).toBe("preparing");
    // The phone that acted applies the REST response; the matching socket event is then ignored.
    expect(
      s().applyOrderUpdated(7, { orderId: "o1", round: 1, station: "kitchen", status: "preparing", at: "x" }),
    ).toBe("ignore");
  });

  it("keeps only open calls", () => {
    s().applySnapshot(snapshot());
    const call = {
      id: "c1",
      type: "water" as const,
      status: "open" as const,
      tableNumber: 12,
      createdAt: "",
      amountCents: null,
    };
    s().applyCall(call);
    expect(s().snapshot?.calls).toHaveLength(1);
    s().applyCall({ ...call, status: "handled" });
    expect(s().snapshot?.calls).toHaveLength(0);
  });
});
