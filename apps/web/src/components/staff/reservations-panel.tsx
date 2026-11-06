"use client";

import type { ReservationDTO } from "@app/shared/api";
import { CalendarClock, Phone, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useT } from "@/i18n";
import { translateError } from "@/i18n/errors";
import { api } from "@/lib/api";
import { reservationLabel } from "@/lib/format";

/**
 * Upcoming online reservations, for the waiter floor and the admin tables page.
 * `refreshOn` is the screen's table list: it reloads whenever that changes, and
 * table:status fires for every new or cancelled reservation.
 */
export function ReservationsPanel({ refreshOn, className }: { refreshOn: unknown; className?: string }) {
  const t = useT();
  const [rows, setRows] = useState<ReservationDTO[] | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ reservations: ReservationDTO[] }>("GET", "/api/waiter/reservations")
      .then((r) => setRows(r.reservations))
      .catch(() => {
        /* retried on the next table change */
      });
  }, []);
  useEffect(load, [load, refreshOn]);

  const cancel = async (id: string) => {
    try {
      await api("POST", `/api/waiter/reservations/${id}/cancel`);
      toast.success(t("reservations.cancelled"));
    } catch (e) {
      toast.error(translateError(e, t));
    }
    setConfirming(null);
    load();
  };

  return (
    <section aria-labelledby="reservations-title" className={className}>
      <h2 id="reservations-title" className="flex items-center gap-2 text-[13px] font-label uppercase tracking-[0.08em] text-primary">
        <CalendarClock className="size-4" aria-hidden />
        {t("reservations.title")}
      </h2>
      {rows && rows.length === 0 && <p className="mt-2 text-sm text-fg-muted">{t("reservations.none")}</p>}
      {rows && rows.length > 0 && (
        <ul className="mt-2 max-h-80 divide-y divide-line overflow-y-auto">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <div className="min-w-[10rem] flex-1">
                <p className="font-semibold tabular">
                  {reservationLabel(r.startsAt)} · {t("kitchen.table", { number: r.tableNumber })}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-fg-muted">
                  <span>{r.guestName}</span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="size-3.5" aria-hidden />
                    {r.partySize}
                  </span>
                  <a href={`tel:${r.guestPhone}`} className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
                    <Phone className="size-3.5" aria-hidden />
                    {r.guestPhone}
                  </a>
                </p>
              </div>
              {confirming === r.id ? (
                <Button size="sm" variant="danger" onClick={() => void cancel(r.id)}>
                  {t("reservations.confirmCancel")}
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setConfirming(r.id)}>
                  {t("reservations.cancel")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
