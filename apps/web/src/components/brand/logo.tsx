import { brand, monogramFor } from "@app/config";
import Image from "next/image";
import { cn } from "@/lib/cn";

interface LogoProps {
  size?: number;
  /** On top of photos: frosted glass with white text. */
  onImage?: boolean;
  className?: string;
}

/** The brand logo — an image if configured, otherwise a monogram from the name. */
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
  const text = monogramFor(brand);
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-[30%] font-display font-semibold tracking-tight",
        onImage ? "glass-dark" : "bg-primary text-on-primary shadow-glow",
        className,
      )}
    >
      {text}
    </span>
  );
}
