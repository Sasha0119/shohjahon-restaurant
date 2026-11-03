import { describe, expect, it } from "vitest";
import { isIdleExpired, shouldTouch, tableStatus } from "../src/sessions/rules.ts";
import { createQrToken, guestTableUrl, verifyQrToken } from "../src/tables/qr-token.ts";

const SECRET = "s".repeat(48);

describe("QR tokens", () => {
  const token = createQrToken(SECRET, "cltable123", 1);

  it("round-trips", () => {
    expect(token).toMatch(/^cltable123\.1\.[A-Za-z0-9_-]{22}$/);
    expect(verifyQrToken(SECRET, token)).toEqual({ ok: true, tableId: "cltable123", qrVersion: 1 });
  });

  it("can't be forged for another table or version", () => {
    const [, , sig] = token.split(".");
    expect(verifyQrToken(SECRET, `cltable999.1.${sig}`).ok).toBe(false);
    expect(verifyQrToken(SECRET, `cltable123.2.${sig}`).ok).toBe(false);
  });

  it("is rejected with another secret or when tampered", () => {
    expect(verifyQrToken("x".repeat(48), token).ok).toBe(false);
    expect(verifyQrToken(SECRET, token.slice(0, -1) + (token.endsWith("A") ? "B" : "A")).ok).toBe(false);
  });

  it("rejects malformed input without throwing", () => {
    for (const bad of ["", "a.b", "a.b.c.d", "a.0.xxxxxxxxxxxxxxxxxxxxxx", "../etc.1.x", "a".repeat(200), "a.01.x"]) {
      expect(verifyQrToken(SECRET, bad).ok).toBe(false);
    }
  });

  it("builds the guest link", () => {
    expect(guestTableUrl("https://order.example.org/", "t.1.sig")).toBe("https://order.example.org/table/t.1.sig");
  });

  it("refuses to sign invalid input", () => {
    expect(() => createQrToken(SECRET, "bad id", 1)).toThrow();
    expect(() => createQrToken(SECRET, "ok", 0)).toThrow();
  });
});

describe("session rules", () => {
  const now = new Date("2026-11-03T20:00:00Z");
  const ago = (min: number) => ({ lastActivityAt: new Date(now.getTime() - min * 60_000) });

  it("expires idle sessions with nothing ordered", () => {
    expect(isIdleExpired(ago(119), false, now, 120)).toBe(false);
    expect(isIdleExpired(ago(120), false, now, 120)).toBe(true);
  });

  it("never auto-expires a table with an unpaid order", () => {
    expect(isIdleExpired(ago(999), true, now, 120)).toBe(false);
  });

  it("throttles activity writes", () => {
    expect(shouldTouch(new Date(now.getTime() - 10_000), now)).toBe(false);
    expect(shouldTouch(new Date(now.getTime() - 31_000), now)).toBe(true);
  });

  it("derives table status", () => {
    expect(tableStatus({ hasOpenSession: false, hasActiveOrders: false, billRequested: false })).toBe("free");
    expect(tableStatus({ hasOpenSession: true, hasActiveOrders: false, billRequested: false })).toBe("seated");
    expect(tableStatus({ hasOpenSession: true, hasActiveOrders: true, billRequested: false })).toBe("ordered");
    expect(tableStatus({ hasOpenSession: true, hasActiveOrders: true, billRequested: true })).toBe("billRequested");
  });
});
