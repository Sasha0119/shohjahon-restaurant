import { themePresets } from "./themes";
import type { BrandConfig, FontKey, Palette, ThemeMode, ThemeModeSetting } from "./types";

export interface ResolvedTheme {
  presetId: string;
  mode: ThemeModeSetting;
  defaultMode: ThemeMode;
  fonts: { display: FontKey; body: FontKey };
  radius: string;
  light: Palette;
  dark: Palette;
}

/** Preset + brand overrides → the final theme. */
export function resolveTheme(brand: Pick<BrandConfig, "theme">): ResolvedTheme {
  const preset = themePresets[brand.theme.preset];
  if (!preset) throw new Error(`Unknown theme preset "${brand.theme.preset}"`);
  return {
    presetId: preset.id,
    mode: brand.theme.mode,
    defaultMode: preset.defaultMode,
    fonts: { ...preset.fonts, ...brand.theme.fonts },
    radius: preset.radius,
    light: { ...preset.light, ...brand.theme.overrides?.light },
    dark: { ...preset.dark, ...brand.theme.overrides?.dark },
  };
}

const SERIF_FALLBACK = 'ui-serif, Georgia, Cambria, "Times New Roman", serif';
const SANS_FALLBACK =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const SERIF_FONTS: FontKey[] = ["playfair-display"];

/** CSS custom property that next/font sets for a font key, e.g. `--ff-fraunces`. */
export const fontVar = (key: FontKey) => `--ff-${key}`;

function fontStack(key: FontKey): string {
  return `var(${fontVar(key)}), ${SERIF_FONTS.includes(key) ? SERIF_FALLBACK : SANS_FALLBACK}`;
}

function paletteVars(p: Palette): string {
  const vars: Record<string, string> = {
    "--primary-color": p.primary,
    "--primary-contrast": p.primaryContrast,
    "--secondary-color": p.secondary,
    "--secondary-contrast": p.secondaryContrast,
    "--bg-color": p.bg,
    "--surface-color": p.surface,
    "--surface-muted-color": p.surfaceMuted,
    "--text-color": p.text,
    "--text-muted-color": p.textMuted,
    "--border-color": p.border,
    "--success-color": p.success,
    "--warning-color": p.warning,
    "--danger-color": p.danger,
    "--chart-color": p.chart,
    "--hero-tint": p.heroTint,
  };
  return Object.entries(vars)
    .map(([k, v]) => `${k}:${v};`)
    .join("");
}

/**
 * Builds the stylesheet that powers the whole design system.
 * The active mode is chosen by `data-theme="light|dark"` on <html>.
 */
export function buildThemeCss(theme: ResolvedTheme): string {
  const base = `:root{--font-family:${fontStack(theme.fonts.body)};--font-display-family:${fontStack(
    theme.fonts.display,
  )};--radius:${theme.radius};}`;
  const light = `:root,:root[data-theme="light"]{${paletteVars(theme.light)}color-scheme:light;}`;
  const dark = `:root[data-theme="dark"]{${paletteVars(theme.dark)}color-scheme:dark;}`;
  return base + light + dark;
}

/**
 * Tiny script inlined in <head> so the right theme is applied before the first
 * paint (no light/dark flash). The guest's own choice is stored in localStorage.
 */
export function buildThemeBootScript(theme: ResolvedTheme, storageKey = "theme-mode"): string {
  const fallback = JSON.stringify(theme.mode);
  const presetDefault = JSON.stringify(theme.defaultMode);
  return `(function(){try{var s=null;try{s=localStorage.getItem(${JSON.stringify(
    storageKey,
  )})}catch(e){}var m=s||${fallback};if(m==="system"){var q=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)");m=q?(q.matches?"dark":"light"):${presetDefault}}document.documentElement.setAttribute("data-theme",m==="dark"?"dark":"light")}catch(e){document.documentElement.setAttribute("data-theme",${presetDefault})}})();`;
}
