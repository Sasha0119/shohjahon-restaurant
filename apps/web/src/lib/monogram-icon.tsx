import { readFile } from "node:fs/promises";
import path from "node:path";
import { brand, monogramFor, resolveTheme } from "@app/config";
import { ImageResponse } from "next/og";

/*
 * PNG app icons (favicon, Apple touch icon, PWA) drawn from the brand mark:
 * the monogram letter in Playfair Display inside a thin gold circle, on the
 * dark signature background. Generated at build time.
 *
 * The font file is bundled (src/assets/fonts, SIL Open Font License) because
 * the icon renderer can't use web fonts.
 */
// A static weight (the renderer can't read variable fonts), from Fontsource.
const FONT_FILE = path.join(process.cwd(), "src", "assets", "fonts", "PlayfairDisplay-Latin-500.woff");

export async function renderMonogramIcon(px: number, opts: { maskable?: boolean } = {}) {
  const theme = resolveTheme(brand);
  const { bg, primary } = theme.dark;
  const font = await readFile(FONT_FILE);
  const letter = monogramFor(brand);
  // Maskable icons get cropped to a circle/squircle by the OS: keep the mark in the safe zone.
  const mark = px * (opts.maskable ? 0.56 : 0.78);
  const stroke = Math.max(2, Math.round(px / 110));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: bg,
        }}
      >
        <div
          style={{
            width: mark,
            height: mark,
            borderRadius: "50%",
            border: `${stroke}px solid ${primary}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: mark - stroke * 2 - mark * 0.1,
              height: mark - stroke * 2 - mark * 0.1,
              borderRadius: "50%",
              border: `${Math.max(1, stroke / 2)}px solid ${primary}66`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: primary,
              fontFamily: "Playfair Display",
              fontSize: mark * (letter.length > 1 ? 0.38 : 0.56),
              lineHeight: 1,
              paddingBottom: mark * 0.04,
            }}
          >
            {letter}
          </div>
        </div>
      </div>
    ),
    {
      width: px,
      height: px,
      fonts: [{ name: "Playfair Display", data: font, weight: 500, style: "normal" }],
    },
  );
}
