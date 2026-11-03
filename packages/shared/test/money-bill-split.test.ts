import { describe, expect, it } from "vitest";
import {
  allocateProportionally,
  applyPercent,
  clampCustomAmount,
  computeBill,
  formatMoney,
  parseMoney,
  shareForItems,
  splitEvenly,
} from "../src";

describe("money", () => {
  it("applies percentages with half-up rounding and no float drift", () => {
    expect(applyPercent(1000, 8)).toBe(80);
    expect(applyPercent(1005, 10)).toBe(101); // 100.5 → 101
    expect(applyPercent(1004, 10)).toBe(100); // 100.4 → 100
    expect(applyPercent(999, 8.875)).toBe(89); // 88.66 → 89
    expect(applyPercent(0, 15)).toBe(0);
  });

  it("rejects non-integer or negative money", () => {
    expect(() => applyPercent(10.5, 10)).toThrow();
    expect(() => applyPercent(-1, 10)).toThrow();
    expect(() => applyPercent(100, -5)).toThrow();
  });

  it("formats with the currency's minor units", () => {
    expect(formatMoney(123456, "USD", "en-US")).toBe("$1,234.56");
    expect(formatMoney(1500, "JPY", "en-US")).toBe("¥1,500");
  });

  it("parses user-typed amounts", () => {
    expect(parseMoney("12.5", "USD")).toBe(1250);
    expect(parseMoney("$7", "USD")).toBe(700);
    expect(parseMoney("3,25", "EUR")).toBe(325);
    expect(parseMoney("1.234", "USD")).toBeNull();
    expect(parseMoney("abc", "USD")).toBeNull();
    expect(parseMoney("", "USD")).toBeNull();
  });
});

describe("computeBill", () => {
  const base = { taxPercent: 8, serviceChargePercent: 10 };

  it("computes subtotal, service, tax, tip and total", () => {
    const bill = computeBill({ ...base, lineTotals: [1850, 750, 475], tipPercent: 15 });
    expect(bill.subtotal).toBe(3075);
    expect(bill.serviceCharge).toBe(308); // 307.5 → 308
    expect(bill.tax).toBe(246);
    expect(bill.tip).toBe(461); // 461.25 → 461
    expect(bill.total).toBe(3075 + 308 + 246 + 461);
    expect(bill.balance).toBe(bill.total);
  });

  it("applies discount before percentages and caps it at the subtotal", () => {
    const bill = computeBill({ ...base, lineTotals: [1000], discount: 200 });
    expect(bill.net).toBe(800);
    expect(bill.tax).toBe(64);
    const capped = computeBill({ ...base, lineTotals: [1000], discount: 5000 });
    expect(capped.discount).toBe(1000);
    expect(capped.total).toBe(0);
  });

  it("prefers a custom tip amount over a percentage", () => {
    const bill = computeBill({ ...base, lineTotals: [1000], tipPercent: 20, tipAmount: 150 });
    expect(bill.tip).toBe(150);
  });

  it("tracks partial payments and never shows a negative balance", () => {
    const bill = computeBill({ ...base, lineTotals: [1000], paid: 500 });
    expect(bill.balance).toBe(bill.total - 500);
    expect(computeBill({ ...base, lineTotals: [1000], paid: 99999 }).balance).toBe(0);
  });

  it("handles an empty bill", () => {
    expect(computeBill({ ...base, lineTotals: [] }).total).toBe(0);
  });
});

describe("splitting", () => {
  it("splits evenly with leftover cents on the first shares", () => {
    expect(splitEvenly(1000, 3)).toEqual([334, 333, 333]);
    expect(splitEvenly(1001, 2)).toEqual([501, 500]);
    expect(splitEvenly(5, 7)).toEqual([1, 1, 1, 1, 1, 0, 0]);
    expect(() => splitEvenly(100, 0)).toThrow();
  });

  it("allocates proportionally and always sums exactly", () => {
    expect(allocateProportionally(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocateProportionally(1000, [2, 1, 1])).toEqual([500, 250, 250]);
    expect(allocateProportionally(10, [0, 0])).toEqual([5, 5]);

    // Property check: random inputs never lose or create a cent.
    for (let i = 0; i < 500; i++) {
      const amount = Math.floor(Math.random() * 1_000_000);
      const weights = Array.from({ length: 1 + Math.floor(Math.random() * 8) }, () =>
        Math.floor(Math.random() * 5000),
      );
      const parts = allocateProportionally(amount, weights);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(amount);
      parts.forEach((p) => expect(Number.isInteger(p) && p >= 0).toBe(true));
    }
  });

  it("computes 'pay for my items' including a fair share of extras", () => {
    // subtotal 4000, total 5320 (tax/service/tip on top). I had 1000 of items.
    expect(shareForItems(5320, 4000, 1000)).toBe(1330);
    expect(shareForItems(5320, 4000, 4000)).toBe(5320);
    expect(shareForItems(5320, 4000, 0)).toBe(0);
    expect(() => shareForItems(5320, 4000, 4001)).toThrow();
  });

  it("clamps custom amounts to the balance", () => {
    expect(clampCustomAmount(500, 300)).toBe(300);
    expect(clampCustomAmount(200, 300)).toBe(200);
    expect(clampCustomAmount(-5, 300)).toBe(0);
  });
});
