"use client";

import { brand, localize } from "@app/config";
import type { ReceiptDTO } from "@app/shared/api";
import { CircleCheckBig, Loader2, Mail, Printer, ReceiptText } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo, Wordmark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/brand/theme-toggle";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { useI18n, useT } from "@/i18n";
import { translateError } from "@/i18n/errors";
import { ApiClientError, api } from "@/lib/api";
import { formatDate, formatPercent, formatPrice } from "@/lib/format";

/** Public, unguessable receipt link. Always readable on paper. */
export default function ReceiptPage() {
  const { t, locale } = useI18n();
  const tagline = localize(brand.tagline, locale);
  const { token } = useParams<{ token: string }>();
  const [receipt, setReceipt] = useState<ReceiptDTO | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    api<{ receipt: ReceiptDTO }>("GET", `/api/receipts/${encodeURIComponent(token)}`)
      .then((r) => setReceipt(r.receipt))
      .catch(() => setMissing(true));
  }, [token]);

  if (missing)
    return (
      <main className="grid min-h-svh place-items-center">
        <EmptyState icon={ReceiptText} title={t("receipt.notFound")} />
      </main>
    );

  return (
    <main className="min-h-svh px-4 py-8 print:p-0">
      <div className="mx-auto flex max-w-md items-center justify-between print:hidden">
        <Wordmark size={36} />
        <ThemeToggle />
      </div>

      {!receipt ? (
        <Skeleton className="mx-auto mt-6 h-[32rem] max-w-md rounded-card" />
      ) : (
        <article
          // Paper is always ivory, so the logo uses the deep (light-mode) gold here.
          style={{ "--primary-color": "#8A6424" } as React.CSSProperties}
          className="enter relative mx-auto mt-6 max-w-md overflow-hidden rounded-card bg-[#FBF8F2] px-6 pb-7 pt-8 text-[#1d1a15] shadow-lift ring-1 ring-[#C9A45C]/40 print:mt-0 print:shadow-none print:ring-0"
        >
          {/* A gold hairline frame inside the paper edge. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-2.5 rounded-[calc(var(--radius-card)-6px)] ring-1 ring-[#C9A45C]/35"
          />

          <header className="relative text-center">
            <Logo size={58} className="mx-auto" />
            <h1 className="mt-3 font-display text-[1.75rem] font-semibold leading-none tracking-wide">{brand.name}</h1>
            <p className="mt-2 text-[11px] font-label uppercase tracking-[0.08em] text-[#8A6424]">{tagline}</p>
            <GoldRule />
            <p className="text-sm text-[#5a5348]">
              {t("receipt.number", { number: receipt.number })} · {t("receipt.table", { number: receipt.tableNumber })}
            </p>
            <p className="text-sm text-[#5a5348]">
              {formatDate(new Date(receipt.issuedAt), {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: brand.timezone,
              })}
            </p>
            {brand.contact.address && <p className="mt-1 text-xs text-[#7a7264]">{brand.contact.address}</p>}
          </header>

          <ul className="relative mt-6 space-y-2.5 border-t border-dashed border-[#d8cdb8] pt-5 text-[15px]">
            {receipt.lines.map((l, i) => (
              <li key={i} className="flex justify-between gap-4">
                <span className="min-w-0">
                  <span className="font-semibold tabular text-[#8A6424]">{l.quantity}×</span> {l.name}
                  {l.options.length > 0 && (
                    <span className="block text-sm text-[#6b6355]">{l.options.join(" · ")}</span>
                  )}
                </span>
                <span className="shrink-0 tabular">{formatPrice(l.unitPriceCents * l.quantity)}</span>
              </li>
            ))}
          </ul>

          <dl className="relative mt-5 space-y-1.5 border-t border-dashed border-[#d8cdb8] pt-4 text-[15px] text-[#4a443a]">
            <Line label={t("bill.subtotal")} value={formatPrice(receipt.bill.subtotalCents)} />
            {receipt.bill.comboDiscountCents > 0 && (
              <Line label={t("bill.comboSavings")} value={`−${formatPrice(receipt.bill.comboDiscountCents)}`} />
            )}
            {receipt.bill.codeDiscountCents > 0 && (
              <Line
                label={t("pay.codeDiscount", { code: receipt.bill.discountCode ?? "" })}
                value={`−${formatPrice(receipt.bill.codeDiscountCents)}`}
              />
            )}
            <Line
              label={t("bill.serviceCharge", { percent: formatPercent(brand.serviceChargePercent) })}
              value={formatPrice(receipt.bill.serviceChargeCents)}
            />
            {brand.taxPercent > 0 && (
              <Line
                label={t("bill.tax", { percent: formatPercent(brand.taxPercent) })}
                value={formatPrice(receipt.bill.taxCents)}
              />
            )}
            <div className="flex items-baseline justify-between gap-4 border-t border-[#C9A45C]/50 pt-3 text-[#1d1a15]">
              <dt className="font-display text-xl font-semibold">{t("bill.total")}</dt>
              <dd className="font-display text-2xl font-semibold tabular">{formatPrice(receipt.bill.totalCents)}</dd>
            </div>
            {brand.taxPercent === 0 && <p className="text-xs text-[#7a7264]">{t("bill.vatIncluded")}</p>}
          </dl>

          <section
            className="relative mt-6 rounded-2xl bg-[#F3ECDF] p-4 text-[15px] ring-1 ring-inset ring-[#C9A45C]/30"
            aria-labelledby="your-payment"
          >
            <h2 id="your-payment" className="flex items-center gap-2 font-semibold">
              <CircleCheckBig className="size-5 text-[#1f7a4d]" aria-hidden />
              {t("receipt.yourPayment")}
            </h2>
            <dl className="mt-2 space-y-1 text-[#4a443a]">
              <Line
                label={t("receipt.method")}
                value={`${t(`bill.${receipt.payment.method}`)} · ${t(`receipt.splitModes.${receipt.payment.splitMode}`)}`}
              />
              <Line label={t("receipt.amount")} value={formatPrice(receipt.payment.amountCents)} />
              <Line label={t("receipt.tip")} value={formatPrice(receipt.payment.tipCents)} />
              <div className="flex justify-between gap-4 font-semibold text-[#1d1a15]">
                <dt>{t("receipt.charged")}</dt>
                <dd className="tabular">{formatPrice(receipt.payment.chargedCents)}</dd>
              </div>
            </dl>
            <p className="mt-3 border-t border-[#d8cdb8] pt-2 text-sm text-[#5a5348]">
              {receipt.balanceAfterCents === 0
                ? t("receipt.settled")
                : `${t("receipt.paidToDate")}: ${formatPrice(receipt.paidToDateCents)} · ${t("receipt.balanceAfter")}: ${formatPrice(receipt.balanceAfterCents)}`}
            </p>
          </section>

          <p className="relative mt-6 text-center font-display text-lg italic text-[#8A6424]">{t("receipt.thanks")}</p>
        </article>
      )}

      {receipt && (
        <div className="mx-auto mt-5 max-w-md space-y-3 print:hidden">
          <EmailForm token={token} emailedTo={receipt.emailedTo} />
          <Button variant="secondary" className="w-full" onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden />
            {t("receipt.print")}
          </Button>
        </div>
      )}
    </main>
  );
}

/** A short gold rule with a diamond in the middle. */
function GoldRule() {
  return (
    <div aria-hidden className="my-4 flex items-center justify-center gap-2 text-[#C9A45C]">
      <span className="h-px w-14 bg-current opacity-70" />
      <span className="size-1.5 rotate-45 bg-current" />
      <span className="h-px w-14 bg-current opacity-70" />
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt>{label}</dt>
      <dd className="text-right tabular">{value}</dd>
    </div>
  );
}

function EmailForm({ token, emailedTo }: { token: string; emailedTo: string | null }) {
  const t = useT();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState(emailedTo);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("POST", `/api/receipts/${encodeURIComponent(token)}/email`, { email });
      setSentTo(email);
      setEmail("");
      toast.success(t("receipt.sent"));
    } catch (err) {
      toast.error(
        err instanceof ApiClientError && err.code === "EMAIL_NOT_CONFIGURED"
          ? t("receipt.emailUnavailable")
          : translateError(err, t),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={send} className="card p-4">
      <label htmlFor="receipt-email" className="text-sm font-semibold">
        {t("receipt.emailTitle")}
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="receipt-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("receipt.emailPlaceholder")}
          className="h-12 min-w-0 flex-1 rounded-card bg-muted px-4 ring-1 ring-inset ring-line placeholder:text-fg-muted focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <Button type="submit" disabled={busy || !email}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Mail className="size-4" aria-hidden />}
          {t("receipt.send")}
        </Button>
      </div>
      {sentTo && <p className="mt-2 text-sm text-fg-muted">{t("receipt.emailedTo", { email: sentTo })}</p>}
    </form>
  );
}
