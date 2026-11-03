import { applyPercent, assertMoney, sum } from "./money";
import type { Money } from "./types";

export interface BillInput {
  /** Line totals (already unit price × quantity). */
  lineTotals: Money[];
  /** Fixed discount, e.g. from a discount code. Capped at the subtotal. */
  discount?: Money;
  taxPercent: number;
  serviceChargePercent: number;
  /** Either a percentage of the discounted subtotal… */
  tipPercent?: number;
  /** …or a custom amount. A custom amount wins when both are set. */
  tipAmount?: Money;
  /** Already paid (partial payments). */
  paid?: Money;
}

export interface BillBreakdown {
  subtotal: Money;
  discount: Money;
  /** subtotal − discount */
  net: Money;
  serviceCharge: Money;
  tax: Money;
  tip: Money;
  total: Money;
  paid: Money;
  balance: Money;
}

/**
 * Bill rules (simple and explicit, so the server can reproduce them exactly):
 *   net     = subtotal − discount
 *   service = net × service %
 *   tax     = net × tax %
 *   tip     = custom amount, or net × tip %
 *   total   = net + service + tax + tip
 * Each component is rounded half-up to the minor unit on its own.
 */
export function computeBill(input: BillInput): BillBreakdown {
  input.lineTotals.forEach((v) => assertMoney(v));
  const subtotal = sum(input.lineTotals);
  const discount = Math.min(input.discount ?? 0, subtotal);
  assertMoney(discount);
  const net = subtotal - discount;
  const serviceCharge = applyPercent(net, input.serviceChargePercent);
  const tax = applyPercent(net, input.taxPercent);
  let tip = 0;
  if (input.tipAmount !== undefined) {
    assertMoney(input.tipAmount);
    tip = input.tipAmount;
  } else if (input.tipPercent) {
    tip = applyPercent(net, input.tipPercent);
  }
  const total = net + serviceCharge + tax + tip;
  const paid = input.paid ?? 0;
  assertMoney(paid);
  return {
    subtotal,
    discount,
    net,
    serviceCharge,
    tax,
    tip,
    total,
    paid,
    balance: Math.max(0, total - paid),
  };
}
