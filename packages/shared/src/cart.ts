import { sum } from "./money";
import type { CartLine, MenuItem, ModifierGroup, ModifierSelection, Money } from "./types";

export type SelectionError =
  | { groupId: string; kind: "too-few"; min: number }
  | { groupId: string; kind: "too-many"; max: number }
  | { groupId: string; kind: "unknown-option"; optionId: string };

/** Default selection when the item sheet opens. */
export function defaultSelection(item: MenuItem): ModifierSelection {
  const selection: ModifierSelection = {};
  for (const group of item.modifierGroups) {
    const defaults = group.options.filter((o) => o.isDefault).map((o) => o.id);
    selection[group.id] = defaults.slice(0, group.maxSelect);
  }
  return selection;
}

export function validateSelection(item: MenuItem, selection: ModifierSelection): SelectionError[] {
  const errors: SelectionError[] = [];
  for (const group of item.modifierGroups) {
    const chosen = selection[group.id] ?? [];
    const valid = new Set(group.options.map((o) => o.id));
    for (const id of chosen) {
      if (!valid.has(id)) errors.push({ groupId: group.id, kind: "unknown-option", optionId: id });
    }
    const unique = new Set(chosen).size;
    if (unique < group.minSelect) {
      errors.push({ groupId: group.id, kind: "too-few", min: group.minSelect });
    }
    if (unique > group.maxSelect) {
      errors.push({ groupId: group.id, kind: "too-many", max: group.maxSelect });
    }
  }
  return errors;
}

/**
 * Toggle an option respecting the group rules. Single-choice groups behave
 * like radios; multi-choice groups ignore taps beyond `maxSelect`.
 */
export function toggleOption(group: ModifierGroup, current: string[], optionId: string): string[] {
  const isSelected = current.includes(optionId);
  if (group.maxSelect === 1) {
    if (isSelected) return group.minSelect >= 1 ? current : [];
    return [optionId];
  }
  if (isSelected) return current.filter((id) => id !== optionId);
  if (current.length >= group.maxSelect) return current;
  return [...current, optionId];
}

/** Base price + selected modifier prices, for one unit. */
export function unitPrice(item: MenuItem, selection: ModifierSelection): Money {
  let price = item.price;
  for (const group of item.modifierGroups) {
    for (const id of selection[group.id] ?? []) {
      const option = group.options.find((o) => o.id === id);
      if (option) price += option.priceDelta;
    }
  }
  return price;
}

export function lineTotal(item: MenuItem, line: Pick<CartLine, "quantity" | "selection">): Money {
  return unitPrice(item, line.selection) * line.quantity;
}

/** Names of the chosen options, e.g. ["Medium rare", "Extra cheese"]. */
export function selectionSummary(item: MenuItem, selection: ModifierSelection): string[] {
  const parts: string[] = [];
  for (const group of item.modifierGroups) {
    for (const id of selection[group.id] ?? []) {
      const option = group.options.find((o) => o.id === id);
      if (option) parts.push(option.name);
    }
  }
  return parts;
}

/** Two lines are "the same" when item, options, note and guest all match. */
export function lineSignature(line: Pick<CartLine, "itemId" | "selection" | "note" | "addedByGuestId">): string {
  const sel = Object.keys(line.selection)
    .sort()
    .map((g) => `${g}:${[...(line.selection[g] ?? [])].sort().join(",")}`)
    .join("|");
  return [line.itemId, sel, (line.note ?? "").trim().toLowerCase(), line.addedByGuestId].join("#");
}

export function cartSubtotal(lines: CartLine[], itemsById: Map<string, MenuItem>): Money {
  return sum(
    lines.map((l) => {
      const item = itemsById.get(l.itemId);
      return item ? lineTotal(item, l) : 0;
    }),
  );
}

export function cartCount(lines: Pick<CartLine, "quantity">[]): number {
  return lines.reduce((n, l) => n + l.quantity, 0);
}
