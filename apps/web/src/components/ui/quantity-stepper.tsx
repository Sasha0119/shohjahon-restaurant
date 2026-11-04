"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Minus, Plus, Trash2 } from "lucide-react";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";

interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  size?: "sm" | "md";
  /** Show a trash icon instead of "−" when at 1 and min is 0. */
  removable?: boolean;
  removeLabel?: string;
  className?: string;
}

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  size = "md",
  removable,
  removeLabel,
  className,
}: QuantityStepperProps) {
  const t = useT();
  const btn = size === "sm" ? "size-9" : "size-11";
  const showTrash = removable && value <= 1;

  return (
    <div
      className={cn("inline-flex items-center rounded-full bg-muted p-1 ring-1 ring-inset ring-line", className)}
      role="group"
      aria-label={t("item.quantity")}
    >
      <motion.button
        type="button"
        whileTap={{ scale: 0.85 }}
        className={cn(btn, "pressable grid place-items-center rounded-full bg-surface text-fg shadow-sm ring-1 ring-inset ring-line disabled:opacity-40")}
        onClick={() => onChange(value - 1)}
        disabled={!removable && value <= min}
        aria-label={showTrash ? (removeLabel ?? t("item.decrease")) : t("item.decrease")}
      >
        {showTrash ? <Trash2 className="size-4" aria-hidden /> : <Minus className="size-4" aria-hidden />}
      </motion.button>
      <span
        className={cn(
          "relative overflow-hidden text-center font-semibold tabular",
          size === "sm" ? "w-8 text-sm" : "w-10 text-base",
        )}
        aria-live="polite"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={value}
            className="inline-block"
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -10, opacity: 0 }}
            transition={{ duration: 0.16 }}
          >
            {value}
          </motion.span>
        </AnimatePresence>
      </span>
      <motion.button
        type="button"
        whileTap={{ scale: 0.85 }}
        className={cn(btn, "pressable grid place-items-center rounded-full bg-surface text-fg shadow-sm ring-1 ring-inset ring-line disabled:opacity-40")}
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label={t("item.increase")}
      >
        <Plus className="size-4" aria-hidden />
      </motion.button>
    </div>
  );
}
