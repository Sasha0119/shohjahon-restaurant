"use client";

import Link from "next/link";
import { forwardRef, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "glass" | "danger";
type Size = "md" | "lg" | "sm";

/*
 * Buttons grow with their text (min-height, not a fixed height) so long
 * Uzbek/Russian labels wrap onto two lines instead of spilling out.
 */
const base =
  "pressable relative inline-flex items-center justify-center gap-2 rounded-card font-label font-medium select-none text-center leading-tight text-balance disabled:opacity-40 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-on-primary hover:brightness-110",
  secondary: "text-fg ring-1 ring-inset ring-line hover:ring-primary hover:text-primary",
  outline: "text-primary ring-1 ring-inset ring-gold-line hover:bg-primary/8",
  ghost: "text-fg hover:bg-muted",
  glass: "glass-dark hover:bg-black/45",
  danger: "bg-danger/12 text-danger ring-1 ring-inset ring-danger/25 hover:bg-danger/18",
};

const sizes: Record<Size, string> = {
  sm: "min-h-10 px-3.5 py-1.5 text-xs",
  md: "min-h-12 px-5 py-2 text-[13px]",
  lg: "min-h-14 px-6 py-2.5 text-sm",
};

export function buttonClasses(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

interface ButtonProps extends ComponentProps<"button"> {
  variant?: Variant;
  size?: Size;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClasses(variant, size, className)}
      {...props}
    />
  );
});

interface LinkButtonProps extends ComponentProps<typeof Link> {
  variant?: Variant;
  size?: Size;
}

export function LinkButton({ variant = "primary", size = "md", className, ...props }: LinkButtonProps) {
  return <Link className={buttonClasses(variant, size, className)} {...props} />;
}

interface IconButtonProps extends ComponentProps<"button"> {
  label: string;
  variant?: "plain" | "glass" | "muted" | "surface";
  children: ReactNode;
}

/** Round, 44×44 minimum. `label` is announced to screen readers. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = "plain", className, children, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "pressable inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40",
        variant === "plain" && "text-fg hover:bg-muted",
        variant === "muted" && "glass-chip text-fg",
        variant === "surface" && "glass-card text-fg",
        variant === "glass" && "glass-dark",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});
