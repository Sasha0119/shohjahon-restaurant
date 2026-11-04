import type { BrandConfig } from "./types";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  BRAND SETTINGS — the only file you need to edit to rebrand the app.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  • Name, tagline, cuisine, logo and hero photo (all texts in uz / en / ru)
 *  • Theme colours live in config/themes.ts (one signature theme, dark + light)
 *  • Money: currency, tax %, service charge %, tip options
 *  • Languages, Wi-Fi, review links, opening hours, contact details
 *
 *  Opening hours, contact details and Wi-Fi below are DEMO values.
 *  Images live in apps/web/public/images — replace the files or point to new ones.
 */
export const brand: BrandConfig = {
  name: "Shohjahon",

  tagline: {
    uz: "Anʼanalar taʼmi, mehr bilan",
    en: "Taste of tradition, served with care",
    ru: "Вкус традиций, поданный с заботой",
  },

  welcomeLine: {
    uz: "Zamonaviy oʻzbek oshxonasi Yevropa uslubida. Stolingizdan buyurtma bering — biz qolganini bajaramiz.",
    en: "Modern Uzbek cooking with European touches. Order from your table whenever you're ready.",
    ru: "Современная узбекская кухня с европейскими нотками. Заказывайте прямо со своего стола.",
  },

  cuisine: {
    uz: "Zamonaviy oʻzbek oshxonasi",
    en: "Modern Uzbek cuisine",
    ru: "Современная узбекская кухня",
  },

  // A letter in a thin gold circle + the name in the display serif.
  logo: { type: "wordmark", monogram: "S" },

  heroImage: {
    src: "/images/hero-plov.jpg",
    alt: "Plov and soups in brass bowls on a dark table",
  },

  theme: {
    preset: "signature",
    mode: "dark", // "dark" (signature) | "light" | "system" (follows the phone). Guests can switch.
  },

  // So'm are shown as whole numbers ("85 000 soʻm"); tiyin are not used.
  currency: {
    code: "UZS",
    locale: "uz-Latn-UZ",
    symbol: { uz: "soʻm", en: "soʻm", ru: "сум" },
  },
  // Menu prices already include VAT, so no tax line is added on the bill.
  taxPercent: 0,
  serviceChargePercent: 10,
  tipOptions: [0, 5, 10, 15],

  languages: ["uz", "en", "ru"],
  defaultLanguage: "uz",

  wifi: {
    ssid: "Shohjahon-Guest",
    password: "osh-va-choy-2026",
    security: "WPA",
  },

  reviewLinks: [
    {
      label: { uz: "Google’da sharh qoldirish", en: "Review us on Google", ru: "Оставить отзыв в Google" },
      url: "https://example.com/review",
    },
  ],

  timezone: "Asia/Tashkent",

  // Kitchen display: tickets turn amber, then red, after this many minutes.
  kitchen: { warnAfterMinutes: 12, lateAfterMinutes: 25 },

  openingHours: {
    mon: [{ open: "11:00", close: "23:00" }],
    tue: [{ open: "11:00", close: "23:00" }],
    wed: [{ open: "11:00", close: "23:00" }],
    thu: [{ open: "11:00", close: "23:00" }],
    fri: [{ open: "11:00", close: "00:30" }],
    sat: [{ open: "10:00", close: "00:30" }],
    sun: [{ open: "10:00", close: "23:00" }],
  },

  contact: {
    phone: "+998 71 000 00 00",
    email: "hello@shohjahon.example",
    address: "Amir Temur shoh koʻchasi, 1 · Toshkent",
    mapUrl: "https://maps.google.com/?q=Amir+Temur+Square+Tashkent",
  },
};
