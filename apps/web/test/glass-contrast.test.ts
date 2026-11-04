import { readFileSync } from "node:fs";
import { themePresets, type Palette } from "@app/config";
import { describe, expect, it } from "vitest";

/**
 * Liquid glass must keep text readable. This reads the glass strengths straight
 * from globals.css (the one place they are set) and checks WCAG contrast of the
 * text that sits on each kind of glass, in light and dark mode, over what can be
 * behind it: the page with its colour glows, and — for the blurred bars — photos
 * scrolling underneath (modelled as pure white and pure black, the extremes).
 */
const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

function block(selector: string): Record<string, string> {
  const vars: Record<string, string> = {};
  const re = new RegExp(`(^|\\n)${selector.replace(/[[\]"()]/g, "\\$&")} \\{([^}]*)\\}`, "g");
  for (const m of css.matchAll(re)) {
    for (const [, name, value] of m[2]!.matchAll(/(--[\w-]+):\s*([^;]+);/g)) vars[name!] = value!.trim();
  }
  return vars;
}
const lightVars = block(":root");
const darkVars = { ...lightVars, ...block(':root[data-theme="dark"]') };

const pct = (v: string | undefined) => {
  if (!v?.endsWith("%")) throw new Error(`expected a percentage, got ${v}`);
  return parseFloat(v) / 100;
};
const num = (v: string | undefined) => {
  const n = parseFloat(v ?? "");
  if (Number.isNaN(n)) throw new Error(`expected a number, got ${v}`);
  return n;
};

type RGB = [number, number, number];
const hex = (h: string): RGB => [0, 2, 4].map((i) => parseInt(h.replace("#", "").slice(i, i + 2), 16)) as RGB;
/** `top` at opacity `a` over `bottom` (how the browser composites a translucent layer). */
const over = (top: RGB, a: number, bottom: RGB): RGB => top.map((c, i) => c * a + bottom[i]! * (1 - a)) as RGB;
const bright = (c: RGB, k: number): RGB => c.map((v) => Math.min(255, v * k)) as RGB;
function contrast(a: RGB, b: RGB): number {
  const lum = (c: RGB) => {
    const [r, g, bl] = c.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    }) as RGB;
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];

for (const mode of ["light", "dark"] as const) {
  const p: Palette = themePresets.signature[mode];
  const v = mode === "light" ? lightVars : darkVars;
  const [bg, surface, text, muted, primary, onPrimary, secondary] = [p.bg, p.surface, p.text, p.textMuted, p.primary, p.primaryContrast, p.secondary].map(hex) as RGB[];
  const brightness = num(v["--glass-brightness"]);

  // The page as it shows through glass: plain, under each glow at full strength, and under both.
  const glowP = pct(v["--glow-primary"]);
  const glowS = pct(v["--glow-secondary"]);
  const page: Record<string, RGB> = {
    page: bg!,
    "primary glow": over(primary!, glowP, bg!),
    "secondary glow": over(secondary!, glowS, bg!),
    "both glows": over(secondary!, glowS, over(primary!, glowP, bg!)),
  };
  const photos: Record<string, RGB> = { "white photo": WHITE, "black photo": BLACK };

  /** Blurred glass: the backdrop is brightened/dimmed by backdrop-filter, then tinted. */
  const blurred = (tint: number, behind: RGB) => over(surface!, tint, bright(behind, brightness));
  /** Unblurred glass (cards, chips): just the tint over the page. */
  const plain = (tint: number, behind: RGB) => over(surface!, tint, behind);

  describe(`liquid glass contrast (${mode})`, () => {
    it("bars (header, nav): all text readable over the page and its glows", () => {
      const tint = pct(v["--glass-tint"]);
      for (const [name, behind] of Object.entries(page)) {
        const g = blurred(tint, behind);
        expect(contrast(text!, g), `text on bar over ${name}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(muted!, g), `muted text on bar over ${name}`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it("bars: titles stay readable even over a pure white or black photo scrolling underneath", () => {
      const tint = pct(v["--glass-tint"]);
      for (const [name, behind] of Object.entries(photos)) {
        const g = blurred(tint, behind);
        expect(contrast(text!, g), `text on bar over ${name}`).toBeGreaterThanOrEqual(4.5);
        // Small grey subtitles: at least the 3:1 large-text/UI level in this extreme case.
        expect(contrast(muted!, g), `muted text on bar over ${name}`).toBeGreaterThanOrEqual(3);
      }
    });

    it("sheets and modals: all text readable over the dark scrim, whatever is behind it", () => {
      const tint = pct(v["--glass-tint-sheet"]);
      for (const [name, behind] of Object.entries({ ...page, ...photos })) {
        const scrimmed = over(BLACK, 0.6, behind); // the bg-black/60 scrim
        const g = blurred(tint, scrimmed);
        expect(contrast(text!, g), `text on sheet over ${name}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(muted!, g), `muted text on sheet over ${name}`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it("cards and chips: all text readable over the page and its glows", () => {
      for (const key of ["--glass-tint-card", "--glass-tint-chip"]) {
        const tint = pct(v[key]);
        for (const [name, behind] of Object.entries(page)) {
          const g = plain(tint, behind);
          expect(contrast(text!, g), `text on ${key} over ${name}`).toBeGreaterThanOrEqual(4.5);
          expect(contrast(muted!, g), `muted text on ${key} over ${name}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });

    it("gold cart pill: its label stays readable over anything", () => {
      const tint = pct(v["--glass-tint-accent"]);
      for (const [name, behind] of Object.entries({ ...page, ...photos })) {
        const g = over(primary!, tint, behind);
        expect(contrast(onPrimary!, g), `cart pill over ${name}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  });
}

describe("liquid glass tokens", () => {
  it("are all defined in one place (globals.css) for both modes", () => {
    for (const key of ["--glass-blur", "--glass-tint", "--glass-tint-sheet", "--glass-tint-accent", "--glass-tint-card", "--glass-tint-chip", "--glass-edge", "--glass-highlight"]) {
      expect(lightVars[key], key).toBeDefined();
      expect(darkVars[key], key).toBeDefined();
    }
  });

  it("have a fallback without backdrop-filter and honour 'reduce transparency'", () => {
    expect(css).toContain("@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))");
    expect(css).toContain("@media (prefers-reduced-transparency: reduce)");
  });
});
