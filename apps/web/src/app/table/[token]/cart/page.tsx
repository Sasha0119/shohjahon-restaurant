"use client";

import { roundStatus, statusIndex, suggestionsForCart, type OrderStatus } from "@app/shared";
import type { CartLineDTO, OrderTicketDTO } from "@app/shared/api";
import { AnimatePresence, motion } from "framer-motion";
import { ChefHat, Loader2, ShoppingBag } from "lucide-react";
import Image from "next/image";
import { useMemo, useState } from "react";
import { MiniItemCard } from "@/components/guest/food-card";
import { useCartSummary, useGuest } from "@/components/guest/guest-context";
import { PageHeader } from "@/components/guest/page-header";
import { StatusSteps } from "@/components/guest/status-steps";
import { useGuestActions } from "@/components/guest/use-guest-actions";
import { haptic } from "@/components/guest/use-quick-add";
import { Button, LinkButton } from "@/components/ui/button";
import { Badge, EmptyState, SectionTitle, Skeleton } from "@/components/ui/misc";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { toast } from "@/components/ui/toast";
import { useT } from "@/i18n";
import { formatPrice, formatTime } from "@/lib/format";
import { useSessionStore } from "@/store/session-store";

interface Round {
  round: number;
  tickets: OrderTicketDTO[];
  status: OrderStatus;
  sentAt: number;
}

/** Kitchen and bar tickets of the same round → one card for the guest. */
function groupRounds(orders: OrderTicketDTO[]): Round[] {
  const map = new Map<number, OrderTicketDTO[]>();
  for (const o of orders) map.set(o.round, [...(map.get(o.round) ?? []), o]);
  return [...map.entries()]
    .map(([round, tickets]) => ({
      round,
      tickets,
      status: roundStatus(tickets.map((x) => x.status)),
      sentAt: Math.min(...tickets.map((x) => Date.parse(x.createdAt))),
    }))
    .sort((a, b) => b.round - a.round);
}

export default function CartPage() {
  const t = useT();
  const { base, table, menuState } = useGuest();
  const cart = useSessionStore((s) => s.snapshot?.cart ?? []);
  const orders = useSessionStore((s) => s.snapshot?.orders ?? []);
  const { sendToKitchen } = useGuestActions();
  const { count, subtotal } = useCartSummary();
  const [sending, setSending] = useState(false);
  const tableLabel = t("common.table", { number: table.number });

  const suggestions = useMemo(
    () => suggestionsForCart(cart.map((l) => l.itemId), menuState.menu?.upsells ?? [], menuState.itemsById),
    [cart, menuState],
  );
  const rounds = useMemo(() => groupRounds(orders), [orders]);

  const send = async () => {
    setSending(true);
    haptic(25);
    const ok = await sendToKitchen();
    setSending(false);
    if (ok) {
      toast.success(t("cart.sent"), t("cart.sentBody"));
      requestAnimationFrame(() => document.getElementById("orders")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  if (!menuState.menu) {
    return (
      <main>
        <PageHeader title={t("cart.title")} subtitle={t("cart.subtitle", { table: tableLabel })} />
        <div className="space-y-3 p-4" aria-busy="true">
          <Skeleton className="h-24 w-full rounded-card" />
          <Skeleton className="h-24 w-full rounded-card" />
        </div>
      </main>
    );
  }

  return (
    <main>
      <PageHeader title={t("cart.title")} subtitle={t("cart.subtitle", { table: tableLabel })} />

      {cart.length === 0 && orders.length === 0 && (
        <EmptyState
          icon={ShoppingBag}
          title={t("cart.emptyTitle")}
          body={t("cart.emptyBody")}
          action={
            <LinkButton href={`${base}/menu`} size="lg">
              {t("cart.browse")}
            </LinkButton>
          }
        />
      )}

      {cart.length > 0 && (
        <section className="px-4 pt-5" aria-labelledby="cart-items">
          <h2 id="cart-items" className="sr-only">
            {t("cart.items", { count })}
          </h2>
          <ul className="overflow-hidden rounded-card bg-surface shadow-soft ring-1 ring-line/60">
            <AnimatePresence initial={false}>
              {cart.map((line) => (
                <CartRow key={line.id} line={line} />
              ))}
            </AnimatePresence>
          </ul>

          {suggestions.length > 0 && (
            <div className="mt-8">
              <SectionTitle title={t("cart.completeMeal")} />
              <div className="no-scrollbar -mx-4 mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
                {suggestions.map((s) => (
                  <MiniItemCard key={s.id} item={s} />
                ))}
              </div>
            </div>
          )}

          <div className="mt-8 rounded-card bg-surface p-5 shadow-soft ring-1 ring-line/60">
            <div className="flex items-baseline justify-between">
              <span className="font-semibold">{t("cart.subtotal")}</span>
              <span className="text-xl font-bold tabular">{formatPrice(subtotal)}</span>
            </div>
            <p className="mt-1 text-sm text-fg-muted">{t("cart.extrasNote")}</p>
            <Button size="lg" className="mt-5 w-full" onClick={() => void send()} disabled={sending} aria-busy={sending}>
              {sending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <ChefHat className="size-5" aria-hidden />}
              {t("cart.send")} · {formatPrice(subtotal)}
            </Button>
          </div>
        </section>
      )}

      {rounds.length > 0 && (
        <section id="orders" className="scroll-mt-20 px-4 pt-10" aria-labelledby="orders-title">
          <SectionTitle id="orders-title" title={t("orders.title")} />
          <div className="mt-4 space-y-4">
            {rounds.map((r) => (
              <RoundCard key={r.round} round={r} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function CartRow({ line }: { line: CartLineDTO }) {
  const t = useT();
  const { menuState, openItem } = useGuest();
  const meId = useSessionStore((s) => s.snapshot?.me.id);
  const { setQuantity } = useGuestActions();
  const item = menuState.itemsById.get(line.itemId);
  const by = line.guestId === meId ? t("common.you") : line.addedBy || t("common.guest");
  const options = item
    ? item.modifierGroups.flatMap((g) => (line.selection[g.id] ?? []).map((id) => g.options.find((o) => o.id === id)?.name).filter(Boolean))
    : [];
  const name = item?.name ?? t("cart.unavailableItem");

  return (
    <motion.li
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.22 } }}
      className="border-b border-line/70 last:border-b-0"
    >
      <div className="flex gap-3.5 p-4">
        <button
          type="button"
          onClick={() => item && openItem(item.id)}
          className="relative size-[4.5rem] shrink-0 overflow-hidden rounded-2xl bg-muted"
          aria-label={name}
        >
          {item && <Image src={item.image} alt="" fill sizes="80px" className={item.inStock ? "object-cover" : "object-cover grayscale"} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="font-semibold leading-snug">{name}</p>
            <p className="font-semibold tabular">{formatPrice(line.unitPriceCents * line.quantity)}</p>
          </div>
          {item && !item.inStock && <Badge tone="danger" className="mt-1">{t("menu.soldOut")}</Badge>}
          {options.length > 0 && <p className="mt-0.5 text-sm text-fg-muted">{options.join(" · ")}</p>}
          {line.note && <p className="mt-0.5 text-sm italic text-fg-muted">“{line.note}”</p>}
          <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-fg-muted">
            <span className="grid size-4 shrink-0 place-items-center rounded-full bg-primary text-[10px] text-on-primary" aria-hidden>
              {by.charAt(0).toUpperCase()}
            </span>
            <span className="truncate">{t("cart.addedBy", { name: by })}</span>
          </p>
          <div className="mt-2 flex justify-end">
            <QuantityStepper
              size="sm"
              removable
              min={0}
              value={line.quantity}
              onChange={(q) => void setQuantity(line.id, q)}
              removeLabel={t("cart.remove", { name })}
            />
          </div>
        </div>
      </div>
    </motion.li>
  );
}

function RoundCard({ round }: { round: Round }) {
  const t = useT();
  const { cancelRound } = useGuestActions();
  const [busy, setBusy] = useState(false);
  const lines = round.tickets.flatMap((x) => x.lines);
  const live = round.tickets.filter((x) => x.status !== "cancelled");
  const total = live.flatMap((x) => x.lines).reduce((n, l) => n + l.unitPriceCents * l.quantity, 0);
  const cancellable = round.tickets.every((x) => x.status === "received");
  const cancelled = round.status === "cancelled";

  return (
    <motion.article layout initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="rounded-card bg-surface p-5 shadow-soft ring-1 ring-line/60">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{t("orders.round", { number: round.round })}</h3>
          <p className="text-sm text-fg-muted">{t("orders.sentAt", { time: formatTime(round.sentAt) })}</p>
        </div>
        <Badge tone={cancelled ? "danger" : round.status === "served" ? "success" : "primary"}>{t(`status.${round.status}`)}</Badge>
      </header>

      {!cancelled && (
        <div className="mt-5">
          <StatusSteps status={round.status} />
        </div>
      )}

      <ul className="mt-5 space-y-1.5 border-t border-line/70 pt-4 text-sm">
        {round.tickets.map((ticket) =>
          ticket.lines.map((l) => (
            <li key={l.id} className="flex justify-between gap-3">
              <span className={ticket.status === "cancelled" ? "text-fg-muted line-through" : ""}>
                <span className="font-semibold tabular">{l.quantity}×</span> {l.name}
                {l.modifiers.length > 0 && <span className="text-fg-muted"> · {l.modifiers.map((m) => m.option).join(", ")}</span>}
                {round.tickets.length > 1 && statusIndex(ticket.status) > statusIndex(round.status) && (
                  <span className="ml-1.5 text-xs font-semibold text-success">{t(`status.${ticket.status}`)}</span>
                )}
              </span>
              <span className="text-fg-muted tabular">{formatPrice(l.unitPriceCents * l.quantity)}</span>
            </li>
          )),
        )}
        {lines.length > 0 && (
          <li className="flex justify-end pt-1 font-semibold tabular">{formatPrice(total)}</li>
        )}
      </ul>

      {cancellable && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted/70 p-3">
          <p className="text-sm text-fg-muted">{t("orders.cancelHint")}</p>
          <Button
            variant="danger"
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              if (await cancelRound(round.tickets[0]!.id)) toast.info(t("orders.cancelled"));
              setBusy(false);
            }}
          >
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {t("orders.cancel")}
          </Button>
        </div>
      )}
    </motion.article>
  );
}
