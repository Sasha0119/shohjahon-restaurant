"use client";

import { Eye, EyeOff, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { StaffAuthLayout } from "@/components/staff/auth-layout";
import { safeNext } from "@/components/staff/staff-session";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { ApiClientError, api, homeForRole, type StaffMe } from "@/lib/api";
import { formatTime } from "@/lib/format";

export default function ManagerLoginPage() {
  return (
    <Suspense>
      <ManagerLogin />
    </Suspense>
  );
}

const field =
  "mt-1.5 h-12 w-full rounded-2xl bg-muted px-4 ring-1 ring-inset ring-line text-[16px] placeholder:text-fg-muted focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary";

function ManagerLogin() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { staff } = await api<{ staff: StaffMe }>("POST", "/api/auth/login", { email, password });
      router.replace(safeNext(params.get("next"), homeForRole[staff.role]));
    } catch (err) {
      setPassword("");
      if (err instanceof ApiClientError && err.code === "ACCOUNT_LOCKED") {
        const until = (err.details as { lockedUntil?: string })?.lockedUntil;
        setError(t("staff.locked", { time: until ? formatTime(Date.parse(until)) : "" }));
      } else if (err instanceof ApiClientError && err.status === 429) {
        setError(t("staff.rateLimited"));
      } else if (err instanceof ApiClientError && (err.status === 401 || err.status === 400)) {
        setError(t("staff.invalid"));
      } else {
        setError(t("errors.generic"));
      }
      setBusy(false);
    }
  };

  return (
    <StaffAuthLayout
      title={t("staff.managerTitle")}
      subtitle={t("staff.managerSubtitle")}
      footer={
        <Link href="/staff" className="text-sm font-semibold text-primary hover:underline">
          {t("staff.pinLink")}
        </Link>
      }
    >
      <form onSubmit={submit} noValidate>
        <label className="block text-sm font-semibold" htmlFor="email">
          {t("staff.email")}
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={field}
        />
        <label className="mt-4 block text-sm font-semibold" htmlFor="password">
          {t("staff.password")}
        </label>
        <div className="relative">
          <input
            id="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`${field} pr-12`}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? t("staff.hidePassword") : t("staff.showPassword")}
            className="absolute right-1 top-1/2 grid size-11 -translate-y-[calc(50%-3px)] place-items-center rounded-full text-fg-muted hover:text-fg"
          >
            {show ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
          </button>
        </div>
        <p className="mt-3 min-h-5 text-sm font-medium text-danger" role="alert">
          {error}
        </p>
        <Button type="submit" size="lg" className="mt-2 w-full" disabled={busy || !email || !password}>
          {busy && <Loader2 className="size-5 animate-spin" aria-hidden />}
          {t("staff.signIn")}
        </Button>
      </form>
    </StaffAuthLayout>
  );
}
