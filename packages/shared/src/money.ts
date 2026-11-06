import type { Money } from "./types";

/**
 * Integer-only money helpers. Amounts are minor units (cents); percentages are
 * converted to basis points (1 % = 100 bp) so no floating-point error can leak
 * into a bill.
 */

export function percentToBasisPoints(percent: number): number {
  if (!Number.isFinite(percent) || percent < 0) throw new RangeError(`Invalid percent: ${percent}`);
  return Math.round(percent * 100);
}

/** amount × percent, rounded half-up to the nearest minor unit. */
export function applyPercent(amount: Money, percent: number): Money {
  assertMoney(amount);
  const bp = percentToBasisPoints(percent);
  // amount * bp stays far below 2^53 for any realistic bill.
  return Math.floor((amount * bp + 5000) / 10000);
}

export function assertMoney(value: number): asserts value is Money {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`Money must be a non-negative integer (minor units), got ${value}`);
  }
}

export function sum(values: Money[]): Money {
  return values.reduce((a, b) => a + b, 0);
}

/**
 * Currencies whose minor unit exists on paper but is never used in practice,
 * so amounts are kept (and shown) as whole numbers. ISO 4217 lists UZS with
 * 2 decimals (tiyin), but prices and bills in Uzbekistan are whole so'm.
 */
const WHOLE_UNIT_CURRENCIES: Record<string, number> = { UZS: 0 };

/** Number of minor-unit digits for a currency, e.g. USD → 2, JPY → 0, UZS → 0. */
export function currencyDigits(currency: string): number {
  const override = WHOLE_UNIT_CURRENCIES[currency.toUpperCase()];
  if (override !== undefined) return override;
  return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

export function formatMoney(amount: Money, currency: string, locale: string): string {
  const digits = currencyDigits(currency);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount / 10 ** digits);
}

/** "12.5" → 1250 (for USD). Returns null for invalid input. */
export function parseMoney(input: string, currency: string): Money | null {
  const digits = currencyDigits(currency);
  const raw = input.trim().replace(/[^\d.,]/g, "");
  // Whole-unit currencies: "85,000" / "85.000" are thousands separators, not decimals.
  if (digits === 0 && /^\d{1,3}([.,]\d{3})+$/.test(raw)) return Number(raw.replace(/[.,]/g, ""));
  const cleaned = raw.replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const [whole = "0", frac = ""] = cleaned.split(".");
  if (frac.length > digits) return null;
  return Number(whole) * 10 ** digits + Number(frac.padEnd(digits, "0") || "0");
}
