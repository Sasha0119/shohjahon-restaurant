"use client";

import { AnimatePresence, motion } from "framer-motion";
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

  return (
    <AnimatePresence>
      {burst && (
        <motion.div
          key={burst.id}
          role="status"
          aria-live="assertive"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.35 } }}
          className="pointer-events-none fixed inset-0 z-[70] grid place-items-center bg-bg/70 backdrop-blur-[6px]"
        >
          <div className="flex flex-col items-center px-8 text-center">
            <div className="relative grid size-32 place-items-center">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  aria-hidden
                  className="absolute inset-0 rounded-full border border-primary"
                  initial={{ scale: 0.6, opacity: 0.7 }}
                  animate={{ scale: 1.9, opacity: 0 }}
                  transition={{ duration: 1.4, delay: 0.15 + i * 0.22, ease: "easeOut" }}
                />
              ))}
              <motion.span
                aria-hidden
                className="grid size-24 place-items-center rounded-full bg-primary text-on-primary shadow-glow"
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 420, damping: 18 }}
              >
                <svg viewBox="0 0 48 48" className="size-12" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                  <motion.path
                    d="M12 25 l8 8 l16 -18"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.45, delay: 0.2, ease: [0.65, 0, 0.35, 1] }}
                  />
                </svg>
              </motion.span>
            </div>
            <motion.p
              className="mt-7 font-display text-2xl font-semibold"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.4 }}
            >
              {burst.title}
            </motion.p>
            {burst.body && (
              <motion.p
                className="mt-2 max-w-xs text-[15px] text-fg-muted"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45, duration: 0.4 }}
              >
                {burst.body}
              </motion.p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
