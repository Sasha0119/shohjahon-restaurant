import { DM_Serif_Display, Fraunces, Inter, Manrope, Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";

/*
 * Every font a theme preset can use. Fonts are self-hosted by Next.js at build
 * time (no requests to Google at runtime). `preload: false` because only the
 * active theme's two fonts are actually used — browsers download a font file
 * only when text uses it, so unused fonts cost nothing.
 *
 * To add a font: import it here, give it a `--ff-<key>` variable, add the key
 * to `FontKey` in config/types.ts, and include it in `fontVariables`.
 */

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--ff-fraunces",
  display: "swap",
  preload: false,
  axes: ["opsz", "SOFT"],
});
const inter = Inter({ subsets: ["latin"], variable: "--ff-inter", display: "swap", preload: false });
const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  variable: "--ff-dm-serif-display",
  display: "swap",
  preload: false,
});
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--ff-plus-jakarta-sans",
  display: "swap",
  preload: false,
});
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--ff-space-grotesk",
  display: "swap",
  preload: false,
});
const manrope = Manrope({ subsets: ["latin"], variable: "--ff-manrope", display: "swap", preload: false });

export const fontVariables = [fraunces, inter, dmSerif, jakarta, spaceGrotesk, manrope]
  .map((f) => f.variable)
  .join(" ");
