"use client";

import { brand } from "@app/config";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/brand/theme-toggle";

/** Calm, branded backdrop for staff sign-in screens. */
export function StaffAuthLayout({ title, subtitle, children, footer }: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="relative isolate flex min-h-svh flex-col items-center px-4 py-10">
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60rem 40rem at 50% -10%, color-mix(in oklab, var(--primary-color) 18%, transparent), transparent 70%), radial-gradient(40rem 30rem at 100% 100%, color-mix(in oklab, var(--secondary-color) 14%, transparent), transparent 70%)",
        }}
      />
      <div className="absolute right-3 top-3">
        <ThemeToggle />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="my-auto w-full max-w-md"
      >
        <div className="mb-7 flex flex-col items-center text-center">
          <Logo size={56} />
          <p className="mt-3 text-sm font-semibold uppercase tracking-[0.18em] text-fg-muted">{brand.name}</p>
          <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-2 max-w-sm text-[15px] text-fg-muted">{subtitle}</p>}
        </div>
        <div className="rounded-sheet bg-surface p-5 shadow-lift ring-1 ring-line/60 sm:p-7">{children}</div>
        {footer && <div className="mt-6 text-center">{footer}</div>}
      </motion.div>
    </main>
  );
}
