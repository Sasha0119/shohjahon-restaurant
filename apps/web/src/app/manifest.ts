import { brand, localize, resolveTheme } from "@app/config";
import type { MetadataRoute } from "next";

const theme = resolveTheme(brand);

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.name,
    short_name: brand.name.length > 12 ? brand.name.split(" ")[0] : brand.name,
    description: localize(brand.welcomeLine, brand.defaultLanguage),
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    // Splash screen and browser chrome in the signature dark colours.
    background_color: theme.dark.bg,
    theme_color: theme.dark.bg,
    lang: brand.defaultLanguage,
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/maskable-icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
