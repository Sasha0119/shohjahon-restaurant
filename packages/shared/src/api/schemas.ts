import { z } from "zod";
import { RESERVATION_MAX_PARTY } from "../reservations";
import { ALLERGENS, DIETARY_TAGS } from "../types";

/**
 * Request validation shared by the API (Express) and the web app.
 * Every body / query the server accepts is parsed with one of these first.
 * Money is always integer minor units (cents).
 */

// ── primitives ───────────────────────────────────────────────────────────────
export const zId = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, "Invalid id");
/** Minor units of the brand currency (whole so'm for UZS). Fits the database's 32-bit columns. */
export const zCents = z.int().min(0).max(1_000_000_000);
export const zPositiveCents = z.int().min(1).max(1_000_000_000);
export const zQuantity = z.int().min(1).max(99);
export const zSlug = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and dashes");
export const zHhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");
export const zNote = z.string().trim().max(140);
export const zNickname = z.string().trim().max(24);
/** Client-generated idempotency key (sent as the `Idempotency-Key` header). */
export const zIdempotencyKey = z.string().min(16).max(128).regex(/^[A-Za-z0-9_-]+$/);
export const zDietaryTag = z.enum(DIETARY_TAGS);
export const zAllergen = z.enum(ALLERGENS);
export const zStation = z.enum(["kitchen", "bar"]);
export const zOrderStatus = z.enum(["received", "preparing", "ready", "served", "cancelled"]);
export const zCallType = z.enum(["water", "assistance", "bill"]);
export const zPaymentMethod = z.enum(["card", "applePay", "googlePay", "cash"]);
export const zSplitMode = z.enum(["full", "even", "items", "custom"]);
export const zStaffRole = z.enum(["manager", "waiter", "kitchen"]);
export const zPin = z.string().regex(/^\d{4,6}$/, "PIN must be 4–6 digits");
export const zPassword = z.string().min(10, "At least 10 characters").max(200);
export const zEmail = z.email().max(200).transform((e) => e.toLowerCase());
/** Menu photos: only bundled (/images/…) or uploaded (/uploads/…) files — never arbitrary URLs. */
export const zImagePath = z
  .string()
  .trim()
  .max(300)
  .regex(/^\/(images|uploads)\/[A-Za-z0-9._/-]+\.(jpe?g|png|webp|avif)$/i, "Upload a photo or use a bundled image")
  .refine((p) => !p.includes(".."), "Invalid path");

/** { [modifierGroupId]: optionId[] } — checked against the live menu by the server. */
export const zSelection = z
  .record(zId, z.array(zId).max(20))
  .refine((r) => Object.keys(r).length <= 20, "Too many option groups");

// ── guest: session ───────────────────────────────────────────────────────────
/**
 * Scanning a table QR. The guest's identity comes from the httpOnly guest
 * cookie (never from the body). The two flags are the guest's answers to the
 * "occupied table" and "you're at another table" questions.
 */
export const joinSessionBody = z.object({
  /** "This table already has an open order — join it?" → yes */
  confirmJoin: z.boolean().default(false),
  /** "You're seated at Table 5 — switch to Table 7?" → yes */
  confirmSwitch: z.boolean().default(false),
  /** "This table is reserved for 13:00 — continue?" → yes */
  confirmReserved: z.boolean().default(false),
});

/** Date and time are the restaurant's local time, so a guest abroad still books the right hour. */
export const createReservationBody = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  partySize: z.number().int().min(1).max(RESERVATION_MAX_PARTY),
  name: z.string().trim().min(2).max(60),
  phone: z
    .string()
    .trim()
    .max(24)
    .regex(/^[+\d\s()-]+$/)
    .refine((p) => {
      const digits = p.replace(/\D/g, "").length;
      return digits >= 7 && digits <= 15;
    }),
});

export const updateGuestBody = z.object({ nickname: zNickname });

// ── guest: cart ──────────────────────────────────────────────────────────────
export const addCartItemBody = z.object({
  itemId: zId,
  quantity: zQuantity,
  selection: zSelection.default({}),
  note: zNote.optional(),
});

export const updateCartItemBody = z
  .object({
    quantity: zQuantity.optional(),
    selection: zSelection.optional(),
    note: zNote.optional(),
  })
  .refine((b) => Object.keys(b).length > 0, "Nothing to update");

// ── guest: orders ────────────────────────────────────────────────────────────
export const submitOrderBody = z.object({
  /** Session version the guest saw; rejected with 409 if the cart changed since. */
  cartVersion: z.int().min(0),
});

// ── guest: call server ───────────────────────────────────────────────────────
export const createCallBody = z.object({ type: zCallType });

// ── guest: bill & payments ───────────────────────────────────────────────────
export const billQuery = z.object({
  tipPercent: z.coerce.number().min(0).max(100).optional(),
  tipCents: z.coerce.number().pipe(zCents).optional(),
});

export const applyDiscountBody = z.object({
  code: z.string().trim().min(2).max(32).transform((c) => c.toUpperCase()),
});

export const createPaymentBody = z
  .object({
    splitMode: zSplitMode,
    method: zPaymentMethod,
    /** Amount towards the balance (excludes tip). Server re-computes and checks it. */
    amountCents: zPositiveCents,
    tipCents: zCents.default(0),
    /** split=even: number of people. */
    people: z.int().min(2).max(20).optional(),
    /** split=items: order item ids this guest is paying for. */
    orderItemIds: z.array(zId).min(1).max(200).optional(),
  })
  .superRefine((b, ctx) => {
    if (b.splitMode === "even" && !b.people) {
      ctx.addIssue({ code: "custom", path: ["people"], message: "Required for an even split" });
    }
    if (b.splitMode === "items" && !b.orderItemIds) {
      ctx.addIssue({ code: "custom", path: ["orderItemIds"], message: "Required for an item split" });
    }
  });

export const emailReceiptBody = z.object({ email: zEmail });

// ── guest: review ────────────────────────────────────────────────────────────
export const createReviewBody = z.object({
  rating: z.int().min(1).max(5),
  comment: z.string().trim().max(1000).default(""),
});

// ── staff: auth ──────────────────────────────────────────────────────────────
export const passwordLoginBody = z.object({ email: zEmail, password: z.string().min(1).max(200) });
export const pinLoginBody = z.object({ staffId: zId, pin: zPin });

// ── kitchen & waiter ─────────────────────────────────────────────────────────
export const kdsQuery = z.object({
  station: zStation.optional(),
  status: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(",") : undefined))
    .pipe(z.array(zOrderStatus).optional()),
});
export const updateOrderStatusBody = z.object({ status: zOrderStatus });
export const updateStockBody = z.object({ inStock: z.boolean() });
export const confirmCashBody = z.object({ paymentId: zId });

// ── manager: menu ────────────────────────────────────────────────────────────
export const availabilityWindowInput = z
  .object({
    days: z.array(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])).max(7).default([]),
    from: zHhmm,
    to: zHhmm,
  })
  .refine((w) => w.from < w.to, { message: "'to' must be after 'from'", path: ["to"] });

/**
 * Optional texts in other languages: `{ en: { name: "Plov" }, ru: { name: "Плов" } }`.
 * Empty strings are dropped, so a cleared field falls back to the default language.
 */
function zTranslations<const F extends string>(fields: Record<F, number>) {
  const shape = Object.fromEntries(
    Object.entries(fields).map(([f, max]) => [f, z.string().trim().max(max as number).optional()]),
  ) as Record<F, z.ZodOptional<z.ZodString>>;
  return z
    .record(z.string().regex(/^[a-z]{2}$/, "Use a 2-letter language code"), z.object(shape).strict())
    .refine((r) => Object.keys(r).length <= 10, "Too many languages")
    .transform((r) =>
      Object.fromEntries(
        Object.entries(r)
          .map(([lang, t]) => [lang, Object.fromEntries(Object.entries(t as object).filter(([, v]) => v))])
          .filter(([, t]) => Object.keys(t as object).length > 0),
      ) as Record<string, Partial<Record<F, string>>>,
    )
    .default({});
}
export const zNameTranslations = zTranslations({ name: 80 });

export const categoryInput = z.object({
  slug: zSlug,
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(200).optional(),
  translations: zTranslations({ name: 60, description: 200 }),
  station: zStation,
  sortOrder: z.int().min(0).max(10_000).default(0),
  active: z.boolean().default(true),
  availability: z.array(availabilityWindowInput).max(10).default([]),
});

export const modifierOptionInput = z.object({
  id: zId.optional(),
  name: z.string().trim().min(1).max(80),
  translations: zNameTranslations,
  priceDeltaCents: zCents.default(0),
  isDefault: z.boolean().default(false),
  active: z.boolean().default(true),
});

export const modifierGroupInput = z
  .object({
    id: zId.optional(),
    name: z.string().trim().min(1).max(80),
    translations: zNameTranslations,
    minSelect: z.int().min(0).max(20),
    maxSelect: z.int().min(1).max(20),
    options: z.array(modifierOptionInput).min(1).max(30),
  })
  .refine((g) => g.minSelect <= g.maxSelect, { message: "min must be ≤ max", path: ["minSelect"] })
  .refine((g) => g.minSelect <= g.options.length, {
    message: "Not enough options for the minimum",
    path: ["minSelect"],
  })
  .refine((g) => g.options.filter((o) => o.isDefault).length <= g.maxSelect, {
    message: "Too many default options",
    path: ["options"],
  });

export const menuItemInput = z.object({
  slug: zSlug,
  categoryId: zId,
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(400).default(""),
  translations: zTranslations({ name: 80, description: 400, imageAlt: 200 }),
  priceCents: zCents,
  imageUrl: zImagePath,
  imageAlt: z.string().trim().max(200).default(""),
  tags: z.array(zDietaryTag).max(DIETARY_TAGS.length).default([]),
  allergens: z.array(zAllergen).max(ALLERGENS.length).default([]),
  calories: z.int().min(0).max(10_000).nullable().optional(),
  inStock: z.boolean().default(true),
  featured: z.boolean().default(false),
  sortOrder: z.int().min(0).max(10_000).default(0),
  /** Archived items are hidden from guests but kept for order history. */
  archived: z.boolean().default(false),
  modifierGroups: z.array(modifierGroupInput).max(10).default([]),
});

/** New display order: category ids in order, and/or item ids in order within one category. */
export const menuOrderInput = z
  .object({
    categoryIds: z.array(zId).min(1).max(100).optional(),
    items: z.object({ categoryId: zId, itemIds: z.array(zId).min(1).max(300) }).optional(),
  })
  .refine((b) => b.categoryIds || b.items, "Nothing to reorder")
  .refine((b) => !b.categoryIds || new Set(b.categoryIds).size === b.categoryIds.length, "Duplicate ids")
  .refine((b) => !b.items || new Set(b.items.itemIds).size === b.items.itemIds.length, "Duplicate ids");

export const upsellSuggestionInput = z
  .object({ itemId: zId, suggestItemId: zId })
  .refine((s) => s.itemId !== s.suggestItemId, "An item can't suggest itself");

export const comboDealInput = z.object({
  name: z.string().trim().min(1).max(60),
  translations: zNameTranslations,
  discountCents: zPositiveCents,
  itemIds: z.array(zId).min(2).max(6),
  active: z.boolean().default(true),
});

// ── manager: tables, staff, discounts ────────────────────────────────────────
export const tableInput = z.object({
  number: z.int().min(1).max(9999),
  label: z.string().trim().max(40).optional(),
  seats: z.int().min(1).max(50).default(4),
  active: z.boolean().default(true),
});

export const staffInput = z.discriminatedUnion("role", [
  z.object({ role: z.literal("manager"), name: z.string().trim().min(1).max(60), email: zEmail, password: zPassword }),
  z.object({ role: z.literal("waiter"), name: z.string().trim().min(1).max(60), pin: zPin }),
  z.object({ role: z.literal("kitchen"), name: z.string().trim().min(1).max(60), pin: zPin }),
]);
export const staffUpdateInput = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  active: z.boolean().optional(),
});
export const resetPinBody = z.object({ pin: zPin });
export const resetPasswordBody = z.object({ password: zPassword });

export const discountCodeInput = z
  .object({
    code: z
      .string()
      .trim()
      .min(3)
      .max(32)
      .regex(/^[A-Za-z0-9_-]+$/)
      .transform((c) => c.toUpperCase()),
    kind: z.enum(["percent", "fixed"]),
    /** percent: 1–100 (decimals allowed, e.g. 12.5); fixed: cents. */
    value: z.number().positive(),
    active: z.boolean().default(true),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    maxRedemptions: z.int().min(1).optional(),
    minSubtotalCents: zCents.optional(),
  })
  .refine((d) => d.kind !== "percent" || d.value <= 100, { message: "Max 100 %", path: ["value"] })
  .refine((d) => d.kind !== "fixed" || Number.isInteger(d.value), { message: "Cents must be whole", path: ["value"] })
  .refine((d) => !d.startsAt || !d.endsAt || d.startsAt < d.endsAt, { message: "End must be after start", path: ["endsAt"] });

// ── manager: reports ─────────────────────────────────────────────────────────
/** A calendar date in the restaurant's time zone. */
export const zLocalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

/**
 * Reports use local calendar dates (restaurant time zone), inclusive.
 * Defaults are applied by the server (last 30 days). Max range: 366 days.
 */
export const dateRangeQuery = z
  .object({ from: zLocalDate.optional(), to: zLocalDate.optional() })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: "'from' must be on or before 'to'", path: ["from"] });

export const ordersQuery = z
  .object({
    from: zLocalDate.optional(),
    to: zLocalDate.optional(),
    status: zOrderStatus.optional(),
    table: z.coerce.number().int().min(1).optional(),
    station: zStation.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(50),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: "'from' must be on or before 'to'", path: ["from"] });

export const auditQuery = z
  .object({
    from: zLocalDate.optional(),
    to: zLocalDate.optional(),
    /** Prefix, e.g. "payment." or "staff.login". */
    action: z.string().trim().max(60).regex(/^[a-z_.]*$/).optional(),
    entityType: z.string().trim().max(40).regex(/^[a-z_]*$/).optional(),
    page: z.coerce.number().int().min(1).default(1),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: "'from' must be on or before 'to'", path: ["from"] });

export const feedbackQuery = z.object({
  status: z.enum(["new", "handled"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export const updateFeedbackBody = z.object({ status: z.enum(["new", "handled"]) });

export const discountUpdateBody = z.object({ active: z.boolean() });

export type AddCartItemBody = z.infer<typeof addCartItemBody>;
export type CreatePaymentBody = z.infer<typeof createPaymentBody>;
export type MenuItemInput = z.infer<typeof menuItemInput>;
export type StaffInput = z.infer<typeof staffInput>;
export type DiscountCodeInput = z.infer<typeof discountCodeInput>;
