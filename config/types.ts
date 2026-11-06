/**
 * Types for the brand configuration. You normally don't edit this file —
 * edit `brand.ts` instead.
 */

/** Fonts the web app knows how to load (see apps/web/src/app/fonts.ts). */
export type FontKey = "playfair-display" | "inter" | "piazzolla" | "onest";

export type ThemeMode = "light" | "dark";
export type ThemeModeSetting = ThemeMode | "system";

/** Every colour the UI uses. Values are any valid CSS colour. */
export interface Palette {
  /** Main brand colour: buttons, active chips, highlights. */
  primary: string;
  /** Text/icon colour placed on top of `primary`. */
  primaryContrast: string;
  /** Accent colour: badges, small highlights. */
  secondary: string;
  /** Text/icon colour placed on top of `secondary`. */
  secondaryContrast: string;
  /** Page background. */
  bg: string;
  /** Cards, sheets, bars. */
  surface: string;
  /** Subtle fills: inputs, skeletons, inactive chips. */
  surfaceMuted: string;
  /** Main text. */
  text: string;
  /** Secondary text. Must keep >= 4.5:1 contrast on `bg` and `surface`. */
  textMuted: string;
  border: string;
  success: string;
  warning: string;
  danger: string;
  /** Single-series chart marks (bars, heat-map cells). Keep >= 3:1 on `surface`. */
  chart: string;
  /** Tint mixed into the hero gradient overlay (use an rgba value). */
  heroTint: string;
}

export interface ThemePreset {
  id: ThemePresetId;
  label: string;
  /** Mode used when the brand sets `mode: "system"` and the device has no preference. */
  defaultMode: ThemeMode;
  fonts: { display: FontKey; body: FontKey };
  /** Base corner radius for cards and sheets. */
  radius: string;
  light: Palette;
  dark: Palette;
}

export type ThemePresetId = "signature";

/**
 * A piece of brand text in every language, e.g. `{ uz: "Salom", en: "Hello", ru: "Привет" }`.
 * English is required as the last-resort fallback.
 */
export type LocalizedText = Partial<Record<LocaleCode, string>> & { en: string };

/** Add a code here when you add a translation file in apps/web/src/i18n. */
export type LocaleCode = "uz" | "en" | "ru";

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

/** "HH:MM", 24-hour clock. A close time earlier than open means "past midnight". */
export interface OpeningSlot {
  open: string;
  close: string;
}

export type OpeningHours = Record<Weekday, OpeningSlot[]>;

export type BrandLogo =
  /** A letter in a thin circle, next to the name set in the display font. */
  | { type: "wordmark"; /** The letter(s) inside the circle. Defaults to the first letter of `name`. */ monogram?: string }
  | { type: "monogram"; /** Defaults to the initials of `name`. */ text?: string }
  | { type: "image"; src: string; alt: string };

export interface BrandConfig {
  name: string;
  /** One short line under the logo, e.g. "Taste of tradition, served with care". */
  tagline: LocalizedText;
  /** Longer welcome line (hero subtitle, link previews). */
  welcomeLine: LocalizedText;
  /** What kind of food, e.g. "Modern Uzbek cuisine". */
  cuisine: LocalizedText;
  logo: BrandLogo;
  heroImage: { src: string; alt: string };
  theme: {
    preset: ThemePresetId;
    /** "system" follows the guest's device setting. */
    mode: ThemeModeSetting;
    /** Optional per-colour overrides on top of the preset. */
    overrides?: { light?: Partial<Palette>; dark?: Partial<Palette> };
    /** Optional font override on top of the preset. */
    fonts?: Partial<{ display: FontKey; body: FontKey }>;
  };
  currency: {
    /** ISO 4217 code, e.g. "USD", "EUR", "GBP". */
    code: string;
    /** BCP 47 locale used for number formatting when no UI language applies (e.g. CSV, emails). */
    locale: string;
    /**
     * Optional currency word per language, written after the amount: "85 000 soʻm".
     * Leave out to use the standard symbol for the currency ("$12.50", "12,50 €").
     */
    symbol?: LocalizedText;
  };
  /** Percent, e.g. 8.875 for 8.875 %. Applied to the subtotal after discounts. */
  taxPercent: number;
  /** Percent, applied to the subtotal after discounts. 0 disables it. */
  serviceChargePercent: number;
  /** Tip percentages offered on the bill. Include 0 for "no tip". */
  tipOptions: number[];
  languages: LocaleCode[];
  defaultLanguage: LocaleCode;
  wifi: {
    ssid: string;
    password: string;
    /** Use "nopass" for open networks. */
    security: "WPA" | "WEP" | "nopass";
    hidden?: boolean;
  };
  /** External review pages shown after a 4–5 star rating. */
  reviewLinks: { label: LocalizedText; url: string }[];
  openingHours: OpeningHours;
  /**
   * IANA time zone of the restaurant, e.g. "America/New_York", "Europe/Berlin".
   * Used for opening hours and time-based menus (servers usually run in UTC).
   */
  timezone: string;
  /** Kitchen display colour warnings, in minutes since the ticket arrived. */
  kitchen: { warnAfterMinutes: number; lateAfterMinutes: number };
  contact: {
    phone?: string;
    email?: string;
    address?: string;
    mapUrl?: string;
    website?: string;
  };
}
