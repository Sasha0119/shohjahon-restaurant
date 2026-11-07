"use client";

import type { Station } from "@app/shared";
import type { BookingTicketDTO } from "@app/shared/api";
import { CalendarClock, ChefHat } from "lucide-react";
import { useLineText } from "@/components/guest/line-text";
import { useNow } from "@/hooks/use-now";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { reservationLabel } from "@/lib/format";

/** Pre-ordered dishes for upcoming bookings, shown above the kitchen's order board. */
export function KitchenBookings({ bookings, stations }: { bookings: BookingTicketDTO[]; stations: Station[] }) {
  const t = useT();
  const lineText = useLineText();
  const now = useNow(1000) ?? Date.now();
  const shown = bookings
    .map((b) => ({ ...b, lines: b.lines.filter((l) => stations.includes(l.station)) }))
    .filter((b) => b.lines.length > 0);
  if (shown.length === 0) return null;

  return (
    <section aria-labelledby="kitchen-bookings" className="shrink-0 px-4 pt-4 md:px-3 md:pt-3 lg:px-4 lg:pt-4">
      <h2
        id="kitchen-bookings"
        className="mb-2 flex items-center gap-2 text-[13px] font-label uppercase tracking-[0.08em] text-primary"
      >
        <CalendarClock className="size-4" aria-hidden />
        {t("kitchen.bookings")}
      </h2>
      <ul className="flex gap-3 overflow-x-auto pb-2">
        {shown.map((b) => {
          const cookNow = now >= Date.parse(b.cookAt);
          return (
            <li
              key={b.id}
              className={cn(
                "glass-card w-64 shrink-0 rounded-card p-3 outline-2 -outline-offset-2",
                cookNow ? "outline-warning" : "outline-transparent",
              )}
            >
              <p className="font-semibold tabular">
                {reservationLabel(b.startsAt)} · {t("kitchen.table", { number: b.tableNumber })}
              </p>
              {cookNow && (
                <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-warning">
                  <ChefHat className="size-4" aria-hidden />
                  {t("kitchen.startCooking")}
                </p>
              )}
              <ul className="mt-2 space-y-1 text-[15px]">
                {b.lines.map((l) => {
                  const text = lineText(l);
                  return (
                    <li key={l.id}>
                      <span className="tabular text-primary">{l.quantity}×</span> {text.name}
                      {text.modifiers.length > 0 && (
                        <span className="block text-sm text-fg-muted">{text.modifiers.join(" · ")}</span>
                      )}
                      {l.note && <span className="block text-sm text-warning">{l.note}</span>}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
