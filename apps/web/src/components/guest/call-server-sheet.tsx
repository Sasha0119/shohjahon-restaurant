"use client";

import { BellRing, ChevronRight, Droplets, HandHelping, Loader2, ReceiptText, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useNow } from "@/hooks/use-now";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { formatCountdown } from "@/lib/format";
import { useSessionStore } from "@/store/session-store";
import { useTableStore, type CallType } from "@/store/table-store";
import { useGuest } from "./guest-context";
import { useGuestActions } from "./use-guest-actions";
import { haptic } from "./use-quick-add";

const options: { type: CallType; icon: LucideIcon }[] = [
  { type: "water", icon: Droplets },
  { type: "assistance", icon: HandHelping },
  { type: "bill", icon: ReceiptText },
];

export function CallServerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const { table } = useGuest();
  const cooldownUntil = useTableStore((s) => s.cooldownUntil);
  const openCalls = useSessionStore((s) => s.snapshot?.calls ?? []);
  const { callServer } = useGuestActions();
  const now = useNow(1000) ?? 0;
  const [justSent, setJustSent] = useState<CallType | null>(null);
  const [busy, setBusy] = useState<CallType | null>(null);

  useEffect(() => {
    if (!open) setJustSent(null);
  }, [open]);

  const tableLabel = t("common.table", { number: table.number });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={justSent ? t("call.onTheWay") : t("call.title")}
      description={justSent ? undefined : t("call.subtitle", { table: tableLabel })}
    >
      <>
        {justSent ? (
          <div
            key="sent"
            className="enter flex flex-col items-center pt-4 pb-2 text-center"
          >
            <div className="relative my-4 grid size-24 place-items-center">
              <span className="absolute inset-0 animate-ping rounded-full border border-primary/50" aria-hidden />
              <span className="relative grid size-20 place-items-center rounded-full bg-primary text-on-primary shadow-glow">
                <span className="wiggle">
                  <BellRing className="size-9" aria-hidden />
                </span>
              </span>
            </div>
            <p className="font-display text-2xl font-semibold">{t(`call.${justSent}`)}</p>
            <p className="mt-1 max-w-xs text-[15px] text-fg-muted">{t("call.onTheWayBody")}</p>
            <Button className="mt-7 w-full" size="lg" onClick={onClose}>
              {t("call.done")}
            </Button>
          </div>
        ) : (
          <ul key="options" className="enter mt-5 space-y-3">
            {options.map(({ type, icon: Icon }) => {
              const remaining = (cooldownUntil[type] ?? 0) - now;
              const cooling = remaining > 0;
              const pending = openCalls.some((c) => c.type === type && c.status === "open");
              return (
                <li key={type}>
                  <button
                    type="button"
                    disabled={cooling || busy !== null}
                    aria-busy={busy === type}
                    onClick={async () => {
                      setBusy(type);
                      haptic(20);
                      const call = await callServer(type);
                      setBusy(null);
                      if (call) setJustSent(type);
                    }}
                    className={`pressable ${cn(
                      "flex w-full items-center gap-4 rounded-2xl bg-muted/70 p-4 text-left ring-1 ring-line/60 transition-colors hover:bg-muted",
                      cooling && "opacity-60",
                    )}`}
                  >
                    <span className="grid size-12 shrink-0 place-items-center rounded-full bg-surface text-primary ring-1 ring-gold-line">
                      <Icon className="size-6" strokeWidth={1.7} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-[1.1rem] font-semibold">{t(`call.${type}`)}</span>
                      <span className="block text-sm text-fg-muted">
                        {pending && <span className="font-semibold text-success">{t("call.pending")} · </span>}
                        {cooling
                          ? t("call.cooldown", { time: formatCountdown(remaining) })
                          : t(`call.${type}Hint`)}
                      </span>
                    </span>
                    {busy === type ? (
                      <Loader2 className="size-5 animate-spin text-fg-muted" aria-hidden />
                    ) : (
                      !cooling && <ChevronRight className="size-5 text-fg-muted" aria-hidden />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </>
    </Sheet>
  );
}
