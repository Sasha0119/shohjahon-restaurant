"use client";

import { AnimatePresence, motion } from "framer-motion";
import { BellRing, ReceiptText, ShoppingBag, UtensilsCrossed, Wifi, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { useCartSummary, useGuest } from "./guest-context";

interface NavItem {
  key: "menu" | "cart" | "bill" | "call" | "wifi";
  icon: LucideIcon;
  href?: string;
}

export function BottomNav() {
  const t = useT();
  const pathname = usePathname();
  const { base, openCallServer } = useGuest();
  const { count } = useCartSummary();

  const items: NavItem[] = [
    { key: "menu", icon: UtensilsCrossed, href: `${base}/menu` },
    { key: "cart", icon: ShoppingBag, href: `${base}/cart` },
    { key: "bill", icon: ReceiptText, href: `${base}/bill` },
    { key: "call", icon: BellRing },
    { key: "wifi", icon: Wifi, href: `${base}/wifi` },
  ];

  return (
    <nav
      aria-label={t("nav.label")}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-gold-line/60 glass pb-safe"
    >
      <ul className="mx-auto flex max-w-xl items-stretch justify-around px-2">
        {items.map(({ key, icon: Icon, href }) => {
          const active = !!href && pathname?.startsWith(href);
          const label = t(`nav.${key}`);
          const content = (
            <>
              <span className="relative grid h-8 w-14 place-items-center">
                {active && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-full bg-primary/12 ring-1 ring-inset ring-gold-line"
                    transition={{ type: "spring", stiffness: 500, damping: 36 }}
                  />
                )}
                <Icon className="relative size-[22px]" strokeWidth={active ? 2.2 : 1.8} aria-hidden />
                {key === "cart" && (
                  <AnimatePresence>
                    {count > 0 && (
                      <motion.span
                        key={count}
                        initial={{ scale: 0.4, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.4, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 600, damping: 20 }}
                        className="absolute -top-1 right-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[11px] font-bold text-on-primary ring-2 ring-surface tabular"
                        aria-hidden
                      >
                        {count > 99 ? "99+" : count}
                      </motion.span>
                    )}
                  </AnimatePresence>
                )}
              </span>
              <span className="max-w-full truncate px-0.5 text-[11px] font-semibold tracking-wide">{label}</span>
            </>
          );
          const cls = cn(
            "flex min-h-16 w-full flex-col items-center justify-center gap-0.5 pt-1.5 pb-1 transition-colors",
            active ? "text-primary" : "text-fg-muted hover:text-fg",
          );
          return (
            <li key={key} className="flex-1">
              {href ? (
                <Link
                  href={href}
                  className={cls}
                  aria-current={active ? "page" : undefined}
                  aria-label={key === "cart" && count > 0 ? t("nav.cartWithCount", { count }) : undefined}
                >
                  {content}
                </Link>
              ) : (
                <button type="button" onClick={openCallServer} className={cls}>
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
