/**
 * Database enums are UPPER_SNAKE (GLUTEN_FREE, APPLE_PAY); the JSON wire
 * format is lowercase kebab ("gluten-free") or camelCase ("applePay").
 * These helpers convert both ways with full type safety.
 */
import type {
  Allergen as DbAllergen,
  CallType as DbCallType,
  DietaryTag as DbDietaryTag,
  OrderStatus as DbOrderStatus,
  PaymentMethod as DbPaymentMethod,
  PaymentStatus as DbPaymentStatus,
  SplitMode as DbSplitMode,
  StaffRole as DbStaffRole,
  Station as DbStation,
} from "../generated/prisma/enums.ts";
import type { Allergen, DietaryTag, OrderStatus, Station } from "@app/shared";

/** "gluten-free" | "applePay" | "kitchen" → "GLUTEN_FREE" | "APPLE_PAY" | "KITCHEN" */
export function toDbEnum<T extends string>(value: string): T {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/-/g, "_")
    .toUpperCase() as T;
}

/** "GLUTEN_FREE" → "gluten-free" */
export function fromDbKebab<T extends string>(value: string): T {
  return value.toLowerCase().replace(/_/g, "-") as T;
}

/** "APPLE_PAY" → "applePay" */
export function fromDbCamel<T extends string>(value: string): T {
  return value.toLowerCase().replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()) as T;
}

export const enums = {
  tag: { toDb: (v: DietaryTag) => toDbEnum<DbDietaryTag>(v), fromDb: (v: DbDietaryTag) => fromDbKebab<DietaryTag>(v) },
  allergen: { toDb: (v: Allergen) => toDbEnum<DbAllergen>(v), fromDb: (v: DbAllergen) => fromDbKebab<Allergen>(v) },
  station: { toDb: (v: Station) => toDbEnum<DbStation>(v), fromDb: (v: DbStation) => fromDbKebab<Station>(v) },
  orderStatus: {
    toDb: (v: OrderStatus) => toDbEnum<DbOrderStatus>(v),
    fromDb: (v: DbOrderStatus) => fromDbKebab<OrderStatus>(v),
  },
  role: {
    toDb: (v: "manager" | "waiter" | "kitchen") => toDbEnum<DbStaffRole>(v),
    fromDb: (v: DbStaffRole) => fromDbKebab<"manager" | "waiter" | "kitchen">(v),
  },
  callType: {
    toDb: (v: "water" | "assistance" | "bill" | "cashPayment") => toDbEnum<DbCallType>(v),
    fromDb: (v: DbCallType) => fromDbCamel<"water" | "assistance" | "bill" | "cashPayment">(v),
  },
  paymentMethod: {
    toDb: (v: "card" | "applePay" | "googlePay" | "cash") => toDbEnum<DbPaymentMethod>(v),
    fromDb: (v: DbPaymentMethod) => fromDbCamel<"card" | "applePay" | "googlePay" | "cash">(v),
  },
  paymentStatus: {
    fromDb: (v: DbPaymentStatus) => fromDbKebab<"pending" | "succeeded" | "failed" | "cancelled">(v),
  },
  splitMode: {
    toDb: (v: "full" | "even" | "items" | "custom") => toDbEnum<DbSplitMode>(v),
    fromDb: (v: DbSplitMode) => fromDbKebab<"full" | "even" | "items" | "custom">(v),
  },
};
