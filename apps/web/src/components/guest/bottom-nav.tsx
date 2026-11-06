"use client";

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

/**
 * Guest navigation. Phones: a bar along the bottom (thumb reach).
 * Tablets and desktops (md+): a slim rail down the left edge, so it never
 * competes with the sticky page header and leaves the full height for content.
 */
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
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-gold-line/60 glass pb-safe",
        "md:inset-x-auto md:inset-y-0 md:left-0 md:flex md:w-[calc(6rem+env(safe-area-inset-left))] md:flex-col md:border-t-0 md:border-r md:pb-0 md:pl-[env(safe-area-inset-left)]",
      )}
    >
      <ul className="mx-auto flex max-w-xl items-stretch justify-around px-2 md:no-scrollbar md:my-auto md:max-h-svh md:w-full md:flex-col md:justify-center md:gap-1 md:overflow-y-auto md:px-2 md:py-4">
        {items.map(({ key, icon: Icon, href }) => {
          const active = !!href && pathname?.startsWith(href);
          const label = t(`nav.${key}`);
          const content = (
            <>
              <span className="relative grid h-8 w-14 place-items-center">
                {active && (
                  <span
                    className="absolute inset-0 rounded-card bg-primary/12 ring-1 ring-inset ring-gold-line"
                  />
                )}
                <Icon className="relative size-[22px]" strokeWidth={active ? 2.2 : 1.8} aria-hidden />
                {key === "cart" && (
                  <>
                    {count > 0 && (
                      <span
                        key={count}
                        className="enter absolute -top-1 right-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[11px] font-bold text-on-primary ring-2 ring-surface tabular"
                        aria-hidden
                      >
                        {count > 99 ? "99+" : count}
                      </span>
                    )}
                  </>
                )}
              </span>
              <span className="max-w-full truncate px-0.5 text-[11px] font-semibold tracking-wide md:line-clamp-2 md:whitespace-normal md:text-center md:leading-tight">{label}</span>
            </>
          );
          const cls = cn(
            "flex min-h-16 w-full flex-col items-center justify-center gap-0.5 pt-1.5 pb-1 transition-colors",
            "md:min-h-[4.5rem] md:rounded-2xl md:py-2 md:hover:bg-muted/70",
            active ? "text-primary" : "text-fg-muted hover:text-fg",
          );
          return (
            <li key={key} className="min-w-0 flex-1 md:flex-none">
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
