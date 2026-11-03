import type { BrandConfig } from "./types";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  BRAND SETTINGS — the only file you need to edit to rebrand the app.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  • Name, welcome line, logo and hero photo
 *  • Theme: switch `theme.preset` between "warm-bistro", "fresh-cafe", "modern-dark"
 *  • Money: currency, tax %, service charge %, tip options
 *  • Languages, Wi-Fi, review links, opening hours, contact details
 *
 *  Images live in apps/web/public/images — replace the files or point to new ones.
 */
export const brand: BrandConfig = {
  name: "Your Restaurant",

  welcomeLine: {
    en: "Seasonal plates, made to share. Order from your table whenever you're ready.",
  },

  // Placeholder monogram built from the name ("YR"). To use a real logo:
  // logo: { type: "image", src: "/images/logo.svg", alt: "Your Restaurant" },
  logo: { type: "monogram" },

  heroImage: {
    src: "/images/hero.jpg",
    alt: "A table set with plates of food in a warmly lit dining room",
  },

  theme: {
    preset: "warm-bistro", // "warm-bistro" | "fresh-cafe" | "modern-dark"
    mode: "system", // "system" (follows the phone) | "light" | "dark". Tip: use "dark" with modern-dark.
    // overrides: { light: { primary: "#0F766E" }, dark: { primary: "#5EEAD4" } },
    // fonts: { display: "fraunces", body: "inter" },
  },

  currency: { code: "USD", locale: "en-US" },
  taxPercent: 8,
  serviceChargePercent: 10,
  tipOptions: [0, 10, 15, 20],

  languages: ["en"],
  defaultLanguage: "en",

  wifi: {
    ssid: "YourRestaurant-Guest",
    password: "enjoy-your-meal",
    security: "WPA",
  },

  reviewLinks: [{ label: "Leave a public review", url: "https://example.com/review" }],

  timezone: "America/New_York",

  // Kitchen display: tickets turn amber, then red, after this many minutes.
  kitchen: { warnAfterMinutes: 10, lateAfterMinutes: 20 },

  openingHours: {
    mon: [{ open: "11:30", close: "22:00" }],
    tue: [{ open: "11:30", close: "22:00" }],
    wed: [{ open: "11:30", close: "22:00" }],
    thu: [{ open: "11:30", close: "23:00" }],
    fri: [{ open: "11:30", close: "00:30" }],
    sat: [{ open: "10:00", close: "00:30" }],
    sun: [{ open: "10:00", close: "21:00" }],
  },

  contact: {
    phone: "+1 555 0100",
    email: "hello@example.com",
    address: "123 Example Street, Your City",
    mapUrl: "https://example.com/map",
  },
};
