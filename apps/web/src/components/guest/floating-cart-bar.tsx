"use client";

import { ChevronRight, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { useCartSummary, useGuest } from "./guest-context";

/**
 * Pill above the bottom nav: item count + total. Bumps when something is added.
 * md+: floats at the bottom beside the nav rail. xl+ on the menu: hidden — the
 * cart panel beside the menu shows the cart instead.
 */
export function FloatingCartBar() {
  const t = useT();
  const pathname = usePathname();
  const { base } = useGuest();
  const { count, subtotal } = useCartSummary();
  // A new key restarts the nudge each time something is added.
  const prev = useRef(count);
  const bumps = useRef(0);
  if (count > prev.current) bumps.current += 1;
  prev.current = count;

  const hidden = pathname?.startsWith(`${base}/cart`) || pathname?.startsWith(`${base}/bill`);
  const onMenu = pathname?.startsWith(`${base}/menu`);
  const visible = count > 0 && !hidden;
  const total = formatPrice(subtotal);

  return (
    <>
      {visible && (
        <div
          className={cn(
            "enter fixed inset-x-0 z-30 px-4 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)]",
            "md:bottom-[calc(env(safe-area-inset-bottom)+1.25rem)] md:left-[calc(6rem+env(safe-area-inset-left))]",
            onMenu && "xl:hidden",
          )}
        >
          <div key={bumps.current} className={cn("mx-auto max-w-xl", bumps.current > 0 && "bump")}>
            <Link
              href={`${base}/cart`}
              aria-label={t("cart.barLabel", { count, total })}
              className="glass-accent pressable flex h-[3.75rem] items-center gap-3 rounded-card pl-2 pr-5"
            >
              <span className="relative grid size-11 place-items-center rounded-full bg-on-primary/12 ring-1 ring-on-primary/20">
                <ShoppingBag className="size-5" aria-hidden />
                <span
                  key={count}
                  className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-on-primary px-1 text-[11px] font-bold text-primary tabular"
                >
                  {count}
                </span>
              </span>
              <span className="flex-1 truncate text-[15px] font-semibold tracking-[0.01em]">{t("cart.viewCart")}</span>
              <span className="text-[15px] font-bold tabular">{total}</span>
              <ChevronRight className="-mr-1 size-5 opacity-80" aria-hidden />
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
