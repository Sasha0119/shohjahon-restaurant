"use client";

import type { AdminTableDTO, TableStatusDTO } from "@app/shared/api";
import { motion } from "framer-motion";
import {
  CloudOff,
  Copy,
  Download,
  ExternalLink,
  LayoutGrid,
  Loader2,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Users,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, LinkButton } from "@/components/ui/button";
import { Badge, EmptyState, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { useNow } from "@/hooks/use-now";
import { useStaffSocket } from "@/hooks/use-staff-socket";
import { useT } from "@/i18n";
import { translateError } from "@/i18n/errors";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";

const STATUS_STYLE: Record<TableStatusDTO, { dot: string; ring: string; tone: "muted" | "primary" | "warning" | "danger" }> = {
  free: { dot: "bg-fg/25", ring: "ring-line", tone: "muted" },
  seated: { dot: "bg-primary", ring: "ring-primary/40", tone: "primary" },
  ordered: { dot: "bg-warning", ring: "ring-warning/50", tone: "warning" },
  billRequested: { dot: "bg-danger", ring: "ring-danger/50", tone: "danger" },
};

const field =
  "mt-1.5 h-12 w-full rounded-2xl bg-muted px-4 text-[16px] placeholder:text-fg-muted focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary";


export default function TablesAdminPage() {
  const t = useT();
  const [tables, setTables] = useState<AdminTableDTO[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<{ mode: "create" } | { mode: "edit"; table: AdminTableDTO } | null>(null);

  const load = useCallback(() => {
    api<{ tables: AdminTableDTO[] }>("GET", "/api/admin/tables")
      .then((r) => {
        setTables(r.tables);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);

  // Live: refetch (debounced) whenever any table changes status.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refresh = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(load, 250);
  }, [load]);
  const { connected } = useStaffSocket({ "table:status": refresh }, load);

  const replace = (row: AdminTableDTO) =>
    setTables((ts) => {
      const list = ts ?? [];
      const next = list.some((x) => x.id === row.id) ? list.map((x) => (x.id === row.id ? row : x)) : [...list, row];
      return next.sort((a, b) => a.number - b.number);
    });

  const open = tables?.find((x) => x.id === openId) ?? null;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-semibold">
            {t("admin.tables.title")}
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-sans text-xs font-semibold",
                connected ? "bg-success/12 text-success" : "bg-muted text-fg-muted",
              )}
            >
              <span className={cn("size-1.5 rounded-full", connected ? "animate-pulse bg-success" : "bg-fg/30")} />
              {t("admin.live")}
            </span>
          </h1>
          <p className="mt-1 text-fg-muted">{t("admin.tables.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <LinkButton href="/admin/tables/print" variant="secondary">
            <Printer className="size-5" aria-hidden />
            {t("admin.tables.printAll")}
          </LinkButton>
          <Button onClick={() => setForm({ mode: "create" })}>
            <Plus className="size-5" aria-hidden />
            {t("admin.tables.add")}
          </Button>
        </div>
      </div>

      <div className="mt-8">
        {failed && !tables ? (
          <EmptyState icon={CloudOff} title={t("admin.tables.loadError")} action={<Button onClick={load}>{t("common.retry")}</Button>} />
        ) : !tables ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" aria-busy="true">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-40 rounded-card" />
            ))}
          </div>
        ) : tables.length === 0 ? (
          <EmptyState icon={LayoutGrid} title={t("admin.tables.empty")} />
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {tables.map((tb) => (
              <TableCard key={tb.id} table={tb} onOpen={() => setOpenId(tb.id)} />
            ))}
          </ul>
        )}
      </div>

      <TableSheet
        table={open}
        onClose={() => setOpenId(null)}
        onChanged={replace}
        onEdit={(table) => {
          setOpenId(null);
          setForm({ mode: "edit", table });
        }}
      />
      <TableForm state={form} onClose={() => setForm(null)} onSaved={replace} />
    </div>
  );
}

function TableCard({ table, onOpen }: { table: AdminTableDTO; onOpen: () => void }) {
  const t = useT();
  const now = useNow(30_000) ?? Date.now();
  const style = STATUS_STYLE[table.status];
  return (
    <motion.li layout>
      <motion.button
        type="button"
        whileTap={{ scale: 0.97 }}
        onClick={onOpen}
        className={cn(
          "flex h-full min-h-40 w-full flex-col rounded-card bg-surface p-4 text-left shadow-soft ring-2 transition-shadow hover:shadow-lift",
          style.ring,
          !table.active && "opacity-55",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="font-display text-4xl font-semibold leading-none tabular">{table.number}</span>
          {table.active ? (
            <Badge tone={style.tone}>
              <span className={cn("size-1.5 rounded-full", style.dot, table.status !== "free" && "animate-pulse")} />
              {t(`admin.tables.status.${table.status}`)}
            </Badge>
          ) : (
            <Badge>{t("admin.tables.off")}</Badge>
          )}
        </div>
        <p className="mt-2 truncate text-sm text-fg-muted">
          {table.label ? `${table.label} · ` : ""}
          {t("admin.tables.seatsCount", { count: table.seats })}
        </p>
        <div className="mt-auto pt-4 text-sm">
          {table.session ? (
            <>
              <p className="flex items-center gap-1.5 font-semibold">
                <Users className="size-4 text-fg-muted" aria-hidden />
                {t("admin.tables.guests", { count: table.session.guestCount })}
              </p>
              <p className="mt-0.5 truncate text-fg-muted">
                {t("admin.tables.since", { time: formatRelative(Date.parse(table.session.openedAt), now) })}
              </p>
            </>
          ) : (
            <p className="text-fg-muted">—</p>
          )}
        </div>
      </motion.button>
    </motion.li>
  );
}

function TableSheet({
  table,
  onClose,
  onChanged,
  onEdit,
}: {
  table: AdminTableDTO | null;
  onClose: () => void;
  onChanged: (t: AdminTableDTO) => void;
  onEdit: (t: AdminTableDTO) => void;
}) {
  const t = useT();
  const [shown, setShown] = useState<AdminTableDTO | null>(null);
  const [confirm, setConfirm] = useState<"close" | "rotate" | null>(null);
  const [busy, setBusy] = useState(false);
  const [qrKey, setQrKey] = useState(0);

  useEffect(() => {
    if (table) setShown(table);
    if (!table) setConfirm(null);
  }, [table]);

  if (!shown) return null;
  const qrSrc = `/api/admin/tables/${shown.id}/qr?size=640&v=${qrKey}`;

  const doConfirm = async () => {
    setBusy(true);
    try {
      if (confirm === "close" && shown.session) {
        await api("POST", `/api/waiter/sessions/${shown.session.id}/close`);
        toast.success(t("admin.tables.closed"));
        onChanged({ ...shown, status: "free", session: null });
      } else if (confirm === "rotate") {
        const { table: updated } = await api<{ table: AdminTableDTO }>("POST", `/api/admin/tables/${shown.id}/rotate-qr`);
        onChanged(updated);
        setShown(updated);
        setQrKey((k) => k + 1);
        toast.success(t("admin.tables.rotated"));
      }
      setConfirm(null);
    } catch (e) {
      toast.error(translateError(e, t));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shown.url);
      toast.success(t("admin.tables.linkCopied"));
    } catch {
      toast.error(t("wifi.copyFailed"));
    }
  };

  const action =
    "flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-muted/70 px-3 text-sm font-semibold transition-colors hover:bg-muted";

  return (
    <Sheet
      open={!!table}
      onClose={onClose}
      title={t("admin.tables.table", { number: shown.number })}
      description={[shown.label, t(`admin.tables.status.${shown.status}`)].filter(Boolean).join(" · ")}
    >
      <div className="mt-5 flex justify-center">
        {/* QR codes need dark-on-light to scan, so the tile is always white. */}
        <div className="rounded-3xl bg-white p-4 shadow-soft ring-1 ring-black/5">
          {/* eslint-disable-next-line @next/next/no-img-element -- authenticated, uncached API image */}
          <img src={qrSrc} alt={t("admin.tables.qr", { number: shown.number })} width={220} height={220} className="size-[220px]" />
        </div>
      </div>
      <p className="mt-3 break-all text-center font-mono text-xs text-fg-muted">{shown.url}</p>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <button type="button" className={action} onClick={copy}>
          <Copy className="size-4" aria-hidden />
          {t("admin.tables.copyLink")}
        </button>
        <a className={action} href={shown.url} target="_blank" rel="noreferrer">
          <ExternalLink className="size-4" aria-hidden />
          {t("admin.tables.openGuest")}
        </a>
        <a className={action} href={`/api/admin/tables/${shown.id}/qr?format=png&size=1024`} download={`table-${shown.number}-qr.png`}>
          <Download className="size-4" aria-hidden />
          {t("admin.tables.downloadPng")}
        </a>
        <Link className={action} href={`/admin/tables/print?table=${shown.id}`}>
          <Printer className="size-4" aria-hidden />
          {t("admin.tables.print")}
        </Link>
      </div>

      <div className="mt-6 space-y-1 border-t border-line pt-4">
        <button
          type="button"
          onClick={() => onEdit(shown)}
          className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-[15px] font-semibold hover:bg-muted"
        >
          <Pencil className="size-5 text-fg-muted" aria-hidden />
          {t("admin.tables.edit")}
        </button>
        {shown.session && (
          <button
            type="button"
            onClick={() => setConfirm("close")}
            className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-[15px] font-semibold text-danger hover:bg-danger/8"
          >
            <XCircle className="size-5" aria-hidden />
            {t("admin.tables.closeSession")}
          </button>
        )}
        <button
          type="button"
          onClick={() => setConfirm("rotate")}
          className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-[15px] font-semibold hover:bg-muted"
        >
          <RefreshCw className="size-5 text-fg-muted" aria-hidden />
          {t("admin.tables.rotate")}
        </button>
      </div>

      {confirm && (
        <div className="mt-4 rounded-2xl bg-danger/8 p-4" role="alertdialog" aria-live="assertive">
          <p className="text-sm font-medium">
            {confirm === "close"
              ? t("admin.tables.closeConfirm", { number: shown.number })
              : t("admin.tables.rotateConfirm", { number: shown.number })}
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setConfirm(null)}>
              {t("admin.tables.cancel")}
            </Button>
            <Button variant="danger" size="sm" onClick={doConfirm} disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {t("admin.tables.confirm")}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function TableForm({
  state,
  onClose,
  onSaved,
}: {
  state: { mode: "create" } | { mode: "edit"; table: AdminTableDTO } | null;
  onClose: () => void;
  onSaved: (t: AdminTableDTO) => void;
}) {
  const t = useT();
  const [number, setNumber] = useState("");
  const [label, setLabel] = useState("");
  const [seats, setSeats] = useState("4");
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state) return;
    const tb = state.mode === "edit" ? state.table : null;
    setNumber(tb ? String(tb.number) : "");
    setLabel(tb?.label ?? "");
    setSeats(tb ? String(tb.seats) : "4");
    setActive(tb?.active ?? true);
    setError(null);
  }, [state]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!state) return;
    setBusy(true);
    setError(null);
    const body = { number: Number(number), label: label.trim() || undefined, seats: Number(seats), active };
    try {
      const { table } =
        state.mode === "create"
          ? await api<{ table: AdminTableDTO }>("POST", "/api/admin/tables", body)
          : await api<{ table: AdminTableDTO }>("PUT", `/api/admin/tables/${state.table.id}`, body);
      onSaved(table);
      toast.success(state.mode === "create" ? t("admin.tables.created", { number: table.number }) : t("admin.tables.saved"));
      onClose();
    } catch (err) {
      setError(translateError(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={!!state}
      onClose={onClose}
      title={state?.mode === "edit" ? t("admin.tables.edit") : t("admin.tables.add")}
    >
      <form onSubmit={submit} className="mt-5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold" htmlFor="tb-number">
              {t("admin.tables.number")}
            </label>
            <input id="tb-number" inputMode="numeric" className={field} value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, "").slice(0, 4))} required />
          </div>
          <div>
            <label className="block text-sm font-semibold" htmlFor="tb-seats">
              {t("admin.tables.seats")}
            </label>
            <input id="tb-seats" inputMode="numeric" className={field} value={seats} onChange={(e) => setSeats(e.target.value.replace(/\D/g, "").slice(0, 2))} required />
          </div>
        </div>
        <label className="mt-4 block text-sm font-semibold" htmlFor="tb-label">
          {t("admin.tables.label")}
        </label>
        <input id="tb-label" className={field} value={label} placeholder={t("admin.tables.labelPlaceholder")} onChange={(e) => setLabel(e.target.value.slice(0, 40))} />
        <label className="mt-5 flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-2xl bg-muted/60 px-4">
          <span className="font-semibold">{t("admin.tables.takingOrders")}</span>
          <input type="checkbox" className="peer sr-only" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <span
            aria-hidden
            className="relative h-7 w-12 rounded-full bg-fg/20 transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 after:absolute after:left-1 after:top-1 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5"
          />
        </label>
        <p className="mt-3 min-h-5 text-sm font-medium text-danger" role="alert">
          {error}
        </p>
        <div className="mt-2 flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            {t("admin.tables.cancel")}
          </Button>
          <Button type="submit" className="flex-1" disabled={busy || !number || !seats}>
            {busy && <Loader2 className="size-5 animate-spin" aria-hidden />}
            {t("admin.tables.save")}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
