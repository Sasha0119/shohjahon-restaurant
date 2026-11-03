/**
 * Domain types shared by the web app and (from Phase 2) the API.
 * All money values are integers in the currency's minor unit (e.g. cents).
 */

export type Money = number;

export const DIETARY_TAGS = ["vegan", "vegetarian", "gluten-free", "halal", "spicy"] as const;
export type DietaryTag = (typeof DIETARY_TAGS)[number];

/** The 14 major allergens (EU / UK list), which also covers the US "big 9". */
export const ALLERGENS = [
  "gluten",
  "crustaceans",
  "eggs",
  "fish",
  "peanuts",
  "soy",
  "milk",
  "tree-nuts",
  "celery",
  "mustard",
  "sesame",
  "sulphites",
  "lupin",
  "molluscs",
] as const;
export type Allergen = (typeof ALLERGENS)[number];

export type Station = "kitchen" | "bar";

export interface ModifierOption {
  id: string;
  name: string;
  /** Extra price added per unit when selected. */
  priceDelta: Money;
  /** Pre-selected when the item sheet opens. */
  isDefault?: boolean;
}

export interface ModifierGroup {
  id: string;
  name: string;
  /** min >= 1 means the guest must choose. */
  minSelect: number;
  /** 1 = single choice (radio), > 1 = multi choice (checkbox). */
  maxSelect: number;
  options: ModifierOption[];
}

export interface MenuItem {
  id: string;
  slug: string;
  categoryId: string;
  name: string;
  description: string;
  price: Money;
  image: string;
  imageAlt: string;
  tags: DietaryTag[];
  allergens: Allergen[];
  modifierGroups: ModifierGroup[];
  inStock: boolean;
  /** Shown in "Chef's picks" on the home screen. */
  featured?: boolean;
  /** Approximate kcal, optional. */
  calories?: number;
}

/** Optional time window for time-based menus (e.g. breakfast). Local "HH:MM". */
export interface AvailabilityWindow {
  days?: ("mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun")[];
  from: string;
  to: string;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  description?: string;
  station: Station;
  sortOrder: number;
  availability?: AvailabilityWindow[];
}

export type UpsellRule =
  | { id: string; kind: "suggest"; itemId: string; suggestItemId: string; message?: string }
  | {
      id: string;
      kind: "combo";
      name: string;
      itemIds: string[];
      /** Fixed discount when every item in the combo is ordered together. */
      discount: Money;
    };

export interface Menu {
  categories: Category[];
  items: MenuItem[];
  upsells: UpsellRule[];
}

/** groupId → selected option ids */
export type ModifierSelection = Record<string, string[]>;

export interface CartLine {
  id: string;
  itemId: string;
  quantity: number;
  selection: ModifierSelection;
  note?: string;
  /** Nickname of the guest who added it ("" = anonymous). */
  addedBy: string;
  addedByGuestId: string;
  addedAt: number;
}

export type OrderStatus = "received" | "preparing" | "ready" | "served" | "cancelled";
