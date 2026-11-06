"use client";

import { CloudOff, Loader2, Plus, TicketPercent } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Field, MoneyField, Switch, apiMessage, fieldErrors, inputClass } from "@/components/admin/form";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Segmented, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { useT } from "@/i18n";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDate, formatPrice } from "@/lib/format";

interface Discount {
  id: string;
  code: string;
  kind: "percent" | "fixed";
  value: number;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  minSubtotalCents: number | null;
}

const fmtDate = (iso: string) => formatDate(new Date(iso), { dateStyle: "medium" });

export default function DiscountsPage() {
  const t = useT();
  const [list, setList] = useState<Discount[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ discounts: Discount[] }>("GET", "/api/admin/discounts")
      .then((r) => {
        setList(r.discounts);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);

  const toggle = async (d: Discount) => {
    setBusy(d.id);
    try {
      const { discount } = await api<{ discount: Discount }>("PATCH", `/api/admin/discounts/${d.id}`, { active: !d.active });
      setList((l) => (l ?? []).map((x) => (x.id === d.id ? discount : x)));
      toast.success(t("admin.discounts.updated"));
    } catch (e) {
      toast.error(apiMessage(e, t));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[2.1rem] font-semibold leading-tight">{t("admin.discounts.title")}</h1>
          <p className="mt-1 text-fg-muted">{t("admin.discounts.subtitle")}</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-5" aria-hidden />
          {t("admin.discounts.add")}
        </Button>
      </div>

      <div className="mt-8">
        {failed && !list ? (
          <EmptyState icon={CloudOff} title={t("errors.generic")} action={<Button onClick={load}>{t("common.retry")}</Button>} />
        ) : !list ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-36 rounded-card" />
            <Skeleton className="h-36 rounded-card" />
          </div>
        ) : list.length === 0 ? (
          <EmptyState icon={TicketPercent} title={t("admin.discounts.empty")} />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            <>
              {list.map((d) => (
                <li
                  key={d.id}
                  className={`enter ${cn("relative overflow-hidden card p-5", !d.active && "opacity-60")}`}
                >
                  {/* Ticket-style notches */}
                  <span aria-hidden className="absolute -left-3 top-1/2 size-6 -translate-y-1/2 rounded-full bg-bg ring-1 ring-line" />
                  <span aria-hidden className="absolute -right-3 top-1/2 size-6 -translate-y-1/2 rounded-full bg-bg ring-1 ring-line" />
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-xl font-bold tracking-wider">{d.code}</p>
                      <p className="mt-0.5 font-display text-2xl font-semibold text-primary">
                        {d.kind === "percent"
                          ? t("admin.discounts.percentValue", { value: d.value })
                          : t("admin.discounts.fixedValue", { value: formatPrice(d.value) })}
                      </p>
                    </div>
                    {busy === d.id ? (
                      <Loader2 className="size-5 animate-spin text-fg-muted" aria-hidden />
                    ) : (
                      <Switch compact checked={d.active} onChange={() => void toggle(d)} label={`${d.code}: ${t("admin.discounts.active")}`} />
                    )}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 text-sm">
                    <Badge tone={d.active ? "success" : "muted"}>{d.active ? t("admin.discounts.active") : t("admin.discounts.inactive")}</Badge>
                    <Badge>
                      {d.maxRedemptions
                        ? t("admin.discounts.usesOf", { count: d.redemptionCount, max: d.maxRedemptions })
                        : t("admin.discounts.uses", { count: d.redemptionCount })}
                    </Badge>
                    {d.minSubtotalCents != null && <Badge>{t("admin.discounts.minOrder", { amount: formatPrice(d.minSubtotalCents) })}</Badge>}
                    {d.startsAt && <Badge>{t("admin.discounts.from", { date: fmtDate(d.startsAt) })}</Badge>}
                    {d.endsAt && <Badge>{t("admin.discounts.until", { date: fmtDate(d.endsAt) })}</Badge>}
                  </div>
                </li>
              ))}
            </>
          </ul>
        )}
      </div>

      <CreateSheet open={creating} onClose={() => setCreating(false)} onCreated={(d) => setList((l) => [d, ...(l ?? [])])} />
    </div>
  );
}

function CreateSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (d: Discount) => void }) {
  const t = useT();
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"percent" | "fixed">("percent");
  const [percent, setPercent] = useState("10");
  const [fixed, setFixed] = useState<number | null>(null);
  const [max, setMax] = useState("");
  const [min, setMin] = useState<number | null>(null);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCode("");
    setKind("percent");
    setPercent("10");
    setFixed(null);
    setMax("");
    setMin(null);
    setStartsAt("");
    setEndsAt("");
    setErrors({});
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const { discount } = await api<{ discount: Discount }>("POST", "/api/admin/discounts", {
        code,
        kind,
        value: kind === "percent" ? Number(percent) : fixed ?? 0,
        ...(max ? { maxRedemptions: Number(max) } : {}),
        ...(min != null ? { minSubtotalCents: min } : {}),
        ...(startsAt ? { startsAt: new Date(startsAt).toISOString() } : {}),
        ...(endsAt ? { endsAt: new Date(endsAt).toISOString() } : {}),
      });
      onCreated(discount);
      toast.success(t("admin.discounts.created", { code: discount.code }));
      onClose();
    } catch (err) {
      const f = fieldErrors(err, t);
      setErrors(f);
      if (!Object.keys(f).length) toast.error(apiMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={t("admin.discounts.add")}>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <Field label={t("admin.discounts.code")} hint={t("admin.discounts.codeHint")} error={errors.code}>
          <input
            className={cn(inputClass, "font-mono uppercase tracking-wider")}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32))}
            required
          />
        </Field>
        <Field label={t("admin.discounts.kind")}>
          <Segmented
            label={t("admin.discounts.kind")}
            value={kind}
            onChange={setKind}
            options={[
              { value: "percent", label: t("admin.discounts.percent") },
              { value: "fixed", label: t("admin.discounts.fixed") },
            ]}
          />
        </Field>
        <Field label={t("admin.discounts.value")} error={errors.value}>
          {kind === "percent" ? (
            <div className="relative">
              <input
                className={cn(inputClass, "pr-10")}
                inputMode="decimal"
                value={percent}
                onChange={(e) => setPercent(e.target.value.replace(/[^\d.]/g, "").slice(0, 5))}
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 font-semibold text-fg-muted">%</span>
            </div>
          ) : (
            <MoneyField cents={fixed} onChange={setFixed} />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("admin.discounts.maxRedemptions")} error={errors.maxRedemptions}>
            <input className={inputClass} inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, "").slice(0, 6))} />
          </Field>
          <Field label={t("admin.discounts.minSubtotal")} error={errors.minSubtotalCents}>
            <MoneyField cents={min} onChange={setMin} />
          </Field>
          <Field label={t("admin.discounts.startsAt")} error={errors.startsAt}>
            <input type="date" className={inputClass} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </Field>
          <Field label={t("admin.discounts.endsAt")} error={errors.endsAt}>
            <input type="date" className={inputClass} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </Field>
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={busy || code.length < 3}>
          {busy && <Loader2 className="size-5 animate-spin" aria-hidden />}
          {t("admin.discounts.create")}
        </Button>
      </form>
    </Sheet>
  );
}
