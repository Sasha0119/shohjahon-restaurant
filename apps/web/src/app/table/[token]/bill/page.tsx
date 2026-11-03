"use client";

import { brand } from "@app/config";
import { allowedAmounts, applyPercent, suggestedAmount, type SplitModeKey } from "@app/shared";
import type { BillDTO, PaymentDTO } from "@app/shared/api";
import { AnimatePresence, motion } from "framer-motion";
import {
  Banknote,
  Check,
  CircleCheckBig,
  CreditCard,
  Loader2,
  Lock,
  ReceiptText,
  Smartphone,
  Tag,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useGuest } from "@/components/guest/guest-context";
import { PageHeader } from "@/components/guest/page-header";
import { RatingPanel } from "@/components/guest/rating-panel";
import { haptic } from "@/components/guest/use-quick-add";
import { Button, LinkButton } from "@/components/ui/button";
import { Badge, EmptyState, Segmented, Skeleton } from "@/components/ui/misc";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { useT } from "@/i18n";
import { ApiClientError, api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatPercent, formatPrice, parsePrice } from "@/lib/format";
import { useSessionStore } from "@/store/session-store";
import { useTableStore } from "@/store/table-store";

type Method = "card" | "applePay" | "googlePay" | "cash";
type Outcome = { kind: "success"; payment: PaymentDTO; settled: boolean } | { kind: "declined"; reason: string } | { kind: "cash"; amount: number };

const newKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-pay`;

export default function BillPage() {
  const t = useT();
  const { base, table, menuState } = useGuest();
  const snapshot = useSessionStore((s) => s.snapshot);
  const tableLabel = t("common.table", { number: table.number });

  // Make sure the bill is fresh when the page opens.
  useEffect(() => {
    void api<{ bill: BillDTO }>("GET", "/api/session/bill")
      .then(({ bill }) => useSessionStore.getState().setBill(bill))
      .catch(() => {});
  }, []);

  if (!snapshot || !menuState.menu) {
    return (
      <main>
        <PageHeader title={t("bill.title")} subtitle={t("bill.subtitle", { table: tableLabel })} />
        <div className="space-y-3 p-4" aria-busy="true">
          <Skeleton className="h-72 w-full rounded-card" />
          <Skeleton className="h-40 w-full rounded-card" />
        </div>
      </main>
    );
  }

  const live = snapshot.orders.filter((o) => o.status !== "cancelled");
  if (live.length === 0) {
    return (
      <main>
        <PageHeader title={t("bill.title")} subtitle={t("bill.subtitle", { table: tableLabel })} />
        <EmptyState
          icon={ReceiptText}
          title={t("bill.emptyTitle")}
          body={t("bill.emptyBody")}
          action={
            <LinkButton href={`${base}/menu`} size="lg">
              {t("cart.browse")}
            </LinkButton>
          }
        />
      </main>
    );
  }

  return (
    <main>
      <PageHeader title={t("bill.title")} subtitle={t("bill.subtitle", { table: tableLabel })} />
      <div className="space-y-5 px-4 pt-5">
        <Receipt bill={snapshot.bill} />
        <DiscountCode bill={snapshot.bill} />
        <PayPanel bill={snapshot.bill} />
      </div>
    </main>
  );
}

// ── Itemised bill ───────────────────────────────────────────────────────────
function Receipt({ bill }: { bill: BillDTO }) {
  const t = useT();
  const orders = useSessionStore((s) => s.snapshot?.orders ?? []);
  const claimed = new Set(bill.claimedOrderItemIds);
  const lines = orders.filter((o) => o.status !== "cancelled").flatMap((o) => o.lines);

  return (
    <section aria-labelledby="receipt" className="relative overflow-hidden rounded-card bg-surface shadow-soft ring-1 ring-line/60">
      <div className="p-5">
        <h2 id="receipt" className="text-lg font-semibold">
          {t("bill.yourOrder")}
        </h2>
        <ul className="mt-4 space-y-3">
          {lines.map((l) => (
            <li key={l.id} className="flex justify-between gap-4 text-[15px]">
              <span className="min-w-0">
                <span className="font-semibold tabular">{l.quantity}×</span> {l.name}
                {claimed.has(l.id) && (
                  <Badge tone="success" className="ml-2 align-middle">
                    {t("pay.alreadyPaid")}
                  </Badge>
                )}
                {l.modifiers.length > 0 && <span className="block text-sm text-fg-muted">{l.modifiers.map((m) => m.option).join(" · ")}</span>}
              </span>
              <span className="tabular">{formatPrice(l.unitPriceCents * l.quantity)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div aria-hidden className="relative h-4">
        <span className="absolute -left-2 top-1/2 size-4 -translate-y-1/2 rounded-full bg-bg ring-1 ring-line/60" />
        <span className="absolute -right-2 top-1/2 size-4 -translate-y-1/2 rounded-full bg-bg ring-1 ring-line/60" />
        <span className="absolute inset-x-4 top-1/2 border-t-2 border-dashed border-line" />
      </div>
      <dl className="space-y-2 p-5 text-[15px]">
        <Row label={t("bill.subtotal")} value={formatPrice(bill.subtotalCents)} />
        {bill.comboDiscountCents > 0 && <Row label={t("bill.comboSavings")} value={`−${formatPrice(bill.comboDiscountCents)}`} tone="success" />}
        {bill.codeDiscountCents > 0 && bill.discountCode && (
          <Row label={t("pay.codeDiscount", { code: bill.discountCode })} value={`−${formatPrice(bill.codeDiscountCents)}`} tone="success" />
        )}
        {brand.serviceChargePercent > 0 && (
          <Row label={t("bill.serviceCharge", { percent: formatPercent(brand.serviceChargePercent) })} value={formatPrice(bill.serviceChargeCents)} />
        )}
        <Row label={t("bill.tax", { percent: formatPercent(brand.taxPercent) })} value={formatPrice(bill.taxCents)} />
        <div className="flex items-baseline justify-between border-t border-dashed border-line pt-3">
          <dt className="text-lg font-semibold">{t("bill.total")}</dt>
          <dd className="font-display text-[1.75rem] font-semibold tabular">
            <Amount value={bill.totalCents} />
          </dd>
        </div>
        {bill.paidCents > 0 && <Row label={t("pay.paidSoFar")} value={`−${formatPrice(bill.paidCents)}`} tone="success" />}
        {bill.pendingCents > 0 && <Row label={t("pay.pending")} value={formatPrice(bill.pendingCents)} />}
        {(bill.paidCents > 0 || bill.pendingCents > 0) && <Row label={t("pay.outstanding")} value={formatPrice(bill.outstandingCents)} strong />}
      </dl>
    </section>
  );
}

function Row({ label, value, tone, strong }: { label: string; value: string; tone?: "success"; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-4", strong ? "font-semibold" : "text-fg-muted", tone === "success" && "text-success")}>
      <dt>{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}

function Amount({ value }: { value: number }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span key={value} className="inline-block" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -12, opacity: 0 }} transition={{ duration: 0.22 }}>
        {formatPrice(value)}
      </motion.span>
    </AnimatePresence>
  );
}

// ── Discount code ───────────────────────────────────────────────────────────
function DiscountCode({ bill }: { bill: BillDTO }) {
  const t = useT();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = bill.paidCents > 0 || bill.pendingCents > 0;

  const apply = (r: { version: number | null; bill: BillDTO }) => {
    const s = useSessionStore.getState();
    if (r.version === null || s.applyBill(r.version, r.bill) !== "apply") s.setBill(r.bill);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ version: number | null; bill: BillDTO }>("POST", "/api/session/discount", { code });
      apply(r);
      toast.success(t("pay.codeApplied", { code: r.bill.discountCode ?? code.toUpperCase() }));
      setCode("");
    } catch (err) {
      if (err instanceof ApiClientError && ["INVALID_CODE", "CODE_USED_UP", "CODE_MIN_SUBTOTAL", "PAYMENTS_STARTED"].includes(err.code)) {
        const min = (err.details as { minSubtotalCents?: number })?.minSubtotalCents ?? 0;
        setError(t(`pay.codeErrors.${err.code as "INVALID_CODE"}`, { amount: formatPrice(min) }));
      } else setError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      apply(await api<{ version: number | null; bill: BillDTO }>("DELETE", "/api/session/discount"));
      toast.info(t("pay.codeRemoved"));
    } catch {
      toast.error(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  };

  if (bill.discountCode) {
    return (
      <section className="flex items-center gap-3 rounded-card bg-success/8 p-4 ring-1 ring-success/30">
        <Tag className="size-5 text-success" aria-hidden />
        <p className="flex-1 font-semibold">
          {bill.discountCode} <span className="font-normal text-fg-muted">· −{formatPrice(bill.codeDiscountCents)}</span>
        </p>
        {!locked && (
          <Button variant="ghost" size="sm" onClick={() => void remove()} disabled={busy}>
            <X className="size-4" aria-hidden />
            {t("pay.remove")}
          </Button>
        )}
      </section>
    );
  }
  if (locked) return null;

  return (
    <form onSubmit={submit} className="rounded-card bg-surface p-4 shadow-soft ring-1 ring-line/60">
      <label htmlFor="discount" className="text-sm font-semibold">
        {t("pay.discountTitle")}
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="discount"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32))}
          placeholder={t("pay.discountPlaceholder")}
          autoCapitalize="characters"
          autoComplete="off"
          aria-invalid={!!error}
          aria-describedby="discount-error"
          className="h-12 min-w-0 flex-1 rounded-full bg-muted px-4 font-mono tracking-wider placeholder:font-sans placeholder:tracking-normal placeholder:text-fg-muted focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-danger"
        />
        <Button type="submit" variant="secondary" disabled={busy || code.length < 2}>
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {t("pay.apply")}
        </Button>
      </div>
      <p id="discount-error" className="mt-2 min-h-5 text-sm font-medium text-danger" role="alert">
        {error}
      </p>
    </form>
  );
}

// ── Split, tip, method, pay ─────────────────────────────────────────────────
const METHODS: { id: Method; icon: LucideIcon }[] = [
  { id: "card", icon: CreditCard },
  { id: "applePay", icon: Smartphone },
  { id: "googlePay", icon: Wallet },
  { id: "cash", icon: Banknote },
];

function PayPanel({ bill }: { bill: BillDTO }) {
  const t = useT();
  const orders = useSessionStore((s) => s.snapshot?.orders ?? []);
  const tip = useTableStore((s) => s.tip);
  const setTip = useTableStore((s) => s.setTip);
  const [mode, setMode] = useState<SplitModeKey>("full");
  const [people, setPeople] = useState(2);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [customText, setCustomText] = useState("");
  const [tipText, setTipText] = useState("");
  const [method, setMethod] = useState<Method>("card");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const keyRef = useRef<string | null>(null);

  const lines = orders.filter((o) => o.status !== "cancelled").flatMap((o) => o.lines);
  const claimed = new Set(bill.claimedOrderItemIds);
  const selectedSubtotal = lines.filter((l) => picked.has(l.id)).reduce((n, l) => n + l.unitPriceCents * l.quantity, 0);
  const ctx = { total: bill.totalCents, subtotal: bill.subtotalCents, outstanding: bill.outstandingCents };
  const amount = useMemo(
    () => suggestedAmount(mode, ctx, { people, selectedSubtotal, custom: parsePrice(customText) ?? 0 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, bill, people, selectedSubtotal, customText],
  );
  const tipCents = tip.kind === "percent" ? applyPercent(amount, tip.value) : tip.value;
  const evenShares = "exact" in allowedAmounts("even", ctx, { people }) ? (allowedAmounts("even", ctx, { people }) as { exact: number[] }).exact : [];

  // Cash confirmed by a waiter → show success.
  useEffect(() => {
    const onUpdate = (e: Event) => {
      const p = (e as CustomEvent<PaymentDTO>).detail;
      if (outcome?.kind === "cash" && p.status === "succeeded" && p.receiptToken) {
        useTableStore.getState().setLastReceipt(p.receiptToken);
        setOutcome({ kind: "success", payment: p, settled: false });
      }
    };
    window.addEventListener("payment-updated", onUpdate);
    return () => window.removeEventListener("payment-updated", onUpdate);
  }, [outcome]);

  // Changing what you pay = a new payment attempt.
  useEffect(() => {
    keyRef.current = null;
  }, [mode, people, picked, customText, method, tipCents]);

  if (bill.outstandingCents <= 0 && !outcome) {
    return (
      <section className="rounded-card bg-surface p-5 text-center shadow-soft ring-1 ring-line/60">
        <p className="font-semibold">{bill.pendingCents > 0 ? t("pay.cashTitle") : t("pay.nothingToPay")}</p>
      </section>
    );
  }

  const pay = async () => {
    if (amount <= 0) return;
    setBusy(true);
    haptic(20);
    keyRef.current ??= newKey();
    try {
      const res = await fetch("/api/session/payments", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "Idempotency-Key": keyRef.current },
        body: JSON.stringify({
          splitMode: mode,
          method,
          amountCents: amount,
          tipCents,
          ...(mode === "even" ? { people } : {}),
          ...(mode === "items" ? { orderItemIds: [...picked] } : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new ApiClientError(res.status, data?.error?.code ?? "HTTP_ERROR", data?.error?.message ?? "", data?.error?.details);
      keyRef.current = null;
      const payment = data.payment as PaymentDTO;
      useSessionStore.getState().setBill(data.bill as BillDTO);
      if (payment.status === "succeeded") {
        if (payment.receiptToken) useTableStore.getState().setLastReceipt(payment.receiptToken);
        setOutcome({ kind: "success", payment, settled: (data.bill as BillDTO).balanceCents === 0 });
        setPicked(new Set());
      } else if (payment.status === "failed") {
        setOutcome({ kind: "declined", reason: payment.failureReason ?? "declined" });
      } else {
        setOutcome({ kind: "cash", amount: payment.amountCents + payment.tipCents });
      }
    } catch (err) {
      if (!(err instanceof ApiClientError)) {
        toast.error(t("errors.offline")); // keep the key: a retry is recognised as the same payment
      } else {
        keyRef.current = null;
        const code = err.code;
        if (code === "AMOUNT_CHANGED") toast.info(t("pay.amountChanged"));
        else if (code === "ITEMS_ALREADY_PAID") toast.info(t("pay.itemsTaken"));
        else if (code === "NOTHING_TO_PAY") toast.info(t("pay.nothingToPay"));
        else toast.error(err.message || t("errors.generic"));
        void api<{ bill: BillDTO }>("GET", "/api/session/bill").then(({ bill: b }) => useSessionStore.getState().setBill(b)).catch(() => {});
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section aria-labelledby="split" className="rounded-card bg-surface p-5 shadow-soft ring-1 ring-line/60">
        <h2 id="split" className="text-lg font-semibold">
          {t("bill.splitTitle")}
        </h2>
        <Segmented
          className="mt-4"
          label={t("bill.splitTitle")}
          value={mode}
          onChange={setMode}
          options={[
            { value: "full", label: t("bill.splitFull") },
            { value: "even", label: t("bill.splitEvenly") },
            { value: "items", label: t("bill.splitItems") },
            { value: "custom", label: t("bill.splitCustom") },
          ]}
        />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={mode} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
            {mode === "even" && (
              <div className="mt-5">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[15px] font-semibold">{t("bill.people")}</span>
                  <QuantityStepper value={people} min={2} max={20} onChange={setPeople} />
                </div>
                <div className="mt-4 flex items-baseline justify-between rounded-2xl bg-muted/70 px-4 py-3">
                  <span className="text-sm text-fg-muted">{t("bill.eachPays")}</span>
                  <span className="text-lg font-semibold tabular">{formatPrice(Math.min(...(evenShares.length ? evenShares : [amount])))}</span>
                </div>
                {evenShares.length > 1 && <p className="mt-2 text-xs text-fg-muted">{t("bill.unevenNote", { count: 1 })}</p>}
              </div>
            )}
            {mode === "items" && (
              <div className="mt-5">
                <p className="text-sm font-semibold text-fg-muted">{t("bill.selectItems")}</p>
                <ul className="mt-3 overflow-hidden rounded-2xl ring-1 ring-line">
                  {lines.map((l, i) => {
                    const taken = claimed.has(l.id);
                    const on = picked.has(l.id);
                    return (
                      <li key={l.id} className={cn(i > 0 && "border-t border-line/70")}>
                        <label className={cn("flex min-h-14 items-center gap-3 px-4 py-3", taken ? "cursor-not-allowed opacity-50" : "cursor-pointer", on && "bg-primary/6")}>
                          <input
                            type="checkbox"
                            className="peer sr-only"
                            checked={on}
                            disabled={taken}
                            onChange={() => {
                              const next = new Set(picked);
                              if (on) next.delete(l.id);
                              else next.add(l.id);
                              setPicked(next);
                            }}
                          />
                          <span aria-hidden className={cn("grid size-[22px] shrink-0 place-items-center rounded-md border-2 peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2", on || taken ? "border-primary bg-primary text-on-primary" : "border-fg/25")}>
                            {(on || taken) && <Check className="size-3.5" strokeWidth={3.2} />}
                          </span>
                          <span className="flex-1 text-[15px]">
                            <span className="font-semibold tabular">{l.quantity}×</span> {l.name}
                            {taken && <span className="ml-2 text-xs font-semibold text-success">{t("pay.alreadyPaid")}</span>}
                          </span>
                          <span className="text-sm text-fg-muted tabular">{formatPrice(l.unitPriceCents * l.quantity)}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-xs text-fg-muted">{t("bill.includesExtras")}</p>
              </div>
            )}
            {mode === "custom" && (
              <div className="mt-5">
                <label className="text-sm font-semibold" htmlFor="custom-amount">
                  {t("bill.customLabel")}
                </label>
                <MoneyInput id="custom-amount" value={customText} onChange={setCustomText} />
                <p className="mt-2 text-xs text-fg-muted">{t("bill.customMax", { amount: formatPrice(bill.outstandingCents) })}</p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </section>

      <section aria-labelledby="tip" className="rounded-card bg-surface p-5 shadow-soft ring-1 ring-line/60">
        <h2 id="tip" className="text-lg font-semibold">
          {t("bill.tipTitle")}
        </h2>
        <p className="text-sm text-fg-muted">{t("pay.tipOnShare")} · {t("bill.tipSubtitle")}</p>
        <div role="radiogroup" aria-labelledby="tip" className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {brand.tipOptions.map((pct) => (
            <TipChip
              key={pct}
              active={tip.kind === "percent" && tip.value === pct}
              onClick={() => setTip({ kind: "percent", value: pct })}
              title={pct === 0 ? t("bill.tipNone") : formatPercent(pct)}
              sub={pct === 0 ? undefined : formatPrice(applyPercent(amount, pct))}
            />
          ))}
          <TipChip active={tip.kind === "amount"} onClick={() => setTip({ kind: "amount", value: parsePrice(tipText) ?? 0 })} title={t("bill.tipCustom")} />
        </div>
        {tip.kind === "amount" && (
          <div className="mt-4">
            <label className="block text-sm font-semibold" htmlFor="custom-tip">
              {t("bill.tipCustomLabel")}
            </label>
            <MoneyInput
              id="custom-tip"
              value={tipText}
              onChange={(v) => {
                setTipText(v);
                setTip({ kind: "amount", value: parsePrice(v) ?? 0 });
              }}
            />
          </div>
        )}
      </section>

      <section aria-labelledby="method" className="rounded-card bg-surface p-5 shadow-soft ring-1 ring-line/60">
        <h2 id="method" className="text-lg font-semibold">
          {t("bill.method")}
        </h2>
        <div role="radiogroup" aria-labelledby="method" className="mt-4 grid grid-cols-2 gap-2.5">
          {METHODS.map(({ id, icon: Icon }) => {
            const active = method === id;
            return (
              <motion.button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                whileTap={{ scale: 0.97 }}
                onClick={() => setMethod(id)}
                className={cn("relative flex min-h-16 items-center gap-3 rounded-2xl px-4 text-left ring-1 transition-colors", active ? "bg-primary/8 ring-2 ring-primary" : "bg-muted/50 ring-line hover:bg-muted")}
              >
                <Icon className={cn("size-5", active ? "text-primary" : "text-fg-muted")} aria-hidden />
                <span className="text-[15px] font-semibold">{t(`bill.${id}`)}</span>
                {active && (
                  <motion.span layoutId="method-check" className="absolute right-3 grid size-5 place-items-center rounded-full bg-primary text-on-primary">
                    <Check className="size-3" strokeWidth={3.5} aria-hidden />
                  </motion.span>
                )}
              </motion.button>
            );
          })}
        </div>
        {method === "cash" && <p className="mt-3 text-sm text-fg-muted">{t("bill.cashHint")}</p>}
      </section>

      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-20 -mx-4 px-4 pt-2 pb-3">
        <div className="rounded-card bg-surface p-3 shadow-lift ring-1 ring-line/60">
          <div className="flex items-center justify-between px-2 pb-2.5">
            <span className="text-sm font-semibold text-fg-muted">{t("bill.youPay")}</span>
            <span className="font-display text-2xl font-semibold tabular">
              <Amount value={amount + tipCents} />
            </span>
          </div>
          <Button size="lg" className="w-full" onClick={() => void pay()} disabled={busy || amount <= 0} aria-busy={busy}>
            {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Lock className="size-4.5" aria-hidden />}
            {busy ? t("pay.paying") : mode === "items" && picked.size === 0 ? t("pay.selectSomething") : t("pay.payNow", { amount: formatPrice(amount + tipCents) })}
          </Button>
          <p className="mt-2 text-center text-xs text-fg-muted">{t("pay.secure")}</p>
        </div>
      </div>

      <OutcomeSheet outcome={outcome} onClose={() => setOutcome(null)} />
    </>
  );
}

function OutcomeSheet({ outcome, onClose }: { outcome: Outcome | null; onClose: () => void }) {
  const t = useT();
  const sessionId = useSessionStore((s) => s.snapshot?.sessionId);
  const shown = useRef<Outcome | null>(null);
  if (outcome) shown.current = outcome;
  const o = shown.current;
  if (!o) return null;

  const title = o.kind === "success" ? t("pay.successTitle") : o.kind === "declined" ? t("pay.declinedTitle") : t("pay.cashTitle");
  return (
    <Sheet open={!!outcome} onClose={onClose} title={title}>
      <div className="flex flex-col items-center pt-2 text-center">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 16 }}
          className={cn(
            "my-4 grid size-20 place-items-center rounded-full",
            o.kind === "success" ? "bg-success text-white" : o.kind === "declined" ? "bg-danger/12 text-danger" : "bg-primary/12 text-primary",
          )}
        >
          {o.kind === "success" ? <CircleCheckBig className="size-10" aria-hidden /> : o.kind === "declined" ? <X className="size-10" aria-hidden /> : <Banknote className="size-10" aria-hidden />}
        </motion.div>
        <p className="max-w-xs text-[15px] text-fg-muted">
          {o.kind === "success"
            ? `${t("pay.successBody", { amount: formatPrice(o.payment.amountCents + o.payment.tipCents) })}${o.settled ? ` ${t("pay.successSettled")}` : ""}`
            : o.kind === "declined"
              ? t("pay.declined", { reason: o.reason.replace(/_/g, " ") })
              : t("pay.cashBody", { amount: formatPrice(o.amount) })}
        </p>
        {o.kind === "success" && sessionId && !o.settled && <RatingPanel sessionId={sessionId} className="mt-6" />}
        <div className="mt-7 flex w-full flex-col gap-3">
          {o.kind === "success" && o.payment.receiptToken && (
            <Link
              href={`/receipt/${o.payment.receiptToken}`}
              className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-primary px-6 font-semibold text-on-primary shadow-glow"
            >
              <ReceiptText className="size-5" aria-hidden />
              {t("pay.viewReceipt")}
            </Link>
          )}
          <Button variant="secondary" size="lg" onClick={onClose}>
            {t("pay.keepBrowsing")}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

function TipChip({ active, onClick, title, sub }: { active: boolean; onClick: () => void; title: string; sub?: string }) {
  return (
    <motion.button
      type="button"
      role="radio"
      aria-checked={active}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={cn("flex min-h-16 flex-col items-center justify-center rounded-2xl px-2 py-2 ring-1 transition-colors", active ? "bg-primary text-on-primary ring-primary shadow-glow" : "bg-muted/60 ring-line hover:bg-muted")}
    >
      <span className="text-[15px] font-semibold">{title}</span>
      {sub && <span className={cn("text-xs tabular", active ? "opacity-85" : "text-fg-muted")}>{sub}</span>}
    </motion.button>
  );
}

function MoneyInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const symbol = new Intl.NumberFormat(brand.currency.locale, { style: "currency", currency: brand.currency.code }).formatToParts(0).find((p) => p.type === "currency")?.value;
  return (
    <div className="relative mt-2">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-semibold text-fg-muted">{symbol}</span>
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, "").slice(0, 9))}
        placeholder="0.00"
        className="h-13 w-full rounded-2xl bg-muted pl-10 pr-4 text-lg font-semibold tabular focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
      />
    </div>
  );
}
