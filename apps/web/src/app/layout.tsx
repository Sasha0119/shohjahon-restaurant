import { brand, buildThemeBootScript, buildThemeCss, localize, resolveTheme } from "@app/config";
import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";
import { LANGUAGE_COOKIE, pickLocale } from "@/i18n/locale";
import { fontVariables } from "./fonts";
import "./globals.css";
import { Providers } from "./providers";

const theme = resolveTheme(brand);
const themeCss = buildThemeCss(theme);
const themeBoot = buildThemeBootScript(theme);

export const metadata: Metadata = {
  title: { default: brand.name, template: `%s · ${brand.name}` },
  description: localize(brand.welcomeLine, brand.defaultLanguage),
  applicationName: brand.name,
  appleWebApp: { capable: true, title: brand.name, statusBarStyle: theme.mode === "light" ? "default" : "black-translucent" },
  formatDetection: { telephone: false },
  // Guest pages are private to a table — keep them out of search engines.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Browser chrome matches the brand's chosen mode (dark by default).
  themeColor:
    theme.mode === "system"
      ? [
          { media: "(prefers-color-scheme: light)", color: theme.light.bg },
          { media: "(prefers-color-scheme: dark)", color: theme.dark.bg },
        ]
      : theme[theme.mode].bg,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Per-request CSP nonce from src/proxy.ts (reading headers also makes every page render per request).
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  // The guest's language, remembered on this device (see i18n/index.tsx).
  const locale = pickLocale((await cookies()).get(LANGUAGE_COOKIE)?.value);
  return (
    <html lang={locale} className={fontVariables} suppressHydrationWarning>
      <head>
        {/* Sets light/dark before first paint so there is no flash. */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeBoot }} />
        <style dangerouslySetInnerHTML={{ __html: themeCss }} />
      </head>
      <body>
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
