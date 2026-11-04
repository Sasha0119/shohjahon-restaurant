"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
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
  "relative inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-[0.01em] select-none text-center leading-tight text-balance transition-[background-color,box-shadow,opacity,color,filter,translate] duration-200 disabled:opacity-40 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  // Glossy gold: a bright top edge and a faint sheen over the fill.
  primary:
    "bg-primary bg-[linear-gradient(180deg,rgb(255_255_255/0.18),transparent_55%)] text-on-primary shadow-[inset_0_1px_0_rgb(255_255_255/0.4),inset_0_0_0_1px_rgb(255_255_255/0.12),var(--shadow-glow)] hover:-translate-y-px hover:brightness-[1.07] motion-reduce:hover:translate-y-0",
  secondary: "glass-chip text-fg hover:-translate-y-px hover:text-primary motion-reduce:hover:translate-y-0",
  outline: "text-primary ring-1 ring-inset ring-gold-line hover:bg-primary/8",
  ghost: "text-fg hover:bg-muted",
  glass: "glass-dark hover:bg-black/45",
  danger: "bg-danger/12 text-danger ring-1 ring-inset ring-danger/25 hover:bg-danger/18",
};

const sizes: Record<Size, string> = {
  sm: "min-h-10 px-4 py-1.5 text-sm",
  md: "min-h-12 px-5 py-2 text-[15px]",
  lg: "min-h-14 px-7 py-2.5 text-base",
};

export function buttonClasses(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

interface ButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  variant?: Variant;
  size?: Size;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className, type = "button", ...props },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      type={type}
      whileTap={{ scale: 0.965 }}
      transition={{ type: "spring", stiffness: 520, damping: 30 }}
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
  return <Link className={cn(buttonClasses(variant, size, className), "pressable")} {...props} />;
}

interface IconButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
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
    <motion.button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      whileTap={{ scale: 0.9 }}
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40",
        variant === "plain" && "text-fg hover:bg-muted",
        variant === "muted" && "glass-chip text-fg",
        variant === "surface" && "glass-card text-fg",
        variant === "glass" && "glass-dark",
        className,
      )}
      {...props}
    >
      {children}
    </motion.button>
  );
});
