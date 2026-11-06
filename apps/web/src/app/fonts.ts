import { IBM_Plex_Mono, Onest, Piazzolla } from "next/font/google";

/*
 * The brand fonts, self-hosted by Next.js at build time (no requests to Google
 * at runtime). All three were checked glyph by glyph for oʻ, gʻ, Russian and
 * Uzbek Cyrillic: see docs/art-direction.md.
 *
 *   Piazzolla      headings
 *   Onest          everything you read in the app
 *   IBM Plex Mono  small labels
 *
 * Not preloaded: each visitor only needs one alphabet, and preloading every
 * subset slowed every page on phones. The browser fetches just the files the
 * page's text uses, and sized fallbacks keep the text from jumping when they
 * arrive. The landing page preloads its headline font itself.
 *
 * To change a font: import it here, give it a `--ff-<key>` variable, add the
 * key to `FontKey` in config/types.ts, and pick it in config/brand.ts.
 */

const piazzolla = Piazzolla({
  subsets: ["latin", "latin-ext", "cyrillic"],
  variable: "--ff-piazzolla",
  display: "swap",
  preload: false,
  weight: "variable",
  style: ["normal", "italic"],
  axes: ["opsz"],
});

const onest = Onest({
  subsets: ["latin", "latin-ext", "cyrillic"],
  variable: "--ff-onest",
  display: "swap",
  preload: false,
  weight: "variable",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin", "latin-ext", "cyrillic"],
  variable: "--ff-ibm-plex-mono",
  display: "swap",
  preload: false,
  weight: ["400", "500"],
});

export const fontVariables = [piazzolla, onest, plexMono].map((f) => f.variable).join(" ");
