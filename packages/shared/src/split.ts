import { assertMoney, sum } from "./money";
import type { Money } from "./types";

/**
 * Bill-splitting helpers. Every function returns shares that add up to the
 * input amount exactly — no cent is ever lost or invented.
 */

/** Split `amount` into `people` shares; leftover cents go to the first shares. */
export function splitEvenly(amount: Money, people: number): Money[] {
  assertMoney(amount);
  if (!Number.isInteger(people) || people < 1) throw new RangeError("people must be >= 1");
  const base = Math.floor(amount / people);
  const remainder = amount - base * people;
  return Array.from({ length: people }, (_, i) => base + (i < remainder ? 1 : 0));
}

/**
 * Allocate `amount` in proportion to `weights` using the largest-remainder
 * method. Ties go to the earlier index. All-zero weights → split evenly.
 */
export function allocateProportionally(amount: Money, weights: number[]): Money[] {
  assertMoney(amount);
  if (weights.length === 0) return [];
  if (weights.some((w) => !Number.isFinite(w) || w < 0)) throw new RangeError("Invalid weight");
  const totalWeight = sum(weights);
  if (totalWeight === 0) return splitEvenly(amount, weights.length);

  const exact = weights.map((w) => (amount * w) / totalWeight);
  const floors = exact.map(Math.floor);
  let leftover = amount - sum(floors);
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (leftover <= 0) break;
    floors[i]! += 1;
    leftover -= 1;
  }
  return floors;
}

/**
 * "Pay for my items": the guest's share of the whole bill, given the subtotal
 * of the items they picked. Discount, service, tax and tip are shared in
 * proportion to item value.
 *
 * @param total             the bill total (net + service + tax + tip)
 * @param subtotal          the bill subtotal before discount
 * @param selectedSubtotal  subtotal of the items this guest pays for
 */
export function shareForItems(total: Money, subtotal: Money, selectedSubtotal: Money): Money {
  assertMoney(total);
  assertMoney(subtotal);
  assertMoney(selectedSubtotal);
  if (selectedSubtotal > subtotal) throw new RangeError("selectedSubtotal exceeds subtotal");
  if (selectedSubtotal === 0) return 0;
  if (selectedSubtotal === subtotal) return total;
  const [mine] = allocateProportionally(total, [selectedSubtotal, subtotal - selectedSubtotal]);
  return mine!;
}

/** A custom amount, clamped to what is still owed. */
export function clampCustomAmount(amount: Money, balance: Money): Money {
  assertMoney(balance);
  if (!Number.isSafeInteger(amount) || amount < 0) return 0;
  return Math.min(amount, balance);
}
