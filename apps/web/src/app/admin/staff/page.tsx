"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  CloudOff,
  KeyRound,
  Loader2,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  UserPlus,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useStaffSession } from "@/components/staff/staff-session";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Segmented, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { useNow } from "@/hooks/use-now";
import { useT } from "@/i18n";
import { ApiClientError, api, type StaffRole } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";

interface StaffRow {
  id: string;
  name: string;
  role: StaffRole;
  email: string | null;
  active: boolean;
  locked: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

const input =
  "mt-1.5 h-12 w-full rounded-2xl bg-muted px-4 text-[16px] placeholder:text-fg-muted focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary";

/** First field error from a VALIDATION_ERROR, else the API message. */
function errorText(e: unknown, fallback: string): string {
  if (e instanceof ApiClientError) {
    const first = Array.isArray(e.details) ? (e.details[0] as { message?: string } | undefined) : undefined;
    return first?.message ?? e.message;
  }
  return fallback;
}

export default function StaffAdminPage() {
  const t = useT();
  const [rows, setRows] = useState<StaffRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<StaffRow | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    api<{ staff: StaffRow[] }>("GET", "/api/admin/staff")
      .then((r) => setRows(r.staff))
      .catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);

  const upsert = (row: StaffRow) =>
    setRows((rs) => (rs ? (rs.some((r) => r.id === row.id) ? rs.map((r) => (r.id === row.id ? row : r)) : [...rs, row]) : [row]));

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{t("admin.staff.title")}</h1>
          <p className="mt-1 text-fg-muted">{t("admin.staff.subtitle")}</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-5" aria-hidden />
          {t("admin.staff.add")}
        </Button>
      </div>

      <div className="mt-8">
        {failed ? (
          <EmptyState icon={CloudOff} title={t("admin.staff.loadError")} action={<Button onClick={load}>{t("common.retry")}</Button>} />
        ) : !rows ? (
          <div className="space-y-3" aria-busy="true">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-20 rounded-card" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Users} title={t("admin.staff.empty")} />
        ) : (
          <StaffList rows={rows} onEdit={setEditing} />
        )}
      </div>

      <CreateStaffSheet open={creating} onClose={() => setCreating(false)} onCreated={upsert} />
      <EditStaffSheet row={editing} onClose={() => setEditing(null)} onSaved={upsert} />
    </div>
  );
}

function StaffList({ rows, onEdit }: { rows: StaffRow[]; onEdit: (r: StaffRow) => void }) {
  const t = useT();
  const { me } = useStaffSession();
  const now = useNow(60_000) ?? Date.now();

  return (
    <div className="overflow-hidden rounded-card bg-surface shadow-soft ring-1 ring-line/60">
      <div className="hidden grid-cols-[minmax(0,2fr)_8rem_8rem_10rem_3rem] gap-4 border-b border-line/70 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-fg-muted md:grid">
        <span>{t("admin.staff.name")}</span>
        <span>{t("admin.staff.role")}</span>
        <span>{t("admin.staff.status")}</span>
        <span>{t("admin.staff.lastLogin")}</span>
        <span className="sr-only">{t("admin.staff.actions", { name: "" })}</span>
      </div>
      <ul>
        <AnimatePresence initial={false}>
          {rows.map((r) => (
            <motion.li
              key={r.id}
              layout
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b border-line/60 px-5 py-4 last:border-b-0 md:grid-cols-[minmax(0,2fr)_8rem_8rem_10rem_3rem]",
                !r.active && "opacity-60",
              )}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-full font-semibold",
                    r.role === "manager" ? "bg-primary text-on-primary" : "bg-muted text-fg",
                  )}
                >
                  {r.name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 truncate font-semibold">
                    {r.name}
                    {r.id === me.id && <Badge tone="primary">{t("admin.staff.you")}</Badge>}
                  </p>
                  {r.email && <p className="truncate text-sm text-fg-muted">{r.email}</p>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onEdit(r)}
                aria-label={t("admin.staff.actions", { name: r.name })}
                className="col-start-2 row-start-1 grid size-11 place-items-center rounded-full text-fg-muted hover:bg-muted hover:text-fg md:col-start-5"
              >
                <MoreHorizontal className="size-5" aria-hidden />
              </button>
              <div className="col-span-2 flex flex-wrap items-center gap-2 md:contents">
                <span className="md:col-start-2 md:row-start-1">
                  <Badge tone={r.role === "manager" ? "secondary" : "muted"}>{t(`staff.roles.${r.role}`)}</Badge>
                </span>
                <span className="md:col-start-3 md:row-start-1">
                  {r.locked ? (
                    <Badge tone="danger">
                      <Lock className="size-3" aria-hidden />
                      {t("admin.staff.locked")}
                    </Badge>
                  ) : (
                    <Badge tone={r.active ? "success" : "muted"}>
                      {r.active ? t("admin.staff.active") : t("admin.staff.inactive")}
                    </Badge>
                  )}
                </span>
                <span className="text-sm text-fg-muted md:col-start-4 md:row-start-1">
                  <span className="md:hidden">{t("admin.staff.lastLogin")}: </span>
                  {r.lastLoginAt ? formatRelative(Date.parse(r.lastLoginAt), now) : t("admin.staff.never")}
                </span>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}

function CreateStaffSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (r: StaffRow) => void;
}) {
  const t = useT();
  const [role, setRole] = useState<StaffRole>("waiter");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setPin("");
      setEmail("");
      setPassword("");
      setError(null);
    }
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = role === "manager" ? { role, name, email, password } : { role, name, pin };
      const { staff } = await api<{ staff: StaffRow }>("POST", "/api/admin/staff", body);
      onCreated(staff);
      toast.success(t("admin.staff.created", { name: staff.name }));
      onClose();
    } catch (err) {
      setError(errorText(err, t("errors.generic")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={t("admin.staff.createTitle")}>
      <form onSubmit={submit} className="mt-5">
        <Segmented
          label={t("admin.staff.role")}
          value={role}
          onChange={setRole}
          options={(["waiter", "kitchen", "manager"] as const).map((r) => ({ value: r, label: t(`staff.roles.${r}`) }))}
        />
        <p className="mt-2 text-sm text-fg-muted">{t(`admin.staff.roleHint.${role}`)}</p>

        <label className="mt-5 block text-sm font-semibold" htmlFor="new-name">
          {t("admin.staff.name")}
        </label>
        <input id="new-name" className={input} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />

        {role === "manager" ? (
          <>
            <label className="mt-4 block text-sm font-semibold" htmlFor="new-email">
              {t("staff.email")}
            </label>
            <input id="new-email" type="email" autoComplete="off" className={input} value={email} onChange={(e) => setEmail(e.target.value)} required />
            <label className="mt-4 block text-sm font-semibold" htmlFor="new-password">
              {t("admin.staff.newPassword")}
            </label>
            <input id="new-password" type="password" autoComplete="new-password" className={input} value={password} onChange={(e) => setPassword(e.target.value)} minLength={10} required />
          </>
        ) : (
          <>
            <label className="mt-4 block text-sm font-semibold" htmlFor="new-pin">
              {t("admin.staff.pin")}
            </label>
            <input
              id="new-pin"
              inputMode="numeric"
              autoComplete="off"
              className={`${input} tracking-[0.4em]`}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              required
            />
          </>
        )}

        <p className="mt-3 min-h-5 text-sm font-medium text-danger" role="alert">
          {error}
        </p>
        <div className="mt-2 flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            {t("admin.staff.cancel")}
          </Button>
          <Button type="submit" className="flex-1" disabled={busy || !name.trim()}>
            {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <UserPlus className="size-5" aria-hidden />}
            {t("admin.staff.create")}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

type EditMode = "menu" | "rename" | "secret";

function EditStaffSheet({
  row,
  onClose,
  onSaved,
}: {
  row: StaffRow | null;
  onClose: () => void;
  onSaved: (r: StaffRow) => void;
}) {
  const t = useT();
  const { me } = useStaffSession();
  const [mode, setMode] = useState<EditMode>("menu");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<StaffRow | null>(null);

  useEffect(() => {
    if (row) {
      setShown(row);
      setMode("menu");
      setValue("");
      setError(null);
    }
  }, [row]);

  if (!shown) return null;
  const isManager = shown.role === "manager";

  const run = async (fn: () => Promise<{ staff: StaffRow }>, message: string) => {
    setBusy(true);
    setError(null);
    try {
      const { staff } = await fn();
      onSaved(staff);
      setShown(staff);
      toast.success(message);
      onClose();
    } catch (err) {
      setError(errorText(err, t("errors.generic")));
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "rename") {
      void run(() => api("PATCH", `/api/admin/staff/${shown.id}`, { name: value }), t("admin.staff.saved"));
    } else if (isManager) {
      void run(
        () => api("POST", `/api/admin/staff/${shown.id}/reset-password`, { password: value }),
        t("admin.staff.passwordReset", { name: shown.name }),
      );
    } else {
      void run(
        () => api("POST", `/api/admin/staff/${shown.id}/reset-pin`, { pin: value }),
        t("admin.staff.pinReset", { name: shown.name }),
      );
    }
  };

  const toggleActive = () =>
    run(
      () => api("PATCH", `/api/admin/staff/${shown.id}`, { active: !shown.active }),
      shown.active ? t("admin.staff.deactivated", { name: shown.name }) : t("admin.staff.activated", { name: shown.name }),
    );

  const menuButton = "flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 text-left text-[15px] font-semibold transition-colors hover:bg-muted";

  return (
    <Sheet open={!!row} onClose={onClose} title={shown.name} description={t(`staff.roles.${shown.role}`)}>
      {mode === "menu" ? (
        <div className="mt-4 space-y-1">
          <button type="button" className={menuButton} onClick={() => { setValue(shown.name); setMode("rename"); }}>
            <Pencil className="size-5 text-fg-muted" aria-hidden />
            {t("admin.staff.rename")}
          </button>
          <button type="button" className={menuButton} onClick={() => setMode("secret")}>
            <KeyRound className="size-5 text-fg-muted" aria-hidden />
            {isManager ? t("admin.staff.resetPassword") : t("admin.staff.resetPin")}
          </button>
          {shown.id !== me.id && (
            <button
              type="button"
              className={cn(menuButton, shown.active ? "text-danger" : "text-success")}
              onClick={() => void toggleActive()}
              disabled={busy}
            >
              <Power className="size-5" aria-hidden />
              {shown.active ? t("admin.staff.deactivate") : t("admin.staff.activate")}
            </button>
          )}
          {error && (
            <p className="px-4 pt-2 text-sm font-medium text-danger" role="alert">
              {error}
            </p>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="mt-5">
          <label className="block text-sm font-semibold" htmlFor="edit-value">
            {mode === "rename" ? t("admin.staff.name") : isManager ? t("admin.staff.newPassword") : t("admin.staff.newPin")}
          </label>
          <input
            id="edit-value"
            autoFocus
            className={cn(input, mode === "secret" && !isManager && "tracking-[0.4em]")}
            type={mode === "secret" && isManager ? "password" : "text"}
            inputMode={mode === "secret" && !isManager ? "numeric" : undefined}
            autoComplete={mode === "secret" ? "new-password" : "off"}
            value={value}
            onChange={(e) =>
              setValue(mode === "secret" && !isManager ? e.target.value.replace(/\D/g, "").slice(0, 6) : e.target.value)
            }
          />
          {mode === "secret" && (
            <p className="mt-2 text-sm text-fg-muted">{isManager ? t("admin.staff.passwordHint") : t("admin.staff.pinHint")}</p>
          )}
          <p className="mt-3 min-h-5 text-sm font-medium text-danger" role="alert">
            {error}
          </p>
          <div className="mt-2 flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setMode("menu")}>
              {t("admin.staff.cancel")}
            </Button>
            <Button type="submit" className="flex-1" disabled={busy || !value.trim()}>
              {busy && <Loader2 className="size-5 animate-spin" aria-hidden />}
              {t("admin.staff.save")}
            </Button>
          </div>
        </form>
      )}
    </Sheet>
  );
}
