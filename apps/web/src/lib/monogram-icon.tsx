import { brand, monogramFor, resolveTheme } from "@app/config";
import { ImageResponse } from "next/og";

/** PNG app icon generated from the brand monogram and primary colour. */
export function renderMonogramIcon(px: number) {
  const theme = resolveTheme(brand);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: theme.light.primary,
          color: theme.light.primaryContrast,
          fontSize: px * 0.4,
          fontWeight: 700,
          letterSpacing: -px * 0.01,
        }}
      >
        {monogramFor(brand)}
      </div>
    ),
    { width: px, height: px },
  );
}
