"use client";

import type { ReactNode } from "react";

/** Soft fade-and-rise between guest screens. */
export default function Template({ children }: { children: ReactNode }) {
  return (
    <div className="enter"
    >
      {children}
    </div>
  );
}
