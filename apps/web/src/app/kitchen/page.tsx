"use client";

import { brand } from "@app/config";
import { isTicketUpdateNewer, ticketUrgency, type OrderStatus, type Station } from "@app/shared";
import type { MenuDTO, OrderTicketDTO } from "@app/shared/api";
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
import { useLineText } from "@/components/guest/line-text";
import { useMenu } from "@/hooks/use-menu";
import { useI18n, useT } from "@/i18n";
import { translateError } from "@/i18n/errors";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatCountdown } from "@/lib/format";
import { setInStock, stockStore, useInStock, useStockErrorToast } from "@/lib/stock";

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
  useMenu(); // dish names in the screen's language (tickets store the default language)
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
      // Stock: update just that item (no menu reload). Menu edits: reload the stock list.
      "menu:stock": ({ itemId, inStock, stockVersion }) => stockStore.getState().applyServer(itemId, inStock, stockVersion),
      "menu:updated": () => setStockVersion((v) => v + 1),
    },
    {
      // Subscribe first, then refetch: nothing can slip between the snapshot and the live feed.
      onConnect: (s) => {
        setStockVersion((v) => v + 1); // catch up on stock changes missed while offline
        void s
          .emitWithAck("kds:subscribe", { stations: stationsRef.current })
          .catch(() => {})
          .finally(() => void load());
      },
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
      toast.error(translateError(e, t));
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
    // lg+ (landscape tablets, desktops): the board fills the screen and each column scrolls on its own.
    <div className="flex min-h-svh flex-col lg:h-svh">
      <StaffHeader title={t("kitchen.title")} connected={connected} sound={sound}>
        <Segmented
          className="w-full min-w-0 sm:w-auto sm:min-w-64"
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

      {/* Phones: columns stacked. md+ (tablet portrait and up): three columns side by side. */}
      <main className="grid gap-4 p-4 md:grid-cols-3 md:gap-3 md:p-3 lg:min-h-0 lg:flex-1 lg:gap-4 lg:p-4">
        {columns.map((col) => (
          <section key={col.status} aria-labelledby={`col-${col.status}`} className="min-w-0 lg:flex lg:min-h-0 lg:flex-col">
            <h2 id={`col-${col.status}`} className="mb-3 flex shrink-0 items-center gap-3 px-1 text-[13px] font-label uppercase tracking-[0.08em] text-primary">
              <span aria-hidden className="h-px w-6 bg-primary" />
              {t(`kitchen.columns.${col.status}`)}
              <span className="grid h-6 min-w-6 place-items-center rounded-full px-2 text-xs tabular text-fg ring-1 ring-gold-line">{col.items.length}</span>
            </h2>
            <div className="space-y-3 lg:-mx-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:px-1 lg:pb-4 min-[1800px]:grid min-[1800px]:auto-rows-min min-[1800px]:grid-cols-2 min-[1800px]:gap-3 min-[1800px]:space-y-0">
              {!tickets ? (
                <Skeleton className="h-48 rounded-card" />
              ) : col.items.length === 0 ? (
                <p className="rounded-card border border-dashed border-gold-line px-4 py-10 text-center text-sm text-fg-muted">
                  {col.status === "received" ? t("kitchen.allClear") : t("kitchen.empty")}
                </p>
              ) : (
                <>
                  {col.items.map((ticket) => (
                    <TicketCard key={ticket.id} ticket={ticket} fresh={fresh.has(ticket.id)} busy={busy.has(ticket.id)} onAdvance={() => void advance(ticket)} />
                  ))}
                </>
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
  const lineText = useLineText();
  const now = useNow(1000) ?? Date.now();
  const created = Date.parse(ticket.createdAt);
  const urgency = ticketUrgency(created, now, brand.kitchen);
  const status = ticket.status as (typeof COLUMNS)[number];
  const label = status === "received" ? t("kitchen.start") : status === "preparing" ? t("kitchen.ready") : t("kitchen.served");
  const Icon = status === "received" ? ChefHat : status === "preparing" ? CheckCheck : ArrowRight;

  return (
    <article
      className={`enter ${cn(
        "glass-card overflow-hidden rounded-card outline-2 -outline-offset-2",
        urgency === "late" ? "outline-danger" : urgency === "warn" ? "outline-warning" : fresh ? "outline-primary" : "outline-transparent",
        fresh && "animate-pulse-ring",
      )}`}
    >
      <header
        className={cn(
          "flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3",
          urgency === "late" ? "bg-danger text-white" : urgency === "warn" ? "bg-warning/20" : "bg-muted/60 border-b border-line",
        )}
      >
        <div className="min-w-0">
          <p className="font-display text-[1.75rem] font-semibold leading-none">{t("kitchen.table", { number: ticket.tableNumber })}</p>
          <p className={cn("mt-1 text-xs font-semibold uppercase tracking-wider", urgency === "late" ? "text-white/85" : "text-fg-muted")}>
            {t("kitchen.round", { number: ticket.round })} · {t(`kitchen.stations.${ticket.station}`)}
            {fresh && <span className="ml-2 rounded-card bg-primary px-1.5 py-0.5 text-on-primary">{t("kitchen.newBadge")}</span>}
          </p>
        </div>
        <p className="flex shrink-0 items-center gap-1.5 text-xl font-bold tabular" aria-label={formatCountdown(now - created)}>
          <Clock className="size-4" aria-hidden />
          {formatCountdown(now - created)}
        </p>
      </header>
      <ul className="space-y-2.5 px-4 py-3">
        {ticket.lines.map((l) => {
          const text = lineText(l);
          return (
          <li key={l.id}>
            <p className="flex gap-2 text-[19px] font-semibold leading-snug md:text-[17px] lg:text-[19px]">
              <span className="min-w-8 tabular text-primary">{l.quantity}×</span>
              <span className="min-w-0">{text.name}</span>
            </p>
            {text.modifiers.length > 0 && (
              <p className="ml-10 text-[15px] text-fg-muted">{text.modifiers.join(" · ")}</p>
            )}
            {l.note && (
              <p className="ml-10 mt-1.5 flex items-start gap-1.5 rounded-lg bg-warning/15 px-2.5 py-1.5 text-[15px] font-semibold ring-1 ring-inset ring-warning/30">
                <MessageSquareText className="mt-0.5 size-4 shrink-0" aria-label={t("kitchen.note")} />
                {l.note}
              </p>
            )}
          </li>
          );
        })}
      </ul>
      <div className="px-3 pb-3">
        <Button size="lg" className="min-h-16 w-full text-lg" variant={status === "ready" ? "outline" : "primary"} onClick={onAdvance} disabled={busy} aria-busy={busy}>
          {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Icon className="size-5" aria-hidden />}
          {label}
        </Button>
      </div>
    </article>
  );
}

function StockSheet({ open, onClose, version }: { open: boolean; onClose: () => void; version: number }) {
  const { t, locale } = useI18n();
  const nameOf = (x: { name: string; translations?: Partial<Record<string, { name?: string }>> }) =>
    x.translations?.[locale]?.name?.trim() || x.name;
  const [menu, setMenu] = useState<MenuDTO | null>(null);
  useStockErrorToast();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/menu", { cache: "no-cache" });
      if (!res.ok) return;
      const next = (await res.json()) as MenuDTO;
      stockStore.getState().seed(next.items);
      setMenu(next);
    } catch {
      /* offline: keep the list we have; the next reconnect reloads */
    }
  }, []);
  // Load when opened, after a menu edit, and after a reconnect. Stock changes
  // themselves arrive live through the stock store, without reloading.
  useEffect(() => {
    if (open) void load();
  }, [open, load, version]);

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
            <h3 className="eyebrow">{nameOf(c)}</h3>
            <ul className="mt-2 divide-y divide-line rounded-2xl ring-1 ring-line">
              {menu.items
                .filter((i) => i.categoryId === c.id)
                .map((i) => (
                  <StockRow key={i.id} id={i.id} fallback={i.inStock} name={nameOf(i)} />
                ))}
            </ul>
          </section>
        ))
      )}
    </Sheet>
  );
}

function StockRow({ id, fallback, name }: { id: string; fallback: boolean; name: string }) {
  // Only this row re-renders when its stock changes.
  const inStock = useInStock(id, fallback);
  return (
    <li className="flex min-h-14 items-center gap-3 px-4 py-2">
      <span className={cn("flex-1 font-semibold", !inStock && "text-fg-muted line-through")}>{name}</span>
      <Switch compact checked={inStock} onChange={(v) => setInStock(id, v)} label={name} />
    </li>
  );
}
