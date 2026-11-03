import { describe, expect, it } from "vitest";
import {
  brand,
  buildThemeBootScript,
  buildThemeCss,
  monogramFor,
  resolveTheme,
  themePresets,
  type Palette,
} from "../index";

/** WCAG relative luminance contrast ratio for #RRGGBB colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = hex.replace("#", "");
    const [r, g, bl] = [0, 2, 4].map((i) => {
      const c = parseInt(n.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

describe("theme presets", () => {
  it("ships exactly the three named presets", () => {
    expect(Object.values(themePresets).map((p) => p.label)).toEqual([
      "Warm Bistro",
      "Fresh Cafe",
      "Modern Dark",
    ]);
  });

  for (const preset of Object.values(themePresets)) {
    for (const mode of ["light", "dark"] as const) {
      const p: Palette = preset[mode];
      it(`${preset.label} (${mode}) meets WCAG AA contrast`, () => {
        expect(contrast(p.text, p.bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(p.text, p.surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(p.textMuted, p.bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(p.textMuted, p.surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(p.primaryContrast, p.primary)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(p.secondaryContrast, p.secondary)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(p.chart, p.surface)).toBeGreaterThanOrEqual(3);
      });
    }
  }
});

describe("resolveTheme / buildThemeCss", () => {
  it("applies brand overrides on top of the preset", () => {
    const t = resolveTheme({
      theme: { preset: "fresh-cafe", mode: "light", overrides: { light: { primary: "#123456" } } },
    });
    expect(t.light.primary).toBe("#123456");
    expect(t.light.bg).toBe(themePresets["fresh-cafe"].light.bg);
    expect(t.fonts).toEqual(themePresets["fresh-cafe"].fonts);
  });

  it("emits the required CSS variables for both modes", () => {
    const css = buildThemeCss(resolveTheme(brand));
    for (const v of ["--primary-color", "--secondary-color", "--bg-color", "--font-family"]) {
      expect(css).toContain(v);
    }
    expect(css).toContain(':root[data-theme="dark"]');
    expect(css).toContain("var(--ff-fraunces)");
  });

  it("throws on an unknown preset", () => {
    // @ts-expect-error — deliberately invalid
    expect(() => resolveTheme({ theme: { preset: "nope", mode: "light" } })).toThrow();
  });

  it("boot script is a self-contained expression", () => {
    const js = buildThemeBootScript(resolveTheme(brand));
    expect(() => new Function(js)).not.toThrow();
  });
});

describe("monogramFor", () => {
  it("builds initials from the name", () => {
    expect(monogramFor({ name: "Your Restaurant", logo: { type: "monogram" } })).toBe("YR");
    expect(monogramFor({ name: "Olive", logo: { type: "monogram" } })).toBe("OL");
    expect(monogramFor({ name: "  ", logo: { type: "monogram" } })).toBe("•");
    expect(monogramFor({ name: "X", logo: { type: "monogram", text: "AB" } })).toBe("AB");
  });

  it("brand defaults contain no real brand name", () => {
    expect(brand.name).toBe("Your Restaurant");
  });
});
