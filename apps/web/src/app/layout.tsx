import { brand, buildThemeBootScript, buildThemeCss, localize, resolveTheme } from "@app/config";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
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
  appleWebApp: { capable: true, title: brand.name, statusBarStyle: "default" },
  formatDetection: { telephone: false },
  // Guest pages are private to a table — keep them out of search engines.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: theme.light.bg },
    { media: "(prefers-color-scheme: dark)", color: theme.dark.bg },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Per-request CSP nonce from src/proxy.ts (reading headers also makes every page render per request).
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang={brand.defaultLanguage} className={fontVariables} suppressHydrationWarning>
      <head>
        {/* Sets light/dark before first paint so there is no flash. */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeBoot }} />
        <style dangerouslySetInnerHTML={{ __html: themeCss }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
