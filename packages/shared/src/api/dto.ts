/**
 * Shapes the API sends to clients (REST responses and Socket.io payloads).
 * Wire format uses lowercase enum values ("received", "kitchen", …) and cents.
 */
import type { Allergen, DietaryTag, ModifierSelection, Money, OrderStatus, Station, TextTranslations } from "../types";

export type CallTypeDTO = "water" | "assistance" | "bill" | "cashPayment";
export type PaymentMethodDTO = "card" | "applePay" | "googlePay" | "cash";
export type PaymentStatusDTO = "pending" | "succeeded" | "failed" | "cancelled";
export type SessionCloseReasonDTO = "paid" | "staff" | "expired";
export type TableStatusDTO = "free" | "seated" | "ordered" | "billRequested";

export interface GuestDTO {
  id: string;
  nickname: string;
}

export interface CartLineDTO {
  id: string;
  itemId: string;
  quantity: number;
  selection: ModifierSelection;
  note: string | null;
  guestId: string;
  addedBy: string;
  unitPriceCents: Money;
  updatedAt: string;
}

export interface OrderLineDTO {
  id: string;
  itemId: string;
  name: string;
  quantity: number;
  unitPriceCents: Money;
  modifiers: { group: string; option: string; priceDeltaCents: Money }[];
  note: string | null;
  addedBy: string;
}

/** One kitchen/bar ticket. Guests see the tickets of a round grouped together. */
export interface OrderTicketDTO {
  id: string;
  round: number;
  station: Station;
  status: OrderStatus;
  createdAt: string;
  statusChangedAt: string;
  tableNumber: number;
  lines: OrderLineDTO[];
}

export interface BillDTO {
  subtotalCents: Money;
  comboDiscountCents: Money;
  codeDiscountCents: Money;
  discountCode: string | null;
  serviceChargeCents: Money;
  taxCents: Money;
  totalCents: Money;
  /** Paid and confirmed (excludes tips). */
  paidCents: Money;
  tipsPaidCents: Money;
  /** total − paid */
  balanceCents: Money;
  /** Payments started but not confirmed yet (e.g. cash on its way). */
  pendingCents: Money;
  /** What can still be paid right now: balance − pending. */
  outstandingCents: Money;
  /** Order lines already paid (or being paid) through "split by item". */
  claimedOrderItemIds: string[];
}

export interface PaymentDTO {
  id: string;
  status: PaymentStatusDTO;
  method: PaymentMethodDTO;
  amountCents: Money;
  tipCents: Money;
  receiptToken: string | null;
  failureReason: string | null;
}

export interface CallDTO {
  id: string;
  type: CallTypeDTO;
  /** For cash payments: the payment the waiter confirms. */
  paymentId?: string | null;
  sessionId?: string;
  status: "open" | "handled";
  tableNumber: number;
  createdAt: string;
  amountCents: Money | null;
}

export interface SessionSnapshotDTO {
  sessionId: string;
  version: number;
  table: { id: string; number: number; label: string | null };
  me: GuestDTO;
  guests: GuestDTO[];
  cart: CartLineDTO[];
  orders: OrderTicketDTO[];
  calls: CallDTO[];
  bill: BillDTO;
  status: "open" | "closed";
  closeReason: SessionCloseReasonDTO | null;
}

/** Digital receipt (GET /api/receipts/:publicToken). Frozen at payment time. */
export interface ReceiptDTO {
  number: number;
  issuedAt: string;
  tableNumber: number;
  lines: { name: string; quantity: number; unitPriceCents: Money; options: string[] }[];
  bill: {
    subtotalCents: Money;
    comboDiscountCents: Money;
    codeDiscountCents: Money;
    discountCode: string | null;
    serviceChargeCents: Money;
    taxCents: Money;
    totalCents: Money;
  };
  payment: {
    method: PaymentMethodDTO;
    splitMode: "full" | "even" | "items" | "custom";
    amountCents: Money;
    tipCents: Money;
    chargedCents: Money;
  };
  /** Paid in total after this payment, and what is left for the table. */
  paidToDateCents: Money;
  balanceAfterCents: Money;
  emailedTo: string | null;
}

/** Public menu, as served by GET /api/menu. */
export interface MenuDTO {
  version: string;
  categories: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    translations: TextTranslations<"name" | "description">;
    station: Station;
    sortOrder: number;
  }[];
  items: {
    id: string;
    slug: string;
    categoryId: string;
    name: string;
    description: string;
    translations: TextTranslations<"name" | "description" | "imageAlt">;
    priceCents: Money;
    imageUrl: string;
    imageAlt: string;
    tags: DietaryTag[];
    allergens: Allergen[];
    calories: number | null;
    inStock: boolean;
    /** Bumped on every stock change; the higher one is the newer state (see "menu:stock"). */
    stockVersion: number;
    featured: boolean;
    modifierGroups: {
      id: string;
      name: string;
      translations: TextTranslations<"name">;
      minSelect: number;
      maxSelect: number;
      options: { id: string; name: string; translations: TextTranslations<"name">; priceDeltaCents: Money; isDefault: boolean }[];
    }[];
  }[];
  suggestions: { itemId: string; suggestItemId: string }[];
  combos: { id: string; name: string; translations: TextTranslations<"name">; discountCents: Money; itemIds: string[] }[];
}

/** The full menu as the manager edits it (GET /api/admin/menu) — includes inactive and archived entries. */
export interface AdminMenuDTO {
  categories: (MenuDTO["categories"][number] & {
    active: boolean;
    availability: { days: ("mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun")[]; from: string; to: string }[];
    itemCount: number;
  })[];
  items: (Omit<MenuDTO["items"][number], "modifierGroups"> & {
    archived: boolean;
    sortOrder: number;
    modifierGroups: {
      id: string;
      name: string;
      translations: TextTranslations<"name">;
      minSelect: number;
      maxSelect: number;
      options: {
        id: string;
        name: string;
        translations: TextTranslations<"name">;
        priceDeltaCents: Money;
        isDefault: boolean;
        active: boolean;
      }[];
    }[];
  })[];
  suggestions: { id: string; itemId: string; suggestItemId: string }[];
  combos: { id: string; name: string; translations: TextTranslations<"name">; discountCents: Money; itemIds: string[]; active: boolean }[];
}

export interface AnalyticsKpisDTO {
  /** Paid by guests, excluding tips. */
  revenueCents: Money;
  tipsCents: Money;
  /** Rounds sent to the kitchen (not cancelled). */
  orders: number;
  itemsSold: number;
  /** Phones that joined a table. */
  guests: number;
  /** Average paid per visit (visits with at least one payment). */
  avgBillCents: Money;
  paidVisits: number;
  avgRating: number | null;
  ratingCount: number;
}

/** GET /api/admin/analytics */
export interface AnalyticsDTO {
  range: { from: string; to: string; days: number; timezone: string };
  kpis: AnalyticsKpisDTO;
  /** Same metrics for the equally long period just before. */
  previous: AnalyticsKpisDTO;
  salesByDay: { date: string; revenueCents: Money; orders: number }[];
  topItems: { itemId: string; name: string; quantity: number; revenueCents: Money }[];
  /** Rounds per weekday (0 = Monday … 6 = Sunday) × hour (0–23), restaurant time. */
  busiestHours: number[][];
  ratings: { average: number | null; count: number; distribution: [number, number, number, number, number] };
}

/** One kitchen/bar ticket in the order history. */
export interface AdminOrderDTO {
  id: string;
  createdAt: string;
  tableNumber: number;
  round: number;
  station: Station;
  status: OrderStatus;
  itemCount: number;
  totalCents: Money;
  lines: { name: string; quantity: number; unitPriceCents: Money; options: string[]; note: string | null }[];
}

export interface AuditEntryDTO {
  id: string;
  createdAt: string;
  actor: { type: "staff" | "guest" | "system"; name: string | null };
  action: string;
  entityType: string;
  entityId: string;
  data: unknown;
  ip: string | null;
}

/** Private feedback (1–3 stars) in the manager's log. */
export interface FeedbackDTO {
  id: string;
  rating: number;
  comment: string;
  status: "new" | "handled";
  tableNumber: number;
  guestName: string;
  createdAt: string;
  handledAt: string | null;
  handledBy: string | null;
}

/** A table as the manager sees it (GET /api/admin/tables). */
export interface AdminTableDTO {
  id: string;
  number: number;
  label: string | null;
  seats: number;
  active: boolean;
  status: TableStatusDTO;
  /** Signed guest link encoded in the printed QR code. */
  url: string;
  session: { id: string; guestCount: number; openedAt: string; lastActivityAt: string } | null;
}

/** Standard error body for every non-2xx response. */
export interface ApiErrorDTO {
  error: {
    /** Stable, machine-readable, e.g. "CART_CHANGED", "SESSION_CLOSED", "OUT_OF_STOCK". */
    code: string;
    message: string;
    details?: unknown;
  };
}
