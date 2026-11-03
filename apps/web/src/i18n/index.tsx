"use client";

import { brand, type LocaleCode } from "@app/config";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { en } from "./en";
import { translate, type MessageKey, type Messages, type Vars } from "./translate";

/** Register translation files here. */
export const dictionaries: Record<LocaleCode, Messages> = { en };

export const localeNames: Record<LocaleCode, string> = { en: "English" };

interface I18nValue {
  locale: LocaleCode;
  setLocale: (locale: LocaleCode) => void;
  t: (key: MessageKey, vars?: Vars) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>(brand.defaultLanguage);

  const setLocale = useCallback((next: LocaleCode) => {
    if (!brand.languages.includes(next)) return;
    setLocaleState(next);
    document.documentElement.lang = next;
  }, []);

  const t = useCallback(
    (key: MessageKey, vars?: Vars) => translate(locale, dictionaries[locale], en, key, vars),
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

export const useT = () => useI18n().t;
