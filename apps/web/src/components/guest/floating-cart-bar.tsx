"use client";

import { AnimatePresence, motion, useAnimationControls } from "framer-motion";
import { ChevronRight, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useT } from "@/i18n";
import { formatPrice } from "@/lib/format";
import { useCartSummary, useGuest } from "./guest-context";

/** Pill above the bottom nav: item count + total. Bumps when something is added. */
export function FloatingCartBar() {
  const t = useT();
  const pathname = usePathname();
  const { base } = useGuest();
  const { count, subtotal } = useCartSummary();
  const controls = useAnimationControls();
  const prev = useRef(count);

  useEffect(() => {
    if (count > prev.current) {
      void controls.start({
        scale: [1, 1.05, 0.98, 1],
        transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
      });
    }
    prev.current = count;
  }, [count, controls]);

  const hidden = pathname?.startsWith(`${base}/cart`) || pathname?.startsWith(`${base}/bill`);
  const visible = count > 0 && !hidden;
  const total = formatPrice(subtotal);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 90, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 90, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          className="fixed inset-x-0 z-30 px-4 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)]"
        >
          <motion.div animate={controls} className="mx-auto max-w-xl">
            <Link
              href={`${base}/cart`}
              aria-label={t("cart.barLabel", { count, total })}
              className="flex h-14 items-center gap-3 rounded-full bg-primary pl-2 pr-5 text-on-primary shadow-glow transition active:scale-[0.98]"
            >
              <span className="relative grid size-10 place-items-center rounded-full bg-on-primary/15">
                <ShoppingBag className="size-5" aria-hidden />
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={count}
                    initial={{ y: -8, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 8, opacity: 0 }}
                    className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-on-primary px-1 text-[11px] font-bold text-primary tabular"
                  >
                    {count}
                  </motion.span>
                </AnimatePresence>
              </span>
              <span className="flex-1 text-[15px] font-semibold">{t("cart.viewCart")}</span>
              <span className="text-[15px] font-bold tabular">{total}</span>
              <ChevronRight className="-mr-1 size-5 opacity-80" aria-hidden />
            </Link>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
