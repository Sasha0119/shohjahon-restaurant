"use client";

import { MotionConfig } from "framer-motion";
import type { LocaleCode } from "@app/config";
import type { ReactNode } from "react";
import { SuccessBurst } from "@/components/ui/success-burst";
import { Toaster } from "@/components/ui/toast";
import { I18nProvider } from "@/i18n";

export function Providers({ children, locale }: { children: ReactNode; locale: LocaleCode }) {
  return (
    <I18nProvider initialLocale={locale}>
      {/* Respects the device's "reduce motion" setting for every animation. */}
      <MotionConfig reducedMotion="user">
        {children}
        <Toaster />
        <SuccessBurst />
      </MotionConfig>
    </I18nProvider>
  );
}
