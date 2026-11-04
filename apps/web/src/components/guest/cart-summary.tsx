"use client";

import { AnimatePresence } from "framer-motion";
import { ChefHat, Loader2, ShoppingBag } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { celebrate } from "@/components/ui/success-burst";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { useSessionStore } from "@/store/session-store";
import { CartRow } from "./cart-row";
import { useCartSummary, useGuest } from "./guest-context";
import { useGuestActions } from "./use-guest-actions";
import { haptic } from "./use-quick-add";

/** Subtotal + "Send to kitchen". Used on the cart page and in the desktop cart panel. */
export function CartSummaryCard({ onSent, className }: { onSent?: () => void; className?: string }) {
  const t = useT();
  const { sendToKitchen } = useGuestActions();
  const { subtotal } = useCartSummary();
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    haptic(25);
    const ok = await sendToKitchen();
    setSending(false);
    if (ok) {
      celebrate(t("cart.sent"), t("cart.sentBody"));
      onSent?.();
    }
  };

  return (
    <div className={cn("card p-5", className)}>
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-display text-lg font-semibold">{t("cart.subtotal")}</span>
        <span className="text-xl font-semibold tabular text-primary">{formatPrice(subtotal)}</span>
      </div>
      <span aria-hidden className="gold-rule mt-3 block w-full opacity-60" />
      <p className="mt-1 text-sm text-fg-muted">{t("cart.extrasNote")}</p>
      <Button size="lg" className="mt-5 w-full" onClick={() => void send()} disabled={sending} aria-busy={sending}>
        {sending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <ChefHat className="size-5" aria-hidden />}
        {t("cart.send")} · {formatPrice(subtotal)}
      </Button>
    </div>
  );
}

/**
 * Desktop (xl+) cart beside the menu: the shared cart stays in view while
 * browsing, so there is no floating cart bar on these screens.
 */
export function CartPanel() {
  const t = useT();
  const { base } = useGuest();
  const cart = useSessionStore((s) => s.snapshot?.cart ?? []);
  const { count } = useCartSummary();

  return (
    <aside
      aria-labelledby="cart-panel-title"
      className="sticky top-20 flex max-h-[calc(100svh-6rem)] flex-col"
    >
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 id="cart-panel-title" className="font-display text-xl font-semibold">
          {t("cart.title")}
        </h2>
        {count > 0 && (
          <Link href={`${base}/cart`} className="text-sm font-semibold text-primary hover:underline">
            {t("cart.viewCart")}
          </Link>
        )}
      </div>
      {cart.length === 0 ? (
        <div className="card mt-3 flex flex-col items-center px-5 py-10 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
            <ShoppingBag className="size-5" aria-hidden />
          </span>
          <p className="mt-3 font-semibold">{t("cart.emptyTitle")}</p>
          <p className="mt-1 text-sm text-fg-muted">{t("cart.emptyBody")}</p>
        </div>
      ) : (
        <>
          <ul className="card no-scrollbar mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain" aria-label={t("cart.items", { count })}>
            <AnimatePresence initial={false}>
              {cart.map((line) => (
                <CartRow key={line.id} line={line} compact />
              ))}
            </AnimatePresence>
          </ul>
          <CartSummaryCard className="mt-3 shrink-0" />
        </>
      )}
    </aside>
  );
}
