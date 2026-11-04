import { Inter, Playfair_Display } from "next/font/google";

/*
 * The two brand fonts, self-hosted by Next.js at build time (no requests to
 * Google at runtime). Both include Latin Extended and Cyrillic, so Uzbek
 * (oʻ, gʻ, ʼ) and Russian render in the brand fonts — not a fallback.
 *
 * To change a font: import it here, give it a `--ff-<key>` variable, add the
 * key to `FontKey` in config/types.ts, and pick it in config/themes.ts.
 */

const playfair = Playfair_Display({
  subsets: ["latin", "latin-ext", "cyrillic"],
  variable: "--ff-playfair-display",
  display: "swap",
  weight: "variable",
  style: ["normal", "italic"],
});

const inter = Inter({
  subsets: ["latin", "latin-ext", "cyrillic"],
  variable: "--ff-inter",
  display: "swap",
});

export const fontVariables = [playfair, inter].map((f) => f.variable).join(" ");
