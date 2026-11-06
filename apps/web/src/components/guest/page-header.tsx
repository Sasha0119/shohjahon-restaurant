"use client";

import { brand } from "@app/config";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { LanguageSwitcher } from "@/components/brand/language-switcher";
import { ThemeToggle } from "@/components/brand/theme-toggle";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { useGuest } from "./guest-context";

/** Sticky frosted header for inner screens. */
export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  const t = useT();
  const { base } = useGuest();
  return (
    <header className="sticky top-0 z-30 glass border-b border-gold-line/50">
      <div className="flex h-16 items-center gap-3 px-4">
        <Link href={base} aria-label={`${brand.name} — ${t("common.home")}`} className="pressable rounded-full">
          <Logo size={38} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-[1.35rem] font-semibold leading-tight">{title}</h1>
          {subtitle && <p className="truncate text-xs font-medium text-fg-muted">{subtitle}</p>}
        </div>
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
      {children}
    </header>
  );
}

export function TablePill({ onImage, className }: { onImage?: boolean; className?: string }) {
  const t = useT();
  const { table } = useGuest();
  return (
    <span
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-card px-3.5 text-sm font-semibold",
        onImage ? "glass-dark" : "glass-chip text-fg",
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-success" aria-hidden />
      {t("common.table", { number: table.number })}
    </span>
  );
}
