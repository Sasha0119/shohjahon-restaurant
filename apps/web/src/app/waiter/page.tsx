"use client";

import type { CallDTO, ReservationSummaryDTO, TableStatusDTO } from "@app/shared/api";
import {
  Banknote,
  BellRing,
  Check,
  Droplets,
  HandHelping,
  Loader2,
  ReceiptText,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ReservationsPanel } from "@/components/staff/reservations-panel";
import { StaffGate } from "@/components/staff/staff-session";
import { StaffHeader, useSoundAlerts } from "@/components/staff/staff-header";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Segmented, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { useNow } from "@/hooks/use-now";
import { useStaffSocket } from "@/hooks/use-staff-socket";
import { useT } from "@/i18n";
import { translateError } from "@/i18n/errors";
import { ApiClientError, api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatPrice, formatRelative, reservationLabel } from "@/lib/format";

const ROLES = ["waiter", "manager"] as const;

interface FloorTable {
  id: string;
  number: number;
  label: string | null;
  seats: number;
  status: TableStatusDTO;
  session: { id: string; guestCount: number; openedAt: string; openCalls: number } | null;
  reservation: ReservationSummaryDTO | null;
}

const CALL_ICON: Record<CallDTO["type"], LucideIcon> = {
  water: Droplets,
  assistance: HandHelping,
  bill: ReceiptText,
  cashPayment: Banknote,
};

const STATUS_TONE: Record<TableStatusDTO, "muted" | "primary" | "warning" | "danger"> = {
  free: "muted",
  seated: "primary",
  ordered: "warning",
  billRequested: "danger",
};

export default function WaiterPage() {
  return (
    <StaffGate roles={[...ROLES]}>
      <Floor />
    </StaffGate>
  );
}

function Floor() {
  const t = useT();
  const sound = useSoundAlerts();
  const [tab, setTab] = useState<"calls" | "tables">("calls");
  const [calls, setCalls] = useState<CallDTO[] | null>(null);
  const [tables, setTables] = useState<FloorTable[] | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [openTable, setOpenTable] = useState<FloorTable | null>(null);
  const callsRef = useRef<CallDTO[] | null>(null);
  callsRef.current = calls;

  const loadCalls = useCallback(async () => {
    try {
      setCalls((await api<{ calls: CallDTO[] }>("GET", "/api/waiter/calls")).calls);
    } catch {
      /* retried on reconnect */
    }
  }, []);
  const loadTables = useCallback(async () => {
    try {
      setTables((await api<{ tables: FloorTable[] }>("GET", "/api/waiter/tables")).tables);
    } catch {
      /* retried on reconnect */
    }
  }, []);
  useEffect(() => {
    void loadCalls();
    void loadTables();
  }, [loadCalls, loadTables]);

  const tablesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTables = () => {
    if (tablesTimer.current) clearTimeout(tablesTimer.current);
    tablesTimer.current = setTimeout(() => void loadTables(), 250);
  };

  const { connected } = useStaffSocket(
    {
      "call:created": ({ call }) => {
        if ((callsRef.current ?? []).some((c) => c.id === call.id)) return;
        sound.play(call.type === "bill" || call.type === "cashPayment");
        setFresh((s) => new Set(s).add(call.id));
        setTimeout(
          () =>
            setFresh((s) => {
              const n = new Set(s);
              n.delete(call.id);
              return n;
            }),
          10_000,
        );
        setCalls((list) => [...(list ?? []).filter((c) => c.id !== call.id), call]);
        refreshTables();
      },
      "call:updated": ({ call }) => {
        if (call.status !== "open") setCalls((list) => (list ?? []).filter((c) => c.id !== call.id));
        refreshTables();
      },
      "table:status": () => refreshTables(),
    },
    () => {
      void loadCalls();
      void loadTables();
    },
  );

  const handle = async (call: CallDTO) => {
    setCalls((list) => (list ?? []).filter((c) => c.id !== call.id));
    try {
      if (call.type === "cashPayment" && call.paymentId && call.sessionId) {
        // Confirms the payment (and closes the alert); the table closes if that settles the bill.
        await api("POST", `/api/waiter/sessions/${call.sessionId}/cash`, { paymentId: call.paymentId });
        toast.success(t("waiter.cashConfirmed", { number: call.tableNumber }));
        return;
      }
      await api("POST", `/api/waiter/calls/${call.id}/handle`);
      toast.success(t("waiter.handled"));
    } catch (e) {
      if (!(e instanceof ApiClientError && e.code === "ALREADY_HANDLED")) {
        toast.error(translateError(e, t));
        void loadCalls();
      }
    }
  };

  return (
    <div className="min-h-svh">
      <StaffHeader title={t("waiter.title")} connected={connected} sound={sound} />
      {/* Phones/tablet portrait: tabs. lg+: calls in a sidebar beside the floor plan, both always visible. */}
      <div className="mx-auto max-w-[110rem] px-4 py-5 lg:grid lg:grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)] lg:items-start lg:gap-6 lg:px-6">
        <Segmented
          className="max-w-sm lg:hidden"
          label={t("waiter.title")}
          value={tab}
          onChange={setTab}
          options={[
            { value: "calls", label: `${t("waiter.tabs.calls")}${calls?.length ? ` · ${calls.length}` : ""}` },
            { value: "tables", label: t("waiter.tabs.tables") },
          ]}
        />

        <section
          aria-labelledby="calls-title"
          className={cn(
            tab === "calls" ? "block" : "hidden",
            "lg:sticky lg:top-24 lg:block lg:max-h-[calc(100svh-7rem)] lg:overflow-y-auto lg:overscroll-contain no-scrollbar",
          )}
        >
          <h2
            id="calls-title"
            className="sr-only lg:not-sr-only lg:mb-3 lg:flex lg:items-center lg:gap-3 lg:px-1 lg:font-sans lg:text-[13px] lg:font-semibold lg:uppercase lg:tracking-[0.2em] lg:text-primary"
          >
            {t("waiter.tabs.calls")}
            {!!calls?.length && (
              <span className="grid h-6 min-w-6 place-items-center rounded-full px-2 text-xs tabular text-fg ring-1 ring-gold-line">
                {calls.length}
              </span>
            )}
          </h2>
          {!calls ? (
            <div className="mt-5 space-y-3 lg:mt-0">
              <Skeleton className="h-24 rounded-card" />
              <Skeleton className="h-24 rounded-card" />
            </div>
          ) : calls.length === 0 ? (
            <EmptyState icon={BellRing} title={t("waiter.noCalls")} body={t("waiter.noCallsBody")} />
          ) : (
            <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:mt-0 lg:grid-cols-1">
              <>
                {calls.map((c) => (
                  <CallCard key={c.id} call={c} fresh={fresh.has(c.id)} onHandle={() => void handle(c)} />
                ))}
              </>
            </ul>
          )}
        </section>

        <section aria-labelledby="tables-title" className={cn(tab === "tables" ? "block" : "hidden", "lg:block")}>
          <h2
            id="tables-title"
            className="sr-only lg:not-sr-only lg:mb-3 lg:flex lg:items-center lg:gap-3 lg:px-1 lg:font-sans lg:text-[13px] lg:font-semibold lg:uppercase lg:tracking-[0.2em] lg:text-primary"
          >
            {t("waiter.tabs.tables")}
          </h2>
          <ReservationsPanel refreshOn={tables} className="mb-5 mt-5 glass-card rounded-card p-4 lg:mt-0" />
          {!tables ? (
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:mt-0">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-32 rounded-card" />
              ))}
            </div>
          ) : (
            <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:mt-0 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
              {tables.map((tb) => (
                <li key={tb.id}>
                  <button
                    type="button"
                    onClick={() => tb.session && setOpenTable(tb)}
                    className={`pressable ${cn(
                      "glass-card pressable flex h-full min-h-36 w-full flex-col rounded-card p-4 text-left -outline-offset-2",
                      tb.session && "lift",
                      tb.status === "billRequested"
                        ? "outline-2 outline-danger/60"
                        : tb.status === "ordered"
                          ? "outline-2 outline-warning/50"
                          : tb.status === "seated"
                            ? "outline-1 outline-gold-line"
                            : "outline-0",
                      !tb.session && "cursor-default opacity-75",
                    )}`}
                  >
                    <span className="flex flex-wrap items-start justify-between gap-2">
                      <span className="font-display text-[2.6rem] font-semibold leading-none tabular">{tb.number}</span>
                      <Badge tone={STATUS_TONE[tb.status]}>{t(`admin.tables.status.${tb.status}`)}</Badge>
                    </span>
                    {tb.label && <span className="mt-1 truncate text-xs text-fg-muted">{tb.label}</span>}
                    {tb.reservation && (
                      <span className="mt-2 text-sm font-semibold text-primary">
                        {t("reservations.reservedAt", { time: reservationLabel(tb.reservation.startsAt) })}
                      </span>
                    )}
                    {tb.session && (
                      <span className="mt-auto pt-3 text-sm">
                        <span className="flex items-center gap-1.5 font-semibold">
                          <Users className="size-4 text-fg-muted" aria-hidden />
                          {t("admin.tables.guests", { count: tb.session.guestCount })}
                        </span>
                        {tb.session.openCalls > 0 && (
                          <span className="mt-0.5 block font-semibold text-danger">
                            {t("waiter.openCalls", { count: tb.session.openCalls })}
                          </span>
                        )}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <CloseTableSheet table={openTable} onClose={() => setOpenTable(null)} onClosed={() => void loadTables()} />
    </div>
  );
}

function CallCard({ call, fresh, onHandle }: { call: CallDTO; fresh: boolean; onHandle: () => void }) {
  const t = useT();
  const now = useNow(15_000) ?? Date.now();
  const Icon = CALL_ICON[call.type];
  const urgent = call.type === "bill" || call.type === "cashPayment";
  return (
    <li
      className={`enter ${cn(
        "glass-card flex flex-wrap items-center gap-4 rounded-card p-4 outline-1 -outline-offset-1",
        urgent ? "outline-danger/50" : "outline-gold-line",
        fresh && "animate-pulse-ring",
      )}`}
    >
      {/* The call type in a thin ring, echoing the logo mark. */}
      <span
        className={cn(
          "grid size-16 shrink-0 place-items-center rounded-full ring-1 ring-offset-4 ring-offset-surface",
          urgent ? "bg-danger/10 text-danger ring-danger/50" : "bg-primary/10 text-primary ring-primary/50",
        )}
      >
        <Icon className="size-7" strokeWidth={1.6} aria-hidden />
      </span>
      <div className="min-w-[9rem] flex-1">
        <p className="font-display text-[1.75rem] font-semibold leading-tight">
          {t("kitchen.table", { number: call.tableNumber })}
        </p>
        <p className={cn("font-semibold", urgent && "text-danger")}>{t(`waiter.callTypes.${call.type}`)}</p>
        <p className="text-sm text-fg-muted tabular">
          {formatRelative(Date.parse(call.createdAt), now)}
          {call.amountCents ? ` · ${formatPrice(call.amountCents)}` : ""}
        </p>
      </div>
      <Button
        size="lg"
        className="min-h-14 w-full text-base sm:w-auto lg:w-full"
        onClick={onHandle}
        aria-label={`${call.type === "cashPayment" ? t("waiter.cashReceived") : t("waiter.handle")}: ${t("kitchen.table", { number: call.tableNumber })}`}
      >
        <Check className="size-5" aria-hidden />
        {call.type === "cashPayment" ? t("waiter.cashReceived") : t("waiter.handle")}
      </Button>
    </li>
  );
}

function CloseTableSheet({
  table,
  onClose,
  onClosed,
}: {
  table: FloorTable | null;
  onClose: () => void;
  onClosed: () => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const shown = useRef<FloorTable | null>(null);
  if (table) shown.current = table;
  const tb = shown.current;
  if (!tb) return null;

  const close = async () => {
    if (!tb.session) return;
    setBusy(true);
    try {
      await api("POST", `/api/waiter/sessions/${tb.session.id}/close`);
      toast.success(t("waiter.closed", { number: tb.number }));
      onClosed();
      onClose();
    } catch (e) {
      toast.error(translateError(e, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={!!table}
      onClose={onClose}
      title={t("kitchen.table", { number: tb.number })}
      description={t(`admin.tables.status.${tb.status}`)}
    >
      <p className="mt-4 text-[15px] text-fg-muted">{t("waiter.closeConfirm")}</p>
      <Button variant="danger" size="lg" className="mt-5 w-full" onClick={() => void close()} disabled={busy}>
        {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <XCircle className="size-5" aria-hidden />}
        {t("waiter.closeSession")}
      </Button>
    </Sheet>
  );
}
