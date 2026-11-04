"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Shimmering placeholder block. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton rounded-xl", className)} />;
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  body?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, body, action, className }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={cn("flex flex-col items-center px-8 py-14 text-center", className)}
    >
      <div className="relative mb-6">
        <div className="absolute inset-0 scale-150 rounded-full bg-primary/12 blur-2xl" aria-hidden />
        <div className="relative grid size-20 place-items-center rounded-full bg-surface shadow-soft ring-1 ring-gold-line">
          <Icon className="size-8 text-primary" strokeWidth={1.4} aria-hidden />
        </div>
      </div>
      <h2 className="text-2xl font-semibold">{title}</h2>
      <span aria-hidden className="gold-rule mt-4 w-16" />
      {body && <p className="mt-4 max-w-xs text-[15px] leading-relaxed text-fg-muted">{body}</p>}
      {action && <div className="mt-7">{action}</div>}
    </motion.div>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  label: string;
  className?: string;
}

/** Pill-style segmented control with an animated thumb. Arrow keys move between options. */
export function Segmented<T extends string>({ value, onChange, options, label, className }: SegmentedProps<T>) {
  const id = useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("flex rounded-full bg-muted p-1 ring-1 ring-inset ring-line/80", className)}
      onKeyDown={(e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        const i = options.findIndex((o) => o.value === value);
        const next = options[(i + (e.key === "ArrowRight" ? 1 : options.length - 1)) % options.length]!;
        onChange(next.value);
        (e.currentTarget.querySelector(`[data-value="${next.value}"]`) as HTMLElement | null)?.focus();
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            data-value={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "pressable relative min-h-10 flex-1 rounded-full px-2 py-1.5 text-[13px] font-semibold leading-tight transition-colors sm:text-sm",
              active ? "text-fg" : "text-fg-muted hover:text-fg",
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-full bg-surface shadow-soft ring-1 ring-gold-line"
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Small rounded label. */
export function Badge({
  children,
  tone = "muted",
  className,
}: {
  children: ReactNode;
  tone?: "muted" | "primary" | "secondary" | "success" | "danger" | "warning";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold leading-none",
        tone === "muted" && "bg-muted text-fg-muted ring-1 ring-inset ring-line",
        tone === "primary" && "bg-primary/12 text-primary ring-1 ring-inset ring-gold-line",
        tone === "secondary" && "bg-secondary text-on-secondary",
        tone === "success" && "bg-success/12 text-success",
        tone === "danger" && "bg-danger/12 text-danger",
        tone === "warning" && "bg-warning/15 text-warning",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Section heading with optional subtitle and trailing action. */
export function SectionTitle({
  title,
  subtitle,
  action,
  id,
  eyebrow,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  id?: string;
  /** A short gold rule above the title (the signature section marker). */
  eyebrow?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow && <span aria-hidden className="mb-3 block h-px w-10 bg-primary" />}
        <h2 id={id} className="text-[1.5rem] font-semibold leading-tight">
          {title}
        </h2>
        {subtitle && <p className="mt-1.5 text-sm text-fg-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
