"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { IconButton } from "@/components/ui/button";
import { useT } from "@/i18n";

export const THEME_STORAGE_KEY = "theme-mode";

function subscribe(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

const getMode = () => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");

/** Light/dark switch. The guest's choice is remembered on this device. */
export function ThemeToggle({ onImage }: { onImage?: boolean }) {
  const t = useT();
  const mode = useSyncExternalStore(subscribe, getMode, () => null);

  const toggle = () => {
    const next = getMode() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* private mode — the toggle still works for this visit */
    }
  };

  return (
    <IconButton
      label={mode === "dark" ? t("theme.toLight") : t("theme.toDark")}
      variant={onImage ? "glass" : "plain"}
      onClick={toggle}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={mode ?? "unknown"}
          initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
          animate={{ rotate: 0, opacity: 1, scale: 1 }}
          exit={{ rotate: 90, opacity: 0, scale: 0.6 }}
          transition={{ duration: 0.2 }}
          className="grid place-items-center"
        >
          {mode === "dark" ? <Sun className="size-5" aria-hidden /> : <Moon className="size-5" aria-hidden />}
        </motion.span>
      </AnimatePresence>
    </IconButton>
  );
}
