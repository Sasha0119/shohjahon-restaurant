"use client";

import { brand } from "@app/config";
import { Logo } from "./logo";

/**
 * Full-screen branded loading state, and the first thing a guest sees: the name
 * at full size, a slowly turning gold arc and a short status line. Rendered on the
 * server and animated in CSS, so it shows before any JavaScript has run. With
 * "reduce motion" on, the arc stays still.
 */
export function BrandLoader({ label, heroBehind }: { label: string; /** The hero photo is behind it (see guest-shell.tsx): dim it, and use light text. */ heroBehind?: boolean }) {
  return (
    <main className={`relative isolate grid min-h-svh place-items-center overflow-hidden px-6${heroBehind ? " text-white" : ""}`} role="status" aria-live="polite">
      {heroBehind && <div aria-hidden className="absolute inset-0 -z-10 bg-black/70" />}
      <div className="flex flex-col items-center text-center">
        <div className="relative grid size-20 place-items-center">
          <svg aria-hidden viewBox="0 0 112 112" className="animate-turn absolute inset-0">
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
          </svg>
          <Logo size={52} />
        </div>
        <p className="mt-6 font-display text-[clamp(3.25rem,18vw,8rem)] font-medium italic leading-tight tracking-[-0.02em]">{brand.name}</p>
        <span aria-hidden className="gold-rule mt-4 w-14" />
        <p className={`mt-4 text-sm${heroBehind ? " text-white/80" : " text-fg-muted"}`}>{label}</p>
      </div>
    </main>
  );
}
