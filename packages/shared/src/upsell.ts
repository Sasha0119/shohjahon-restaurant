import type { MenuItem, Money, UpsellRule } from "./types";

/** Items suggested on an item's detail sheet ("Goes well with"). */
export function suggestionsForItem(
  itemId: string,
  rules: UpsellRule[],
  itemsById: Map<string, MenuItem>,
  limit = 3,
): MenuItem[] {
  const out: MenuItem[] = [];
  for (const rule of rules) {
    if (rule.kind !== "suggest" || rule.itemId !== itemId) continue;
    const item = itemsById.get(rule.suggestItemId);
    if (item && item.inStock && !out.includes(item)) out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Suggestions shown before sending the order ("Complete your meal"): items
 * suggested by anything in the cart, minus what's already in it.
 */
export function suggestionsForCart(
  cartItemIds: string[],
  rules: UpsellRule[],
  itemsById: Map<string, MenuItem>,
  limit = 4,
): MenuItem[] {
  const inCart = new Set(cartItemIds);
  const out: MenuItem[] = [];
  for (const id of cartItemIds) {
    for (const item of suggestionsForItem(id, rules, itemsById, Infinity)) {
      if (!inCart.has(item.id) && !out.includes(item)) out.push(item);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export interface AppliedCombo {
  comboId: string;
  name: string;
  times: number;
  discount: Money;
}

/**
 * Which combo deals the ordered items qualify for, and the total saving.
 * Each unit of an item counts towards at most one combo; combos are applied
 * in rule order.
 */
export function applyCombos(
  quantities: Map<string, number>,
  rules: UpsellRule[],
): { combos: AppliedCombo[]; discount: Money } {
  const left = new Map(quantities);
  const combos: AppliedCombo[] = [];
  for (const rule of rules) {
    if (rule.kind !== "combo" || rule.itemIds.length === 0) continue;
    const times = Math.min(...rule.itemIds.map((id) => left.get(id) ?? 0));
    if (times <= 0) continue;
    rule.itemIds.forEach((id) => left.set(id, (left.get(id) ?? 0) - times));
    combos.push({ comboId: rule.id, name: rule.name, times, discount: rule.discount * times });
  }
  return { combos, discount: combos.reduce((n, c) => n + c.discount, 0) };
}

/** Combo deals the given item is part of. */
export function combosForItem(itemId: string, rules: UpsellRule[]) {
  return rules.filter(
    (r): r is Extract<UpsellRule, { kind: "combo" }> => r.kind === "combo" && r.itemIds.includes(itemId),
  );
}
