"use client";

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
      className={cn("glass-chip inline-flex items-center rounded-card p-1", className)}
      role="group"
      aria-label={t("item.quantity")}
    >
      <button
        type="button"
        className={`pressable ${cn(btn, "pressable grid place-items-center rounded-card bg-surface text-fg shadow-sm ring-1 ring-inset ring-line disabled:opacity-40")}`}
        onClick={() => onChange(value - 1)}
        disabled={!removable && value <= min}
        aria-label={showTrash ? (removeLabel ?? t("item.decrease")) : t("item.decrease")}
      >
        {showTrash ? <Trash2 className="size-4" aria-hidden /> : <Minus className="size-4" aria-hidden />}
      </button>
      <span
        className={cn(
          "relative overflow-hidden text-center font-semibold tabular",
          size === "sm" ? "w-8 text-sm" : "w-10 text-base",
        )}
        aria-live="polite"
      >
        <>
          <span
            key={value}
            className="enter inline-block"
          >
            {value}
          </span>
        </>
      </span>
      <button
        type="button"
        className={`pressable ${cn(btn, "pressable grid place-items-center rounded-card bg-surface text-fg shadow-sm ring-1 ring-inset ring-line disabled:opacity-40")}`}
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label={t("item.increase")}
      >
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}
