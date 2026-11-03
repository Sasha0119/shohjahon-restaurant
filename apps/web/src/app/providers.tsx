"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/toast";
import { I18nProvider } from "@/i18n";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      {/* Respects the device's "reduce motion" setting for every animation. */}
      <MotionConfig reducedMotion="user">
        {children}
        <Toaster />
      </MotionConfig>
    </I18nProvider>
  );
}
