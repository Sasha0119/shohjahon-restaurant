"use client";

import { roundStatus, statusIndex, suggestionsForCart, type OrderStatus } from "@app/shared";
import type { OrderTicketDTO } from "@app/shared/api";
import { Loader2, ShoppingBag } from "lucide-react";
import { useMemo, useState } from "react";
import { CartRow } from "@/components/guest/cart-row";
import { CartSummaryCard } from "@/components/guest/cart-summary";
import { MiniItemCard } from "@/components/guest/food-card";
import { useLineText } from "@/components/guest/line-text";
import { useCartSummary, useGuest } from "@/components/guest/guest-context";
import { PageHeader } from "@/components/guest/page-header";
import { StatusSteps } from "@/components/guest/status-steps";
import { useGuestActions } from "@/components/guest/use-guest-actions";
import { Button, LinkButton } from "@/components/ui/button";
import { Badge, EmptyState, SectionTitle, Skeleton } from "@/components/ui/misc";
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
  const { count } = useCartSummary();
  const tableLabel = t("common.table", { number: table.number });

  const suggestions = useMemo(
    () => suggestionsForCart(cart.map((l) => l.itemId), menuState.menu?.upsells ?? [], menuState.itemsById),
    [cart, menuState],
  );
  const rounds = useMemo(() => groupRounds(orders), [orders]);

  const scrollToOrders = () =>
    requestAnimationFrame(() => document.getElementById("orders")?.scrollIntoView({ behavior: "smooth", block: "start" }));

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

      {/* Phones/tablets: one column (items, suggestions, total, orders).
          Desktop (lg+): the total + "Send" sits in a sticky side panel. */}
      <div className="px-4 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-x-8 lg:px-8 xl:grid-cols-[minmax(0,1fr)_24rem]">
        {cart.length > 0 && (
          <section className="pt-5 lg:col-start-1" aria-labelledby="cart-items">
            <h2 id="cart-items" className="sr-only">
              {t("cart.items", { count })}
            </h2>
            <ul className="card overflow-hidden">
              <>
                {cart.map((line) => (
                  <CartRow key={line.id} line={line} />
                ))}
              </>
            </ul>

            {suggestions.length > 0 && (
              <div className="mt-8">
                <SectionTitle eyebrow title={t("cart.completeMeal")} />
                <div className="no-scrollbar -mx-4 mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
                  {suggestions.map((s) => (
                    <MiniItemCard key={s.id} item={s} />
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {cart.length > 0 && (
          <CartSummaryCard
            onSent={scrollToOrders}
            className="mt-8 lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-5"
          />
        )}

        {rounds.length > 0 && (
          <section id="orders" className="scroll-mt-20 pt-10 lg:col-start-1" aria-labelledby="orders-title">
            <SectionTitle id="orders-title" eyebrow title={t("orders.title")} />
            <div className="mt-4 space-y-4 2xl:grid 2xl:grid-cols-2 2xl:items-start 2xl:gap-4 2xl:space-y-0">
              {rounds.map((r) => (
                <RoundCard key={r.round} round={r} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function RoundCard({ round }: { round: Round }) {
  const t = useT();
  const { cancelRound } = useGuestActions();
  const lineText = useLineText();
  const [busy, setBusy] = useState(false);
  const lines = round.tickets.flatMap((x) => x.lines);
  const live = round.tickets.filter((x) => x.status !== "cancelled");
  const total = live.flatMap((x) => x.lines).reduce((n, l) => n + l.unitPriceCents * l.quantity, 0);
  const cancellable = round.tickets.every((x) => x.status === "received");
  const cancelled = round.status === "cancelled";

  return (
    <article className="enter card p-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-xl font-semibold">{t("orders.round", { number: round.round })}</h3>
          <p className="text-sm text-fg-muted">{t("orders.sentAt", { time: formatTime(round.sentAt) })}</p>
        </div>
        <Badge tone={cancelled ? "danger" : round.status === "served" ? "success" : "primary"}>{t(`status.${round.status}`)}</Badge>
      </header>

      {!cancelled && (
        <div className="mt-5">
          <StatusSteps status={round.status} />
        </div>
      )}

      <ul className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
        {round.tickets.map((ticket) =>
          ticket.lines.map((l) => {
            const text = lineText(l);
            return (
            <li key={l.id} className="flex justify-between gap-3">
              <span className={ticket.status === "cancelled" ? "text-fg-muted line-through" : ""}>
                <span className="font-semibold tabular text-primary">{l.quantity}×</span> {text.name}
                {text.modifiers.length > 0 && <span className="text-fg-muted"> · {text.modifiers.join(", ")}</span>}
                {round.tickets.length > 1 && statusIndex(ticket.status) > statusIndex(round.status) && (
                  <span className="ml-1.5 text-xs font-semibold text-success">{t(`status.${ticket.status}`)}</span>
                )}
              </span>
              <span className="shrink-0 text-fg-muted tabular">{formatPrice(l.unitPriceCents * l.quantity)}</span>
            </li>
            );
          }),
        )}
        {lines.length > 0 && (
          <li className="flex justify-end pt-1 font-semibold tabular">{formatPrice(total)}</li>
        )}
      </ul>

      {cancellable && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted/60 p-3 ring-1 ring-inset ring-line">
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
    </article>
  );
}
