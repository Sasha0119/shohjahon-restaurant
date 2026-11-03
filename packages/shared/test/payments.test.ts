import { describe, expect, it } from "vitest";
import { allowedAmounts, codeDiscount, isAllowedAmount, splitEvenly, suggestedAmount } from "../src";

const ctx = { total: 1000, subtotal: 800, outstanding: 1000 };

describe("allowedAmounts", () => {
  it("full = exactly what is outstanding", () => {
    expect(allowedAmounts("full", ctx)).toEqual({ exact: [1000] });
    expect(isAllowedAmount(999, "full", ctx)).toBe(false);
  });

  it("even split adds up exactly across payers, whatever order they pay in", () => {
    // 1000 / 3 → 334, 333, 333
    expect(allowedAmounts("even", ctx, { people: 3 })).toEqual({ exact: [334, 333] });
    let outstanding = 1000;
    const paid: number[] = [];
    for (let i = 0; i < 3; i++) {
      const amount = suggestedAmount("even", { ...ctx, outstanding }, { people: 3 });
      expect(isAllowedAmount(amount, "even", { ...ctx, outstanding }, { people: 3 })).toBe(true);
      paid.push(amount);
      outstanding -= amount;
    }
    expect(paid.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(outstanding).toBe(0);
  });

  it("the last even share is capped by what is left", () => {
    expect(allowedAmounts("even", { ...ctx, outstanding: 332 }, { people: 3 })).toEqual({ exact: [332] });
  });

  it("by item pays the items' fair share of service, tax and discounts", () => {
    // 200 of 800 subtotal → a quarter of the 1000 total
    expect(allowedAmounts("items", ctx, { selectedSubtotal: 200 })).toEqual({ exact: [250] });
    expect(isAllowedAmount(250, "items", ctx, { selectedSubtotal: 200 })).toBe(true);
    expect(isAllowedAmount(251, "items", ctx, { selectedSubtotal: 200 })).toBe(false);
  });

  it("custom accepts 1 cent up to the outstanding amount", () => {
    expect(isAllowedAmount(1, "custom", ctx)).toBe(true);
    expect(isAllowedAmount(1000, "custom", ctx)).toBe(true);
    expect(isAllowedAmount(1001, "custom", ctx)).toBe(false);
    expect(isAllowedAmount(0, "custom", ctx)).toBe(false);
    expect(isAllowedAmount(10.5, "custom", ctx)).toBe(false);
  });

  it("nothing can be paid when nothing is outstanding", () => {
    expect(isAllowedAmount(1, "custom", { ...ctx, outstanding: 0 })).toBe(false);
  });

  it("even shares match splitEvenly", () => {
    expect(splitEvenly(1000, 3)).toEqual([334, 333, 333]);
  });
});

describe("codeDiscount", () => {
  it("applies percent codes in basis points and caps fixed codes", () => {
    expect(codeDiscount("percent", 1000, 4550)).toBe(455); // 10 %
    expect(codeDiscount("percent", 1250, 1000)).toBe(125); // 12.5 %
    expect(codeDiscount("fixed", 500, 4550)).toBe(500);
    expect(codeDiscount("fixed", 9999, 300)).toBe(300);
    expect(codeDiscount("percent", 10000, 300)).toBe(300);
    expect(codeDiscount("fixed", 500, 0)).toBe(0);
  });
});
