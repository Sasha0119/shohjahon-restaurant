import { applyPercent } from "./money";
import { shareForItems, splitEvenly } from "./split";
import type { Money } from "./types";

/**
 * Payment rules shared by the server (which enforces them) and the guest app
 * (which proposes amounts). All amounts exclude the tip.
 */

export type SplitModeKey = "full" | "even" | "items" | "custom";

export interface AmountContext {
  /** Bill total (net + service + tax). */
  total: Money;
  /** Items subtotal before discounts (used for "by item" shares). */
  subtotal: Money;
  /** What can still be paid right now (balance − pending payments). */
  outstanding: Money;
}

/**
 * The amount(s) a guest may pay in each mode:
 *  • full   → exactly what is outstanding
 *  • even   → one share of the total split N ways (exact cents; the last
 *             payer pays what is left if earlier shares were rounded up)
 *  • items  → the chosen items' share of the total, incl. service/tax/discounts
 *  • custom → anything from 1 cent up to what is outstanding
 */
export function allowedAmounts(
  mode: SplitModeKey,
  ctx: AmountContext,
  opts: { people?: number; selectedSubtotal?: Money } = {},
): { exact: Money[] } | { min: Money; max: Money } {
  const cap = (v: Money) => Math.min(v, ctx.outstanding);
  switch (mode) {
    case "full":
      return { exact: [ctx.outstanding] };
    case "even": {
      const shares = splitEvenly(ctx.total, Math.max(2, opts.people ?? 2));
      return { exact: [...new Set(shares.map(cap))] };
    }
    case "items":
      return { exact: [cap(shareForItems(ctx.total, ctx.subtotal, opts.selectedSubtotal ?? 0))] };
    case "custom":
      return { min: 1, max: ctx.outstanding };
  }
}

/** The amount the app suggests for a mode (the first allowed value). */
export function suggestedAmount(
  mode: SplitModeKey,
  ctx: AmountContext,
  opts: { people?: number; selectedSubtotal?: Money; custom?: Money } = {},
): Money {
  const allowed = allowedAmounts(mode, ctx, opts);
  if ("exact" in allowed) return Math.max(...allowed.exact);
  return Math.min(Math.max(opts.custom ?? 0, 0), allowed.max);
}

export function isAllowedAmount(
  amount: Money,
  mode: SplitModeKey,
  ctx: AmountContext,
  opts: { people?: number; selectedSubtotal?: Money } = {},
): boolean {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > ctx.outstanding) return false;
  const allowed = allowedAmounts(mode, ctx, opts);
  return "exact" in allowed ? allowed.exact.includes(amount) : amount >= allowed.min && amount <= allowed.max;
}

/**
 * Discount code value → cents off.
 *  • PERCENT: `value` is basis points (1000 = 10 %) of the base
 *  • FIXED:   `value` is cents, never more than the base
 */
export function codeDiscount(kind: "percent" | "fixed", value: number, base: Money): Money {
  if (base <= 0) return 0;
  return kind === "percent" ? Math.min(base, applyPercent(base, value / 100)) : Math.min(value, base);
}
