"use client";

import { brand } from "@app/config";
import { isTicketUpdateNewer, ticketUrgency, type OrderStatus, type Station } from "@app/shared";
import type { MenuDTO, OrderTicketDTO } from "@app/shared/api";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Boxes, CheckCheck, ChefHat, Clock, Loader2, MessageSquareText } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Switch } from "@/components/admin/form";
import { StaffGate } from "@/components/staff/staff-session";
import { StaffHeader, useSoundAlerts } from "@/components/staff/staff-header";
import { Button } from "@/components/ui/button";
import { Segmented, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { useNow } from "@/hooks/use-now";
import { useStaffSocket } from "@/hooks/use-staff-socket";
import { useT } from "@/i18n";
import { ApiClientError, api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatCountdown } from "@/lib/format";

const ROLES = ["kitchen", "manager"] as const;
const COLUMNS = ["received", "preparing", "ready"] as const;
const NEXT: Record<(typeof COLUMNS)[number], OrderStatus> = { received: "preparing", preparing: "ready", ready: "served" };
type Filter = "all" | Station;

export default function KitchenPage() {
  return (
    <StaffGate roles={[...ROLES]}>
      <KitchenDisplay />
    </StaffGate>
  );
}

function KitchenDisplay() {
  const t = useT();
  const sound = useSoundAlerts();
  const [filter, setFilter] = useState<Filter>("all");
  const [tickets, setTickets] = useState<OrderTicketDTO[] | null>(null);
  const ticketsRef = useRef<OrderTicketDTO[] | null>(null);
  /** Tickets this screen just served (they leave the board; late events must not bring them back). */
  const servedRef = useRef<Set<string>>(new Set());
  ticketsRef.current = tickets;
  const [stockVersion, setStockVersion] = useState(0);

  // Remember the chosen station on this screen.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("kds-station") as Filter | null;
      if (saved === "kitchen" || saved === "bar") setFilter(saved);
    } catch {
      /* ignore */
    }
  }, []);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [stockOpen, setStockOpen] = useState(false);
  const stations: Station[] = filter === "all" ? ["kitchen", "bar"] : [filter];

  const load = useCallback(async () => {
    try {
      const q = filter === "all" ? "" : `?station=${filter}`;
      setTickets((await api<{ tickets: OrderTicketDTO[] }>("GET", `/api/kds/orders${q}`)).tickets);
    } catch {
      /* keep what we have; the next reconnect reloads */
    }
  }, [filter]);
  useEffect(() => {
    void load();
    try {
      localStorage.setItem("kds-station", filter);
    } catch {
      /* ignore */
    }
  }, [load, filter]);

  const flash = (id: string) => {
    setFresh((s) => new Set(s).add(id));
    setTimeout(() => setFresh((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    }), 10_000);
  };

  const stationsRef = useRef(stations);
  stationsRef.current = stations;
  const { connected, socket } = useStaffSocket(
    {
      "kds:order": ({ ticket }) => {
        if (!stationsRef.current.includes(ticket.station)) return;
        // Side effects (sound, toast) happen here, never inside a state updater.
        const existing = (ticketsRef.current ?? []).find((x) => x.id === ticket.id);
        const known = !!existing;
        // Out-of-order delivery: never let an older update move a ticket backwards.
        if (!isTicketUpdateNewer(existing, ticket) || servedRef.current.has(ticket.id)) return;
        if (ticket.status === "cancelled" && known) {
          toast.info(t("kitchen.cancelled", { table: ticket.tableNumber, round: ticket.round }));
        }
        if (!known && ticket.status === "received") {
          sound.play();
          flash(ticket.id);
        }
        setTickets((list) => {
          const others = (list ?? []).filter((x) => x.id !== ticket.id);
          if (ticket.status === "served" || ticket.status === "cancelled") return others;
          return [...others, ticket].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        });
      },
      "menu:stock": () => setStockVersion((v) => v + 1),
      "menu:updated": () => setStockVersion((v) => v + 1),
    },
    {
      // Subscribe first, then refetch: nothing can slip between the snapshot and the live feed.
      onConnect: (s) =>
        void s
          .emitWithAck("kds:subscribe", { stations: stationsRef.current })
          .catch(() => {})
          .finally(() => void load()),
    },
  );
  // Re-subscribe when the station filter changes.
  useEffect(() => {
    if (socket?.connected) void socket.emitWithAck("kds:subscribe", { stations });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, filter]);

  const [busy, setBusy] = useState<Set<string>>(new Set());
  const advance = async (ticket: OrderTicketDTO) => {
    if (busy.has(ticket.id)) return; // one tap per step, even on a laggy network
    const to = NEXT[ticket.status as (typeof COLUMNS)[number]];
    setBusy((s) => new Set(s).add(ticket.id));
    if (to === "served") servedRef.current.add(ticket.id);
    setTickets((list) => (list ?? []).map((x) => (x.id === ticket.id ? { ...x, status: to } : x)).filter((x) => x.status !== "served"));
    try {
      const { ticket: saved } = await api<{ ticket: OrderTicketDTO }>("PATCH", `/api/kds/orders/${ticket.id}/status`, { status: to });
      if (saved.status !== "served") {
        setTickets((list) => (list ?? []).map((x) => (x.id === saved.id && isTicketUpdateNewer(x, saved) ? saved : x)));
      }
    } catch (e) {
      servedRef.current.delete(ticket.id);
      toast.error(e instanceof ApiClientError ? e.message : t("errors.generic"));
      void load();
    } finally {
      setBusy((s) => {
        const n = new Set(s);
        n.delete(ticket.id);
        return n;
      });
    }
  };

  const columns = useMemo(
    () => COLUMNS.map((status) => ({ status, items: (tickets ?? []).filter((x) => x.status === status) })),
    [tickets],
  );

  return (
    <div className="min-h-svh bg-bg">
      <StaffHeader title={t("kitchen.title")} connected={connected} sound={sound}>
        <Segmented
          className="min-w-64"
          label={t("kitchen.title")}
          value={filter}
          onChange={setFilter}
          options={(["all", "kitchen", "bar"] as const).map((v) => ({ value: v, label: t(`kitchen.stations.${v}`) }))}
        />
        <Button variant="secondary" size="sm" onClick={() => setStockOpen(true)}>
          <Boxes className="size-4" aria-hidden />
          {t("kitchen.stock")}
        </Button>
      </StaffHeader>

      <main className="grid gap-4 p-4 lg:grid-cols-3">
        {columns.map((col) => (
          <section key={col.status} aria-labelledby={`col-${col.status}`} className="min-w-0">
            <h2 id={`col-${col.status}`} className="mb-3 flex items-center gap-2 px-1 font-sans text-sm font-bold uppercase tracking-wider text-fg-muted">
              {t(`kitchen.columns.${col.status}`)}
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular text-fg">{col.items.length}</span>
            </h2>
            <div className="space-y-3">
              {!tickets ? (
                <Skeleton className="h-48 rounded-card" />
              ) : col.items.length === 0 ? (
                <p className="rounded-card border-2 border-dashed border-line px-4 py-8 text-center text-sm text-fg-muted">
                  {col.status === "received" ? t("kitchen.allClear") : t("kitchen.empty")}
                </p>
              ) : (
                <AnimatePresence initial={false}>
                  {col.items.map((ticket) => (
                    <TicketCard key={ticket.id} ticket={ticket} fresh={fresh.has(ticket.id)} busy={busy.has(ticket.id)} onAdvance={() => void advance(ticket)} />
                  ))}
                </AnimatePresence>
              )}
            </div>
          </section>
        ))}
      </main>

      <StockSheet open={stockOpen} onClose={() => setStockOpen(false)} version={stockVersion} />
    </div>
  );
}

function TicketCard({ ticket, fresh, busy, onAdvance }: { ticket: OrderTicketDTO; fresh: boolean; busy: boolean; onAdvance: () => void }) {
  const t = useT();
  const now = useNow(1000) ?? Date.now();
  const created = Date.parse(ticket.createdAt);
  const urgency = ticketUrgency(created, now, brand.kitchen);
  const status = ticket.status as (typeof COLUMNS)[number];
  const label = status === "received" ? t("kitchen.start") : status === "preparing" ? t("kitchen.ready") : t("kitchen.served");
  const Icon = status === "received" ? ChefHat : status === "preparing" ? CheckCheck : ArrowRight;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className={cn(
        "overflow-hidden rounded-card bg-surface shadow-soft ring-2 transition-shadow",
        urgency === "late" ? "ring-danger" : urgency === "warn" ? "ring-warning" : "ring-line/60",
        fresh && "animate-pulse-ring",
      )}
    >
      <header
        className={cn(
          "flex items-center justify-between gap-3 px-4 py-3",
          urgency === "late" ? "bg-danger text-white" : urgency === "warn" ? "bg-warning/20" : "bg-muted/70",
        )}
      >
        <div>
          <p className="font-display text-2xl font-semibold leading-none">{t("kitchen.table", { number: ticket.tableNumber })}</p>
          <p className={cn("mt-1 text-xs font-semibold uppercase tracking-wider", urgency === "late" ? "text-white/85" : "text-fg-muted")}>
            {t("kitchen.round", { number: ticket.round })} · {t(`kitchen.stations.${ticket.station}`)}
            {fresh && <span className="ml-2 rounded-full bg-primary px-1.5 py-0.5 text-on-primary">{t("kitchen.newBadge")}</span>}
          </p>
        </div>
        <p className="flex items-center gap-1.5 text-lg font-bold tabular" aria-label={formatCountdown(now - created)}>
          <Clock className="size-4" aria-hidden />
          {formatCountdown(now - created)}
        </p>
      </header>
      <ul className="space-y-2.5 px-4 py-3">
        {ticket.lines.map((l) => (
          <li key={l.id}>
            <p className="flex gap-2 text-[17px] font-semibold leading-snug">
              <span className="min-w-7 tabular text-primary">{l.quantity}×</span>
              <span>{l.name}</span>
            </p>
            {l.modifiers.length > 0 && (
              <p className="ml-9 text-sm text-fg-muted">{l.modifiers.map((m) => m.option).join(" · ")}</p>
            )}
            {l.note && (
              <p className="ml-9 mt-1 flex items-start gap-1.5 rounded-lg bg-warning/15 px-2 py-1 text-sm font-semibold">
                <MessageSquareText className="mt-0.5 size-4 shrink-0" aria-label={t("kitchen.note")} />
                {l.note}
              </p>
            )}
          </li>
        ))}
      </ul>
      <div className="px-3 pb-3">
        <Button size="lg" className="w-full" variant={status === "ready" ? "secondary" : "primary"} onClick={onAdvance} disabled={busy} aria-busy={busy}>
          {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Icon className="size-5" aria-hidden />}
          {label}
        </Button>
      </div>
    </motion.article>
  );
}

function StockSheet({ open, onClose, version }: { open: boolean; onClose: () => void; version: number }) {
  const t = useT();
  const [menu, setMenu] = useState<MenuDTO | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/menu", { cache: "no-cache" });
    if (res.ok) setMenu(await res.json());
  }, []);
  // Reload when opened, and when anyone changes stock while it is open.
  useEffect(() => {
    if (open) void load();
  }, [open, load, version]);

  const toggle = async (id: string, inStock: boolean) => {
    setBusy(id);
    try {
      await api("PATCH", `/api/menu/items/${id}/stock`, { inStock });
      setMenu((m) => (m ? { ...m, items: m.items.map((i) => (i.id === id ? { ...i, inStock } : i)) } : m));
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : t("errors.generic"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={t("kitchen.stockTitle")} description={t("kitchen.stockHint")}>
      {!menu ? (
        <div className="mt-4 space-y-2">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : (
        menu.categories.map((c) => (
          <section key={c.id} className="mt-5">
            <h3 className="text-sm font-bold uppercase tracking-wider text-fg-muted">{c.name}</h3>
            <ul className="mt-2 divide-y divide-line/60 rounded-2xl ring-1 ring-line/70">
              {menu.items
                .filter((i) => i.categoryId === c.id)
                .map((i) => (
                  <li key={i.id} className="flex min-h-14 items-center gap-3 px-4 py-2">
                    <span className={cn("flex-1 font-semibold", !i.inStock && "text-fg-muted line-through")}>{i.name}</span>
                    {busy === i.id ? (
                      <Loader2 className="size-5 animate-spin text-fg-muted" aria-hidden />
                    ) : (
                      <Switch compact checked={i.inStock} onChange={(v) => void toggle(i.id, v)} label={i.name} />
                    )}
                  </li>
                ))}
            </ul>
          </section>
        ))
      )}
    </Sheet>
  );
}
