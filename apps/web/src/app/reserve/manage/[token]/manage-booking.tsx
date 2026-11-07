"use client";

import type { ManagedBookingDTO } from "@app/shared/api";
import { CalendarCheck, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PublicHeader } from "@/components/brand/public-header";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { translateError } from "@/i18n/errors";
import { api } from "@/lib/api";
import { formatPrice, reservationDay, reservationTimeOf } from "@/lib/format";

/** The guest's own page for one booking, opened from the link they got when booking. */
export function ManageBooking({ token }: { token: string }) {
  const t = useT();
  const [booking, setBooking] = useState<ManagedBookingDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const path = `/api/reservations/manage/${encodeURIComponent(token)}`;

  const load = useCallback(() => {
    api<{ booking: ManagedBookingDTO }>("GET", path)
      .then((r) => setBooking(r.booking))
      .catch((e: unknown) => setError(translateError(e, t)));
  }, [path, t]);
  useEffect(load, [load]);

  const cancel = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("POST", `${path}/cancel`);
      load();
    } catch (e) {
      setError(translateError(e, t));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <main className="min-h-svh">
      <PublicHeader title={t("reserve.manageTitle")} />
      <div className="mx-auto max-w-md px-4 py-8">
        {error && (
          <p role="alert" className="mb-4 text-sm font-semibold text-danger">
            {error}
          </p>
        )}
        {booking && (
          <div className="text-center">
            <CalendarCheck className="mx-auto size-12 text-primary" strokeWidth={1.4} aria-hidden />
            <p className="mt-4 text-lg font-semibold tabular">
              {t("reserve.doneBody", {
                table: booking.tableNumber,
                date: reservationDay(booking.startsAt),
                time: reservationTimeOf(booking.startsAt),
              })}
            </p>
            <p className="mt-1 text-fg-muted">{t("reserve.partyCount", { count: booking.partySize })}</p>
            <ul className="mt-5 space-y-1 text-left text-sm">
              {booking.lines.map((l) => (
                <li key={l.id} className="flex justify-between gap-3">
                  <span>
                    {l.quantity}× {l.name}
                  </span>
                  <span className="tabular">{formatPrice(l.unitPriceCents * l.quantity)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm font-semibold tabular">
              {t("reserve.depositPaid", { amount: formatPrice(booking.depositCents) })}
            </p>

            {booking.status === "cancelled" && (
              <p role="status" className="mt-5 font-semibold">
                {t("reserve.cancelledRefund", { amount: formatPrice(booking.refundCents) })}
              </p>
            )}
            {booking.status === "seated" && <p className="mt-5 font-semibold">{t("reserve.seated")}</p>}
            {booking.status === "active" && booking.refundIfCancelledCents !== null && (
              <div className="mt-6 flex flex-col gap-2">
                <p className="text-sm text-fg-muted">
                  {t("reserve.refundIfCancelled", { amount: formatPrice(booking.refundIfCancelledCents) })}
                </p>
                <Button
                  variant={confirming ? "danger" : "secondary"}
                  disabled={busy}
                  onClick={() => (confirming ? void cancel() : setConfirming(true))}
                >
                  {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
                  {confirming ? t("reserve.confirmCancel") : t("reserve.cancel")}
                </Button>
              </div>
            )}
            {booking.status === "active" && booking.refundIfCancelledCents === null && (
              <p className="mt-6 text-sm text-fg-muted">{t("reserve.tooLateToCancel")}</p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
