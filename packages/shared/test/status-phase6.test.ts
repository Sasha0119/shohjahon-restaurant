import { describe, expect, it } from "vitest";
import { isTicketUpdateNewer, roundStatus, ticketUrgency } from "../src";

describe("roundStatus", () => {
  it("shows the least advanced live ticket", () => {
    expect(roundStatus(["ready", "preparing"])).toBe("preparing");
    expect(roundStatus(["served", "served"])).toBe("served");
    expect(roundStatus(["received"])).toBe("received");
  });

  it("ignores cancelled tickets unless everything was cancelled", () => {
    expect(roundStatus(["cancelled", "ready"])).toBe("ready");
    expect(roundStatus(["cancelled", "cancelled"])).toBe("cancelled");
  });
});

describe("ticketUrgency", () => {
  const cfg = { warnAfterMinutes: 10, lateAfterMinutes: 20 };
  const t0 = Date.UTC(2026, 10, 3, 19);
  it("turns amber then red as a ticket waits", () => {
    expect(ticketUrgency(t0, t0 + 9 * 60_000, cfg)).toBe("normal");
    expect(ticketUrgency(t0, t0 + 10 * 60_000, cfg)).toBe("warn");
    expect(ticketUrgency(t0, t0 + 25 * 60_000, cfg)).toBe("late");
  });
});

describe("isTicketUpdateNewer", () => {
  const at = (m: number) => new Date(Date.UTC(2026, 10, 3, 19, m)).toISOString();
  it("accepts forward moves and brand-new tickets", () => {
    expect(isTicketUpdateNewer(undefined, { status: "received", statusChangedAt: at(0) })).toBe(true);
    expect(isTicketUpdateNewer({ status: "received", statusChangedAt: at(0) }, { status: "preparing", statusChangedAt: at(1) })).toBe(true);
  });

  it("ignores a late, older broadcast after the cook already moved the ticket", () => {
    // Optimistic local move keeps the old timestamp; the delayed "received" event must not undo it.
    expect(isTicketUpdateNewer({ status: "preparing", statusChangedAt: at(0) }, { status: "received", statusChangedAt: at(0) })).toBe(false);
    expect(isTicketUpdateNewer({ status: "ready", statusChangedAt: at(5) }, { status: "ready", statusChangedAt: at(3) })).toBe(false);
  });

  it("always applies a cancellation, and nothing after it", () => {
    expect(isTicketUpdateNewer({ status: "received", statusChangedAt: at(2) }, { status: "cancelled", statusChangedAt: at(1) })).toBe(true);
    expect(isTicketUpdateNewer({ status: "cancelled", statusChangedAt: at(1) }, { status: "received", statusChangedAt: at(2) })).toBe(false);
  });
});
