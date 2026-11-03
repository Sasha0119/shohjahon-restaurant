"use client";

import { ORDER_FLOW, statusIndex, type OrderStatus } from "@app/shared";
import { motion } from "framer-motion";
import { ChefHat, ClipboardCheck, ConciergeBell, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";

const icons: Record<(typeof ORDER_FLOW)[number], LucideIcon> = {
  received: ClipboardCheck,
  preparing: ChefHat,
  ready: ConciergeBell,
  served: UtensilsCrossed,
};

/** Received → Preparing → Ready → Served, with an animated progress rail. */
export function StatusSteps({ status }: { status: OrderStatus }) {
  const t = useT();
  const current = statusIndex(status);
  const progress = current <= 0 ? 0 : current / (ORDER_FLOW.length - 1);

  return (
    <div role="group" aria-label={t("orders.progress")}>
      <p className="sr-only" aria-live="polite">
        {t(`status.${status}`)}
      </p>
      <div className="relative">
        {/* Rail */}
        <div aria-hidden className="absolute left-[12.5%] right-[12.5%] top-5 h-1 rounded-full bg-muted">
          <motion.div
            className="h-full origin-left rounded-full bg-primary"
            initial={false}
            animate={{ scaleX: progress }}
            transition={{ type: "spring", stiffness: 120, damping: 22 }}
          />
        </div>
        <ol className="relative grid grid-cols-4">
          {ORDER_FLOW.map((step, i) => {
            const Icon = icons[step];
            const done = i < current;
            const active = i === current;
            return (
              <li key={step} className="flex flex-col items-center gap-2" aria-current={active ? "step" : undefined}>
                <motion.span
                  initial={false}
                  animate={{ scale: active ? 1.08 : 1 }}
                  className={cn(
                    "grid size-10 place-items-center rounded-full ring-4 ring-surface transition-colors duration-500",
                    done && "bg-primary text-on-primary",
                    active && "bg-primary text-on-primary animate-pulse-ring",
                    !done && !active && "bg-muted text-fg-muted",
                  )}
                >
                  <Icon className="size-[18px]" aria-hidden />
                </motion.span>
                <span
                  className={cn(
                    "text-xs font-semibold transition-colors",
                    done || active ? "text-fg" : "text-fg-muted",
                  )}
                >
                  {t(`status.${step}`)}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
