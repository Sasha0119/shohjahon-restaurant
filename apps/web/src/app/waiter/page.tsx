"use client";

import type { CallDTO, TableStatusDTO } from "@app/shared/api";
import { AnimatePresence, motion } from "framer-motion";
import { Banknote, BellRing, Check, Droplets, HandHelping, Loader2, ReceiptText, Users, XCircle, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { formatPrice, formatRelative } from "@/lib/format";

const ROLES = ["waiter", "manager"] as const;

interface FloorTable {
  id: string;
  number: number;
  label: string | null;
  seats: number;
  status: TableStatusDTO;
  session: { id: string; guestCount: number; openedAt: string; openCalls: number } | null;
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
        setTimeout(() => setFresh((s) => { const n = new Set(s); n.delete(call.id); return n; }), 10_000);
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
    <div className="min-h-svh bg-bg">
      <StaffHeader title={t("waiter.title")} connected={connected} sound={sound} />
      <div className="mx-auto max-w-5xl px-4 py-5">
        <Segmented
          className="max-w-sm"
          label={t("waiter.title")}
          value={tab}
          onChange={setTab}
          options={[
            { value: "calls", label: `${t("waiter.tabs.calls")}${calls?.length ? ` · ${calls.length}` : ""}` },
            { value: "tables", label: t("waiter.tabs.tables") },
          ]}
        />

        {tab === "calls" ? (
          !calls ? (
            <div className="mt-5 space-y-3">
              <Skeleton className="h-24 rounded-card" />
              <Skeleton className="h-24 rounded-card" />
            </div>
          ) : calls.length === 0 ? (
            <EmptyState icon={BellRing} title={t("waiter.noCalls")} body={t("waiter.noCallsBody")} />
          ) : (
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              <AnimatePresence initial={false}>
                {calls.map((c) => (
                  <CallCard key={c.id} call={c} fresh={fresh.has(c.id)} onHandle={() => void handle(c)} />
                ))}
              </AnimatePresence>
            </ul>
          )
        ) : !tables ? (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-32 rounded-card" />
            ))}
          </div>
        ) : (
          <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {tables.map((tb) => (
              <li key={tb.id}>
                <motion.button
                  type="button"
                  layout
                  whileTap={{ scale: 0.97 }}
                  onClick={() => tb.session && setOpenTable(tb)}
                  className={cn(
                    "pressable flex h-full min-h-36 w-full flex-col rounded-card bg-surface p-4 text-left shadow-soft ring-1",
                    tb.status === "billRequested" ? "ring-2 ring-danger/60" : tb.status === "ordered" ? "ring-2 ring-warning/50" : tb.status === "seated" ? "ring-gold-line" : "ring-line",
                    !tb.session && "cursor-default opacity-75",
                  )}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-display text-[2.6rem] font-semibold leading-none tabular">{tb.number}</span>
                    <Badge tone={STATUS_TONE[tb.status]}>{t(`admin.tables.status.${tb.status}`)}</Badge>
                  </span>
                  {tb.label && <span className="mt-1 truncate text-xs text-fg-muted">{tb.label}</span>}
                  {tb.session && (
                    <span className="mt-auto pt-3 text-sm">
                      <span className="flex items-center gap-1.5 font-semibold">
                        <Users className="size-4 text-fg-muted" aria-hidden />
                        {t("admin.tables.guests", { count: tb.session.guestCount })}
                      </span>
                      {tb.session.openCalls > 0 && (
                        <span className="mt-0.5 block font-semibold text-danger">{t("waiter.openCalls", { count: tb.session.openCalls })}</span>
                      )}
                    </span>
                  )}
                </motion.button>
              </li>
            ))}
          </ul>
        )}
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
    <motion.li
      layout
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 40 }}
      className={cn(
        "flex flex-wrap items-center gap-4 rounded-card bg-surface p-4 shadow-soft ring-1",
        urgent ? "ring-danger/50" : "ring-gold-line",
        fresh && "animate-pulse-ring",
      )}
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
        <p className="font-display text-[1.75rem] font-semibold leading-tight">{t("kitchen.table", { number: call.tableNumber })}</p>
        <p className={cn("font-semibold", urgent && "text-danger")}>{t(`waiter.callTypes.${call.type}`)}</p>
        <p className="text-sm text-fg-muted tabular">
          {formatRelative(Date.parse(call.createdAt), now)}
          {call.amountCents ? ` · ${formatPrice(call.amountCents)}` : ""}
        </p>
      </div>
      <Button
        size="lg"
        className="min-h-14 w-full text-base sm:w-auto"
        onClick={onHandle}
        aria-label={`${call.type === "cashPayment" ? t("waiter.cashReceived") : t("waiter.handle")}: ${t("kitchen.table", { number: call.tableNumber })}`}
      >
        <Check className="size-5" aria-hidden />
        {call.type === "cashPayment" ? t("waiter.cashReceived") : t("waiter.handle")}
      </Button>
    </motion.li>
  );
}

function CloseTableSheet({ table, onClose, onClosed }: { table: FloorTable | null; onClose: () => void; onClosed: () => void }) {
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
    <Sheet open={!!table} onClose={onClose} title={t("kitchen.table", { number: tb.number })} description={t(`admin.tables.status.${tb.status}`)}>
      <p className="mt-4 text-[15px] text-fg-muted">{t("waiter.closeConfirm")}</p>
      <Button variant="danger" size="lg" className="mt-5 w-full" onClick={() => void close()} disabled={busy}>
        {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <XCircle className="size-5" aria-hidden />}
        {t("waiter.closeSession")}
      </Button>
    </Sheet>
  );
}
