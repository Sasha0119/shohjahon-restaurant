"use client";

import { brand, type LocaleCode } from "@app/config";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Globe } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { localeNames, localeShort, useI18n } from "@/i18n";
import { cn } from "@/lib/cn";

/**
 * Header language switcher: a compact "UZ" pill that opens the list of
 * languages (each written in its own language). The choice is remembered on
 * this device (cookie), so the next visit opens in the same language.
 */
export function LanguageSwitcher({
  onImage,
  className,
  placement = "below",
}: {
  onImage?: boolean;
  className?: string;
  /** "above-start": opens upward, left-aligned (e.g. at the bottom of a sidebar). */
  placement?: "below" | "above-start";
}) {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        root.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (brand.languages.length < 2) return null;

  const choose = (code: LocaleCode) => {
    setLocale(code);
    setOpen(false);
  };

  return (
    <div ref={root} className={cn("relative", className)}>
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${t("language.label")}: ${localeNames[locale]}`}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "pressable inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-xs font-semibold tracking-[0.12em]",
          onImage ? "glass-dark" : "glass-chip text-fg hover:text-primary",
        )}
      >
        <Globe className="size-4" aria-hidden />
        {localeShort[locale]}
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            id={listId}
            role="list"
            aria-label={t("language.label")}
            initial={{ opacity: 0, y: placement === "below" ? -6 : 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: placement === "below" ? -6 : 6, scale: 0.97 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "glass-panel absolute z-50 w-48 overflow-hidden rounded-2xl p-1.5 text-fg",
              placement === "below" ? "right-0 top-[calc(100%+0.5rem)] origin-top-right" : "bottom-[calc(100%+0.5rem)] left-0 origin-bottom-left",
            )}
          >
            {brand.languages.map((code) => {
              const active = code === locale;
              return (
                <li key={code}>
                  <button
                    type="button"
                    lang={code}
                    aria-current={active ? "true" : undefined}
                    onClick={() => choose(code)}
                    className={cn(
                      "pressable flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px]",
                      active ? "bg-primary/10 font-semibold text-primary" : "hover:bg-muted",
                    )}
                  >
                    <span className="w-6 text-[11px] font-semibold tracking-[0.12em] text-fg-muted">{localeShort[code]}</span>
                    <span className="flex-1">{localeNames[code]}</span>
                    {active && <Check className="size-4" aria-hidden />}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
