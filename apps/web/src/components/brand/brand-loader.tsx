"use client";

import { brand } from "@app/config";
import { motion } from "framer-motion";
import { Logo } from "./logo";

/**
 * Full-screen branded loading state: the logo mark with a slowly turning
 * gold arc, the name, and a short status line. With "reduce motion" on, the
 * arc stays still (MotionConfig in app/providers.tsx).
 */
export function BrandLoader({ label }: { label: string }) {
  return (
    <main className="relative isolate grid min-h-svh place-items-center px-6" role="status" aria-live="polite">
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(40rem 26rem at 50% 38%, color-mix(in oklab, var(--primary-color) 12%, transparent), transparent 70%)",
        }}
      />
      <div className="flex flex-col items-center text-center">
        <div className="relative grid size-28 place-items-center">
          <motion.svg
            aria-hidden
            viewBox="0 0 112 112"
            className="absolute inset-0"
            animate={{ rotate: 360 }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
          >
            <circle cx="56" cy="56" r="54" fill="none" stroke="var(--border-color)" strokeWidth="1" />
            <circle
              cx="56"
              cy="56"
              r="54"
              fill="none"
              stroke="var(--primary-color)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeDasharray="60 280"
            />
          </motion.svg>
          <Logo size={72} />
        </div>
        <p className="mt-6 font-display text-xl font-medium uppercase tracking-[0.24em]">{brand.name}</p>
        <span aria-hidden className="gold-rule mt-4 w-14" />
        <p className="mt-4 text-sm text-fg-muted">{label}</p>
      </div>
    </main>
  );
}
