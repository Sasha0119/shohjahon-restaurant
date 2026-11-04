export { brand } from "./brand";
export { themePresets } from "./themes";
export {
  resolveTheme,
  buildThemeCss,
  buildThemeBootScript,
  fontVar,
  type ResolvedTheme,
} from "./theme-css";
export * from "./types";

import type { BrandConfig, LocaleCode, LocalizedText } from "./types";

/** The letter(s) in the logo circle: "Shohjahon" → "S", "Your Restaurant" → "YR". */
export function monogramFor(brand: Pick<BrandConfig, "name" | "logo">): string {
  if (brand.logo.type === "wordmark") return (brand.logo.monogram ?? (brand.name.trim().charAt(0) || "•")).slice(0, 2);
  if (brand.logo.type === "monogram" && brand.logo.text) return brand.logo.text.slice(0, 3);
  const words = brand.name
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  if (words.length === 0) return "•";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

/** Pick the text for a locale, falling back to the brand's default language, then English. */
export function localize(text: LocalizedText, locale: LocaleCode, fallback?: LocaleCode): string {
  return text[locale] ?? (fallback ? text[fallback] : undefined) ?? text.en;
}
