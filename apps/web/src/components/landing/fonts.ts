import { Piazzolla } from "next/font/google";

/*
 * The same headline font as the rest of the app (see app/fonts.ts), preloaded
 * here because the landing page opens on it at full-screen size.
 */
const display = Piazzolla({
  // Only preloads this subset. The others still load when the text needs them.
  subsets: ["latin"],
  variable: "--ff-piazzolla",
  display: "swap",
  weight: "variable",
  style: ["normal", "italic"],
  axes: ["opsz"],
});

export const landingFontVariables = display.variable;
