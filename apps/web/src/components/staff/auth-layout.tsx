"use client";

import { brand } from "@app/config";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { LanguageSwitcher } from "@/components/brand/language-switcher";
import { ThemeToggle } from "@/components/brand/theme-toggle";

/** Calm, branded backdrop for staff sign-in screens. */
export function StaffAuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="relative isolate flex min-h-svh flex-col items-center px-4 py-10">
      <div className="absolute right-3 top-3 flex items-center gap-2">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
      <div className="enter my-auto w-full max-w-md">
        <div className="mb-7 flex flex-col items-center text-center">
          <Logo size={56} />
          <p className="mt-3 text-sm font-label uppercase tracking-[0.08em] text-fg-muted">{brand.name}</p>
          <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-2 max-w-sm text-[15px] text-fg-muted">{subtitle}</p>}
        </div>
        <div className="glass-panel rounded-sheet p-5 sm:p-7">{children}</div>
        {footer && <div className="mt-6 text-center">{footer}</div>}
      </div>
    </main>
  );
}
