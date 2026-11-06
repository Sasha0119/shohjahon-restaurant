"use client";

import { useEffect } from "react";
import { create } from "zustand";

interface Burst {
  id: number;
  title: string;
  body?: string;
}

const useBurst = create<{ burst: Burst | null; set: (b: Burst | null) => void }>((set) => ({
  burst: null,
  set: (burst) => set({ burst }),
}));

let nextId = 1;
/**
 * A short full-screen celebration: a gold check drawn inside rings that ripple
 * out, with a line of text. Used after sending an order and after paying.
 * It never blocks taps and fades out on its own.
 */
export function celebrate(title: string, body?: string) {
  useBurst.getState().set({ id: nextId++, title, body });
}

export function SuccessBurst() {
  const burst = useBurst((s) => s.burst);
  const set = useBurst((s) => s.set);

  useEffect(() => {
    if (!burst) return;
    const timer = setTimeout(() => set(null), 1900);
    return () => clearTimeout(timer);
  }, [burst, set]);

  if (!burst) return null;
  return (
    <div
      key={burst.id}
      role="status"
      aria-live="assertive"
      className="burst pointer-events-none fixed inset-0 z-[70] grid place-items-center bg-bg/85"
    >
      <div className="flex flex-col items-center px-8 text-center">
        <div className="relative grid size-32 place-items-center">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              aria-hidden
              className="burst-ring absolute inset-0 rounded-full border border-primary"
              style={{ "--i": i } as React.CSSProperties}
            />
          ))}
          <span
            aria-hidden
            className="burst-mark grid size-24 place-items-center rounded-full bg-primary text-on-primary"
          >
            <svg
              viewBox="0 0 48 48"
              className="size-12"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path className="burst-check" pathLength={1} d="M12 25 l8 8 l16 -18" />
            </svg>
          </span>
        </div>
        <p className="enter mt-7 font-display text-3xl" style={{ animationDelay: "350ms" }}>
          {burst.title}
        </p>
        {burst.body && (
          <p className="enter mt-2 max-w-xs text-[15px] text-fg-muted" style={{ animationDelay: "450ms" }}>
            {burst.body}
          </p>
        )}
      </div>
    </div>
  );
}
