"use client";

import { brand, type LocaleCode } from "@app/config";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { setFormatLanguage } from "@/lib/format";
import { en } from "./en";
import { LANGUAGE_COOKIE } from "./locale";
import { ru } from "./ru";
import { translate, type MessageKey, type Messages, type Vars } from "./translate";
import { uz } from "./uz";

/** Register translation files here. */
export const dictionaries: Record<LocaleCode, Messages> = { uz, en, ru };

/** Each language's name in its own language (shown in the switcher). */
export const localeNames: Record<LocaleCode, string> = { uz: "Oʻzbekcha", en: "English", ru: "Русский" };
/** Short codes for the compact switcher. */
export const localeShort: Record<LocaleCode, string> = { uz: "UZ", en: "EN", ru: "RU" };

export { LANGUAGE_COOKIE, pickLocale } from "./locale";

interface I18nValue {
  locale: LocaleCode;
  setLocale: (locale: LocaleCode) => void;
  t: (key: MessageKey, vars?: Vars) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

/**
 * `initialLocale` comes from the cookie, read on the server (app/layout.tsx),
 * so the first paint is already in the guest's language — no flash.
 */
export function I18nProvider({ children, initialLocale }: { children: ReactNode; initialLocale?: LocaleCode }) {
  const [locale, setLocaleState] = useState<LocaleCode>(initialLocale ?? brand.defaultLanguage);
  // Numbers, dates and prices follow the UI language (see lib/format.ts).
  setFormatLanguage(locale);

  const setLocale = useCallback((next: LocaleCode) => {
    if (!brand.languages.includes(next)) return;
    setFormatLanguage(next);
    setLocaleState(next);
    document.documentElement.lang = next;
    try {
      document.cookie = `${LANGUAGE_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    } catch {
      // Cookies blocked: the choice still applies for this visit.
    }
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
