"use client";

import type { LocaleCode } from "@app/config";
import type { ReactNode } from "react";
import { PageCurtain } from "@/components/ui/page-curtain";
import { SuccessBurst } from "@/components/ui/success-burst";
import { Toaster } from "@/components/ui/toast";
import { I18nProvider } from "@/i18n";

export function Providers({ children, locale }: { children: ReactNode; locale: LocaleCode }) {
  return (
    <I18nProvider initialLocale={locale}>
        {children}
        <Toaster />
        <SuccessBurst />
        <PageCurtain />
    </I18nProvider>
  );
}
