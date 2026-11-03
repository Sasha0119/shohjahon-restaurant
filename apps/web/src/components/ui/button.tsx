"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import Link from "next/link";
import { forwardRef, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "glass" | "danger";
type Size = "md" | "lg" | "sm";

const base =
  "relative inline-flex items-center justify-center gap-2 rounded-full font-semibold select-none whitespace-nowrap transition-[background-color,box-shadow,opacity,color] duration-200 disabled:opacity-45 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-on-primary shadow-glow hover:brightness-[1.06]",
  secondary: "bg-muted text-fg hover:bg-[color-mix(in_oklab,var(--surface-muted-color)_85%,var(--text-color))]",
  ghost: "text-fg hover:bg-muted",
  glass: "glass-dark hover:bg-black/40",
  danger: "bg-danger/10 text-danger hover:bg-danger/15",
};

const sizes: Record<Size, string> = {
  sm: "h-10 px-4 text-sm",
  md: "h-12 px-5 text-[15px]",
  lg: "h-14 px-6 text-base",
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
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
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
  return (
    <Link
      className={cn(buttonClasses(variant, size, className), "active:scale-[0.97] transition-transform")}
      {...props}
    />
  );
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
        variant === "muted" && "bg-muted text-fg",
        variant === "surface" && "bg-surface text-fg shadow-soft",
        variant === "glass" && "glass-dark",
        className,
      )}
      {...props}
    >
      {children}
    </motion.button>
  );
});
