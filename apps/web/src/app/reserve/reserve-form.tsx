"use client";

import { brand } from "@app/config";
import { RESERVATION_MIN_NOTICE_MINUTES, bookableTimes, isValidPhone, reservationDateRange, reservationInstant } from "@app/shared";
import { CalendarCheck, Loader2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { LanguageSwitcher } from "@/components/brand/language-switcher";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/brand/theme-toggle";
import { Button } from "@/components/ui/button";
import { CurtainLink } from "@/components/ui/page-curtain";
import { useMounted } from "@/hooks/use-mounted";
import { useT } from "@/i18n";
import { translateError } from "@/i18n/errors";
import { ApiClientError, api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { reservationDay, reservationTimeOf } from "@/lib/format";

interface Booked {
  tableNumber: number;
  startsAt: string;
  partySize: number;
}

const field =
  "mt-1.5 h-12 w-full rounded-2xl bg-muted px-4 ring-1 ring-inset ring-line text-[16px] placeholder:text-fg-muted focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary";
const PARTY_SIZES = Array.from({ length: 12 }, (_, i) => i + 1);

export function ReserveForm() {
  const t = useT();
  // The available times depend on the clock, so the form renders in the browser only.
  const mounted = useMounted();
  const [booked, setBooked] = useState<Booked | null>(null);

  return (
    <main className="min-h-svh">
      <header className="sticky top-0 z-30 glass border-b border-gold-line/50">
        <div className="flex h-16 items-center gap-3 px-4 lg:px-8">
          <CurtainLink href="/" aria-label={`${brand.name} — ${t("common.home")}`} className="pressable rounded-full">
            <Logo size={38} />
          </CurtainLink>
          <h1 className="min-w-0 flex-1 truncate font-display text-[1.35rem] font-semibold leading-tight">{t("reserve.title")}</h1>
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>
      <div className="mx-auto max-w-md px-4 py-8">
        {booked ? (
          <Done booked={booked} />
        ) : (
          <>
            <p className="mb-4 text-[15px] text-fg-muted">{t("reserve.subtitle")}</p>
            {mounted && <Form onBooked={setBooked} />}
          </>
        )}
      </div>
    </main>
  );
}

function Form({ onBooked }: { onBooked: (b: Booked) => void }) {
  const t = useT();
  const range = useMemo(() => reservationDateRange(new Date(), brand.timezone), []);
  const [date, setDate] = useState(range.min);
  const [time, setTime] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState(false);
  const [phoneError, setPhoneError] = useState(false);

  const times = useMemo(() => {
    if (date < range.min || date > range.max) return [];
    const earliest = Date.now() + RESERVATION_MIN_NOTICE_MINUTES * 60_000;
    return bookableTimes(brand.openingHours, date).filter(
      (x) => reservationInstant(date, x, brand.timezone).getTime() >= earliest,
    );
  }, [date, range]);
  const chosen = times.includes(time) ? time : (times[0] ?? "");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!chosen) return;
    setError(null);
    // Say exactly what to fix, in the guest's language, before sending anything.
    const badName = name.trim().length < 2;
    const badPhone = !isValidPhone(phone);
    setNameError(badName);
    setPhoneError(badPhone);
    if (badName || badPhone) return;
    setBusy(true);
    try {
      const res = await api<{ reservation: Booked }>("POST", "/api/reservations", { date, time: chosen, partySize, name, phone });
      onBooked(res.reservation);
    } catch (err) {
      // The API or database is down: nothing the guest typed is wrong, so give them another way to book.
      const down = err instanceof ApiClientError && err.status >= 500;
      setError(down ? t("reserve.unavailable", { phone: brand.contact?.phone ?? "" }) : translateError(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form noValidate onSubmit={(e) => void submit(e)} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-semibold">
          {t("reserve.date")}
          <input type="date" required min={range.min} max={range.max} value={date} onChange={(e) => setDate(e.target.value)} className={field} />
        </label>
        <label className="block text-sm font-semibold">
          {t("reserve.time")}
          <select required value={chosen} onChange={(e) => setTime(e.target.value)} disabled={times.length === 0} className={field}>
            {times.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
      </div>
      {times.length === 0 && <p className="text-sm text-danger">{t("reserve.noTimes")}</p>}
      <label className="block text-sm font-semibold">
        {t("reserve.party")}
        <select value={partySize} onChange={(e) => setPartySize(Number(e.target.value))} className={field}>
          {PARTY_SIZES.map((n) => (
            <option key={n} value={n}>
              {t("reserve.partyCount", { count: n })}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-semibold">
        {t("reserve.name")}
        <input
          required
          maxLength={60}
          autoComplete="name"
          aria-invalid={nameError}
          aria-describedby={nameError ? "reserve-name-error" : undefined}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setNameError(false);
          }}
          className={cn(field, nameError && "ring-2 ring-danger")}
        />
        {nameError && (
          <span id="reserve-name-error" role="alert" className="mt-1.5 block font-normal text-danger">
            {t("reserve.nameError")}
          </span>
        )}
      </label>
      <label className="block text-sm font-semibold">
        {t("reserve.phone")}
        <input
          required
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          maxLength={24}
          placeholder="+998 90 123 45 67"
          aria-invalid={phoneError}
          aria-describedby={phoneError ? "reserve-phone-error" : undefined}
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            setPhoneError(false);
          }}
          className={cn(field, phoneError && "ring-2 ring-danger")}
        />
        {phoneError && (
          <span id="reserve-phone-error" role="alert" className="mt-1.5 block font-normal text-danger">
            {t("reserve.phoneError")}
          </span>
        )}
      </label>
      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={busy || !chosen}>
        {busy && <Loader2 className="size-5 animate-spin" aria-hidden />}
        {t("reserve.submit")}
      </Button>
    </form>
  );
}

function Done({ booked }: { booked: Booked }) {
  const t = useT();
  return (
    <div role="status" className="text-center">
      <CalendarCheck className="mx-auto size-12 text-primary" strokeWidth={1.4} aria-hidden />
      <h2 className="mt-4 text-[1.9rem] leading-tight">{t("reserve.doneTitle")}</h2>
      <p className="mt-3 text-lg font-semibold tabular">
        {t("reserve.doneBody", {
          table: booked.tableNumber,
          date: reservationDay(booked.startsAt),
          time: reservationTimeOf(booked.startsAt),
        })}
      </p>
      <p className="mt-1 text-fg-muted">{t("reserve.partyCount", { count: booked.partySize })}</p>
      {brand.contact?.phone && <p className="mt-5 text-sm text-fg-muted">{t("reserve.change", { phone: brand.contact.phone })}</p>}
    </div>
  );
}
