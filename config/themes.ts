import type { ThemePreset, ThemePresetId } from "./types";

/**
 * The signature look: dark first — deep charcoal, warm gold, soft ivory —
 * with a matching light mode. Every colour becomes a CSS variable
 * (see theme-css.ts), so changing a value here restyles the whole app.
 *
 * Contrast is checked by config/test/theme.test.ts (WCAG AA: text ≥ 4.5:1,
 * chart marks ≥ 3:1). Change a colour, run `npm test`.
 */
export const themePresets: Record<ThemePresetId, ThemePreset> = {
  signature: {
    id: "signature",
    label: "Signature",
    defaultMode: "dark",
    fonts: { display: "playfair-display", body: "inter" },
    radius: "1.25rem",
    dark: {
      primary: "#C9A45C", // warm gold
      primaryContrast: "#15110A",
      secondary: "#E7D6AE", // champagne
      secondaryContrast: "#1E1810",
      bg: "#0D0C0A", // near-black charcoal
      surface: "#16140F",
      surfaceMuted: "#211E18",
      text: "#F4EEE2", // soft ivory
      textMuted: "#ADA393",
      border: "#2E2A22",
      success: "#7CC79A",
      warning: "#E2B653",
      danger: "#EB7A6E",
      chart: "#B08A3A",
      heroTint: "rgba(8, 7, 5, 0.62)",
    },
    light: {
      primary: "#8A6424", // deep gold
      primaryContrast: "#FFFFFF",
      secondary: "#EBDDBB",
      secondaryContrast: "#2A2014",
      bg: "#F7F2E9", // ivory
      surface: "#FFFDF8",
      surfaceMuted: "#EFE7D8",
      text: "#1C1813",
      textMuted: "#6B5F4E",
      border: "#E3D8C5",
      success: "#2F7A4F",
      warning: "#9A5E10",
      danger: "#B42318",
      chart: "#A47A30",
      heroTint: "rgba(12, 9, 5, 0.55)",
    },
  },
};
