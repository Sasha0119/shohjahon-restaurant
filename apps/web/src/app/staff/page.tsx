"use client";

import { ArrowLeft, Check, CloudOff, Delete, Loader2, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState, useRef } from "react";
import { StaffAuthLayout } from "@/components/staff/auth-layout";
import { safeNext } from "@/components/staff/staff-session";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { useT } from "@/i18n";
import { ApiClientError, api, homeForRole, type StaffMe } from "@/lib/api";
import { cn } from "@/lib/cn";
import { shake } from "@/lib/shake";
import { formatTime } from "@/lib/format";

export default function PinLoginPage() {
  return (
    <Suspense>
      <PinLogin />
    </Suspense>
  );
}

function PinLogin() {
  const t = useT();
  const [staff, setStaff] = useState<StaffMe[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<StaffMe | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    api<{ staff: StaffMe[] }>("GET", "/api/auth/pin-staff")
      .then((r) => setStaff(r.staff))
      .catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);

  return (
    <StaffAuthLayout
      title={selected ? t("staff.pinFor", { name: selected.name }) : t("staff.whoAreYou")}
      footer={
        <Link href="/staff/manager" className="text-sm font-semibold text-primary hover:underline">
          {t("staff.managerLink")}
        </Link>
      }
    >
      <>
        {selected ? (
          <div className="enter" key="pin">
            <PinPad person={selected} onBack={() => setSelected(null)} />
          </div>
        ) : (
          <div className="enter" key="who">
            {failed ? (
              <EmptyState
                icon={CloudOff}
                title={t("errors.generic")}
                className="py-6"
                action={<Button onClick={load}>{t("common.retry")}</Button>}
              />
            ) : !staff ? (
              <div className="grid grid-cols-2 gap-3" aria-busy="true">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="h-28 rounded-2xl" />
                ))}
              </div>
            ) : staff.length === 0 ? (
              <p className="py-6 text-center text-[15px] text-fg-muted">{t("staff.noPinStaff")}</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3">
                {staff.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(s)}
                      className="pressable flex h-full min-h-28 w-full flex-col items-center justify-center gap-2 rounded-2xl bg-muted/60 p-3 text-center ring-1 ring-line transition-colors hover:bg-muted"
                    >
                      <span className="grid size-12 place-items-center rounded-full bg-primary text-lg font-semibold text-on-primary shadow-glow">
                        {s.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="line-clamp-1 font-semibold">{s.name}</span>
                      <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
                        {t(`staff.roles.${s.role}`)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </>
    </StaffAuthLayout>
  );
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "del", "0", "ok"] as const;

function PinPad({ person, onBack }: { person: StaffMe; onBack: () => void }) {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dots = useRef<HTMLDivElement>(null);

  const submit = useCallback(
    async (value: string) => {
      if (value.length < 4 || busy) return;
      setBusy(true);
      setError(null);
      try {
        const { staff } = await api<{ staff: StaffMe }>("POST", "/api/auth/pin", { staffId: person.id, pin: value });
        router.replace(safeNext(params.get("next"), homeForRole[staff.role]));
      } catch (e) {
        setPin("");
        if (e instanceof ApiClientError && e.code === "ACCOUNT_LOCKED") {
          const until = (e.details as { lockedUntil?: string })?.lockedUntil;
          setError(t("staff.locked", { time: until ? formatTime(Date.parse(until)) : "" }));
        } else if (e instanceof ApiClientError && e.status === 429) {
          setError(t("staff.rateLimited"));
        } else if (e instanceof ApiClientError && e.status === 401) {
          setError(t("staff.invalid"));
        } else {
          setError(t("errors.generic"));
        }
        shake(dots.current, 12);
        navigator.vibrate?.(60);
      } finally {
        setBusy(false);
      }
    },
    [busy, params, person.id, router, t],
  );

  const press = useCallback(
    (key: (typeof KEYS)[number]) => {
      if (busy) return;
      if (key === "del") return setPin((p) => p.slice(0, -1));
      if (key === "ok") return void submit(pin);
      setError(null);
      setPin((p) => (p.length >= 6 ? p : p + key));
    },
    [busy, pin, submit],
  );

  // Physical keyboard support.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A focused on-screen key already handles Enter/Space as a click.
      if (e.target instanceof HTMLButtonElement && (e.key === "Enter" || e.key === " ")) return;
      if (/^\d$/.test(e.key)) press(e.key as (typeof KEYS)[number]);
      else if (e.key === "Backspace") press("del");
      else if (e.key === "Enter") press("ok");
      else if (e.key === "Escape") onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press, onBack]);

  const slots = Math.max(4, pin.length);

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="-ml-1 inline-flex min-h-11 items-center gap-1.5 rounded-card px-2 text-sm font-semibold text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("staff.notYou")}
      </button>

      <div className="mt-2 flex flex-col items-center">
        <span className="grid size-14 place-items-center rounded-full bg-primary/12 text-primary">
          <UserRound className="size-7" aria-hidden />
        </span>
        <div
          ref={dots}
          className="mt-5 flex h-6 items-center gap-3.5"
          role="status"
          aria-label={t("staff.pinDigits", { count: pin.length })}
        >
          {Array.from({ length: slots }, (_, i) => (
            <span
              key={i}
              className={cn(
                "size-3.5 rounded-full transition-[background-color,transform]",
                i < pin.length ? "scale-100" : "scale-75",
                i < pin.length ? (error ? "bg-danger" : "bg-primary") : "bg-fg/15",
              )}
            />
          ))}
        </div>
        <p className="mt-3 h-5 text-center text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      </div>

      <div className="mx-auto mt-4 grid max-w-xs grid-cols-3 gap-3">
        {KEYS.map((key) => {
          const label =
            key === "del" ? t("staff.deleteDigit") : key === "ok" ? t("staff.signIn") : undefined;
          return (
            <button
              key={key}
              type="button"
              onClick={() => press(key)}
              disabled={busy || (key === "ok" && pin.length < 4) || (key === "del" && pin.length === 0)}
              aria-label={label}
              className={`pressable ${cn(
                "grid h-16 place-items-center rounded-2xl text-2xl font-semibold tabular transition-colors disabled:opacity-35",
                key === "ok" ? "bg-primary text-on-primary shadow-glow" : "bg-muted/70 hover:bg-muted",
              )}`}
            >
              {key === "del" ? (
                <Delete className="size-6" aria-hidden />
              ) : key === "ok" ? (
                busy ? <Loader2 className="size-6 animate-spin" aria-hidden /> : <Check className="size-7" aria-hidden />
              ) : (
                key
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
