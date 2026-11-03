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
    background_color: theme.light.bg,
    theme_color: theme.light.primary,
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
