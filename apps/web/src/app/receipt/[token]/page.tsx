"use client";

import { brand } from "@app/config";
import type { ReceiptDTO } from "@app/shared/api";
import { motion } from "framer-motion";
import { CircleCheckBig, Loader2, Mail, Printer, ReceiptText } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/brand/theme-toggle";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { useT } from "@/i18n";
import { ApiClientError, api } from "@/lib/api";
import { formatPrice } from "@/lib/format";

/** Public, unguessable receipt link. Always readable on paper. */
export default function ReceiptPage() {
  const t = useT();
  const { token } = useParams<{ token: string }>();
  const [receipt, setReceipt] = useState<ReceiptDTO | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    api<{ receipt: ReceiptDTO }>("GET", `/api/receipts/${encodeURIComponent(token)}`)
      .then((r) => setReceipt(r.receipt))
      .catch(() => setMissing(true));
  }, [token]);

  if (missing) return <main className="grid min-h-svh place-items-center"><EmptyState icon={ReceiptText} title={t("receipt.notFound")} /></main>;

  return (
    <main className="min-h-svh px-4 py-8 print:p-0">
      <div className="mx-auto flex max-w-md items-center justify-between print:hidden">
        <div className="flex items-center gap-2.5">
          <Logo size={36} />
          <span className="font-display text-lg font-semibold">{brand.name}</span>
        </div>
        <ThemeToggle />
      </div>

      {!receipt ? (
        <Skeleton className="mx-auto mt-6 h-[32rem] max-w-md rounded-card" />
      ) : (
        <motion.article
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto mt-6 max-w-md rounded-card bg-white p-6 text-[#1b1b1b] shadow-lift ring-1 ring-black/5 print:shadow-none print:ring-0"
        >
          <header className="text-center">
            <CircleCheckBig className="mx-auto size-10 text-[#1f7a4d]" aria-hidden />
            <h1 className="mt-3 font-display text-2xl font-semibold">{brand.name}</h1>
            <p className="mt-1 text-sm text-[#555]">
              {t("receipt.number", { number: receipt.number })} · {t("receipt.table", { number: receipt.tableNumber })}
            </p>
            <p className="text-sm text-[#555]">
              {new Intl.DateTimeFormat(brand.currency.locale, { dateStyle: "medium", timeStyle: "short", timeZone: brand.timezone }).format(new Date(receipt.issuedAt))}
            </p>
            {brand.contact.address && <p className="mt-1 text-xs text-[#777]">{brand.contact.address}</p>}
          </header>

          <ul className="mt-6 space-y-2 border-t border-dashed border-[#ccc] pt-4 text-[15px]">
            {receipt.lines.map((l, i) => (
              <li key={i} className="flex justify-between gap-4">
                <span>
                  <span className="font-semibold tabular">{l.quantity}×</span> {l.name}
                  {l.options.length > 0 && <span className="block text-sm text-[#666]">{l.options.join(" · ")}</span>}
                </span>
                <span className="tabular">{formatPrice(l.unitPriceCents * l.quantity)}</span>
              </li>
            ))}
          </ul>

          <dl className="mt-4 space-y-1.5 border-t border-dashed border-[#ccc] pt-4 text-[15px] text-[#444]">
            <Line label={t("bill.subtotal")} value={formatPrice(receipt.bill.subtotalCents)} />
            {receipt.bill.comboDiscountCents > 0 && <Line label={t("bill.comboSavings")} value={`−${formatPrice(receipt.bill.comboDiscountCents)}`} />}
            {receipt.bill.codeDiscountCents > 0 && (
              <Line label={t("pay.codeDiscount", { code: receipt.bill.discountCode ?? "" })} value={`−${formatPrice(receipt.bill.codeDiscountCents)}`} />
            )}
            <Line label={t("bill.serviceCharge", { percent: `${brand.serviceChargePercent}%` })} value={formatPrice(receipt.bill.serviceChargeCents)} />
            <Line label={t("bill.tax", { percent: `${brand.taxPercent}%` })} value={formatPrice(receipt.bill.taxCents)} />
            <div className="flex justify-between pt-1 text-lg font-semibold text-[#1b1b1b]">
              <dt>{t("bill.total")}</dt>
              <dd className="tabular">{formatPrice(receipt.bill.totalCents)}</dd>
            </div>
          </dl>

          <section className="mt-5 rounded-2xl bg-[#f4f4f2] p-4 text-[15px]" aria-labelledby="your-payment">
            <h2 id="your-payment" className="font-semibold">{t("receipt.yourPayment")}</h2>
            <dl className="mt-2 space-y-1 text-[#444]">
              <Line label={t("receipt.method")} value={`${t(`bill.${receipt.payment.method}`)} · ${t(`receipt.splitModes.${receipt.payment.splitMode}`)}`} />
              <Line label={t("receipt.amount")} value={formatPrice(receipt.payment.amountCents)} />
              <Line label={t("receipt.tip")} value={formatPrice(receipt.payment.tipCents)} />
              <div className="flex justify-between font-semibold text-[#1b1b1b]">
                <dt>{t("receipt.charged")}</dt>
                <dd className="tabular">{formatPrice(receipt.payment.chargedCents)}</dd>
              </div>
            </dl>
            <p className="mt-3 border-t border-[#ddd] pt-2 text-sm text-[#555]">
              {receipt.balanceAfterCents === 0
                ? t("receipt.settled")
                : `${t("receipt.paidToDate")}: ${formatPrice(receipt.paidToDateCents)} · ${t("receipt.balanceAfter")}: ${formatPrice(receipt.balanceAfterCents)}`}
            </p>
          </section>
        </motion.article>
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
      toast.error(err instanceof ApiClientError && err.code === "EMAIL_NOT_CONFIGURED" ? t("receipt.emailUnavailable") : err instanceof ApiClientError ? err.message : t("errors.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={send} className="rounded-card bg-surface p-4 shadow-soft ring-1 ring-line/60">
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
          className="h-12 min-w-0 flex-1 rounded-full bg-muted px-4 placeholder:text-fg-muted focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
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
