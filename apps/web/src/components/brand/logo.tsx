import { brand, monogramFor } from "@app/config";
import Image from "next/image";
import { cn } from "@/lib/cn";

/*
 * The brand logo, configured in config/brand.ts (`logo`).
 *
 *   <Logo />      the mark: a serif letter in a thin gold circle
 *   <Wordmark />  the mark + the name set in the display serif
 *
 * Colours come from the theme, so the same logo works in dark mode, light
 * mode and on photos (`onImage`: ivory on any background).
 */

interface LogoProps {
  size?: number;
  /** On top of photos: ivory lines regardless of the theme. */
  onImage?: boolean;
  className?: string;
}

/** The mark alone — used in headers, loading screens, icons and receipts. */
export function Logo({ size = 40, onImage, className }: LogoProps) {
  if (brand.logo.type === "image") {
    return (
      <Image
        src={brand.logo.src}
        alt={brand.logo.alt}
        width={size}
        height={size}
        className={cn("rounded-xl object-contain", className)}
      />
    );
  }
  const letter = monogramFor(brand);
  const ring = onImage ? "rgb(255 255 255 / 0.78)" : "var(--primary-color)";
  const ink = onImage ? "#FFFFFF" : "var(--primary-color)";
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={cn("shrink-0", className)}
      style={onImage ? { filter: "drop-shadow(0 1px 6px rgb(0 0 0 / 0.35))" } : undefined}
    >
      {/* Outer hairline + inner fine ring: the "thin circle". */}
      <circle cx="32" cy="32" r="30.5" fill="none" stroke={ring} strokeWidth="1.25" />
      <circle cx="32" cy="32" r="27" fill="none" stroke={ring} strokeOpacity="0.45" strokeWidth="0.6" />
      <text
        x="32"
        y="33"
        textAnchor="middle"
        dominantBaseline="central"
        fill={ink}
        style={{
          fontFamily: "var(--font-display-family)",
          fontSize: letter.length > 1 ? 24 : 34,
          fontWeight: 500,
        }}
      >
        {letter}
      </text>
    </svg>
  );
}

interface WordmarkProps extends LogoProps {
  /** "row": mark left of the name (headers). "stack": mark above the name (hero, splash). */
  layout?: "row" | "stack";
  /** Show the brand tagline under the name (stack layout only). */
  tagline?: string;
}

/** The mark + the name in the display serif. Height follows `size` (the mark). */
export function Wordmark({ size = 40, onImage, layout = "row", tagline, className }: WordmarkProps) {
  const stack = layout === "stack";
  return (
    <span
      className={cn("inline-flex items-center", stack ? "flex-col gap-3 text-center" : "gap-3", className)}
      aria-label={brand.name}
      role="img"
    >
      <Logo size={size} onImage={onImage} />
      <span className={cn("flex flex-col", stack && "items-center")}>
        <span
          className={cn(
            "font-display italic leading-none tracking-[-0.01em]",
            onImage ? "text-white" : "text-fg",
          )}
          style={{ fontSize: Math.max(16, size * (stack ? 0.68 : 0.56)) }}
        >
          {brand.name}
        </span>
        {stack && tagline && (
          <span
            className={cn("mt-3 font-display italic", onImage ? "text-white/85" : "text-fg-muted")}
            style={{ fontSize: Math.max(14, size * 0.24) }}
          >
            {tagline}
          </span>
        )}
      </span>
    </span>
  );
}
