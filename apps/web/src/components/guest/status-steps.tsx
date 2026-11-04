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

/**
 * Live progress: Received → Preparing → Ready → Served. A fine gold rail fills
 * as the kitchen works; a soft light moves along it while the order is still
 * in progress. Labels wrap under each step, so long Uzbek/Russian words fit.
 */
export function StatusSteps({ status }: { status: OrderStatus }) {
  const t = useT();
  const current = statusIndex(status);
  const progress = current <= 0 ? 0 : current / (ORDER_FLOW.length - 1);
  const inProgress = current >= 0 && current < ORDER_FLOW.length - 1;

  return (
    <div role="group" aria-label={t("orders.progress")}>
      <p className="sr-only" aria-live="polite">
        {t(`status.${status}`)}
      </p>
      <div className="relative">
        {/* Rail */}
        <div aria-hidden className="absolute left-[12.5%] right-[12.5%] top-[19px] h-[3px] overflow-hidden rounded-full bg-line">
          <motion.div
            className="relative h-full origin-left overflow-hidden rounded-full bg-primary"
            initial={false}
            animate={{ scaleX: progress }}
            transition={{ type: "spring", stiffness: 90, damping: 20 }}
          >
            {inProgress && (
              <span className="absolute inset-y-0 left-0 w-1/3 animate-sheen bg-gradient-to-r from-transparent via-white/70 to-transparent" />
            )}
          </motion.div>
        </div>
        <ol className="relative grid grid-cols-4 gap-1">
          {ORDER_FLOW.map((step, i) => {
            const Icon = icons[step];
            const done = i < current;
            const active = i === current;
            return (
              <li key={step} className="flex flex-col items-center text-center" aria-current={active ? "step" : undefined} title={t(`status.${step}`)}>
                <motion.span
                  initial={false}
                  animate={{ scale: active ? 1.1 : 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 22 }}
                  className={cn(
                    "grid size-10 place-items-center rounded-full ring-4 ring-surface transition-colors duration-500",
                    done && "bg-primary/15 text-primary ring-1 ring-inset ring-gold-line",
                    active && "bg-primary text-on-primary animate-pulse-ring",
                    !done && !active && "bg-muted text-fg-muted",
                  )}
                >
                  <Icon className="size-[18px]" strokeWidth={1.8} aria-hidden />
                </motion.span>
                <span className="sr-only">{t(`status.${step}`)}</span>
              </li>
            );
          })}
        </ol>
      </div>
      {/* Names don't fit side by side in every language: show the current one, and what's next. */}
      <motion.p
        key={status}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        aria-hidden
        className="mt-3 flex flex-wrap items-baseline justify-center gap-x-2 text-center"
      >
        <span className="font-display text-lg font-semibold text-primary">{t(`status.${status}`)}</span>
        {current >= 0 && current < ORDER_FLOW.length - 1 && (
          <span className="text-sm text-fg-muted">→ {t(`status.${ORDER_FLOW[current + 1]!}`)}</span>
        )}
      </motion.p>
    </div>
  );
}
