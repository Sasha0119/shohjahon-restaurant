"use client";

import { brand, localize } from "@app/config";
import { WEEKDAYS, localParts, openState } from "@app/shared";
import { motion, type Variants } from "framer-motion";
import { ArrowRight, ChevronDown, Clock, MapPin, Phone } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { LanguageSwitcher } from "@/components/brand/language-switcher";
import { Wordmark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/brand/theme-toggle";
import { FeatureCard } from "@/components/guest/food-card";
import { useGuest } from "@/components/guest/guest-context";
import { NicknameCard } from "@/components/guest/nickname-card";
import { TablePill } from "@/components/guest/page-header";
import { LinkButton } from "@/components/ui/button";
import { SectionTitle, Skeleton } from "@/components/ui/misc";
import { useNow } from "@/hooks/use-now";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/cn";
import { formatClock, weekdayName } from "@/lib/format";

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.25 } },
};
const rise: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
};

export default function HomePage() {
  const { t, locale } = useI18n();
  const { base, menuState } = useGuest();
  const { menu } = menuState;
  const featured = menu?.items.filter((i) => i.featured && i.inStock) ?? [];

  return (
    <main>
      {/* ── Hero: full-screen photo, logo, tagline, one clear action ─────────── */}
      <section className="relative isolate flex h-svh min-h-[600px] max-h-[960px] flex-col overflow-hidden text-white">
        <motion.div
          className="absolute inset-0 -z-10"
          initial={{ scale: 1.14 }}
          animate={{ scale: 1.02 }}
          transition={{ duration: 2.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <Image src={brand.heroImage.src} alt={brand.heroImage.alt} fill priority sizes="100vw" className="object-cover" />
        </motion.div>
        <div aria-hidden className="absolute inset-0 -z-10" style={{ background: "var(--hero-tint)" }} />
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background:
              "linear-gradient(180deg, rgba(8,7,5,.72) 0%, rgba(8,7,5,.12) 28%, rgba(8,7,5,.18) 52%, rgba(8,7,5,.86) 80%, var(--bg-color) 100%)",
          }}
        />

        <div className="flex items-center justify-between gap-2 px-4 pt-[max(env(safe-area-inset-top),1rem)]">
          <TablePill onImage />
          <div className="flex items-center gap-2">
            <LanguageSwitcher onImage />
            <ThemeToggle onImage />
          </div>
        </div>

        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="mt-auto flex flex-col items-center px-6 pb-[max(env(safe-area-inset-bottom),2.5rem)] text-center"
        >
          <motion.div variants={rise}>
            <Wordmark size={76} layout="stack" onImage />
          </motion.div>
          <motion.span variants={rise} aria-hidden className="gold-rule mt-6 w-24" />
          <motion.p
            variants={rise}
            className="mt-5 max-w-sm font-display text-[clamp(1.35rem,5.5vw,1.85rem)] italic leading-snug text-white/95"
          >
            {localize(brand.tagline, locale, brand.defaultLanguage)}
          </motion.p>
          <motion.p variants={rise} className="mt-3 text-xs font-semibold uppercase tracking-[0.24em] text-white/70">
            {localize(brand.cuisine, locale, brand.defaultLanguage)}
          </motion.p>
          <motion.div variants={rise} className="mt-6">
            <OpenStatus />
          </motion.div>
          <motion.div variants={rise} className="mt-7 w-full max-w-xs">
            <LinkButton href={`${base}/menu`} size="lg" className="w-full">
              {t("home.viewMenu")}
              <ArrowRight className="size-5" aria-hidden />
            </LinkButton>
          </motion.div>
          <motion.a
            variants={rise}
            href="#picks"
            aria-label={t("home.chefsPicks")}
            className="mt-6 grid size-11 place-items-center rounded-full text-white/70 hover:text-white"
          >
            <motion.span animate={{ y: [0, 5, 0] }} transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}>
              <ChevronDown className="size-6" aria-hidden />
            </motion.span>
          </motion.a>
        </motion.div>
      </section>

      {/* ── Below the fold ───────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-3xl pb-6">
        <p className="px-6 text-center text-[15px] leading-relaxed text-fg-muted">
          {localize(brand.welcomeLine, locale, brand.defaultLanguage)}
        </p>

        <div className="mt-8 px-4">
          <NicknameCard />
        </div>

        <section className="mt-12 scroll-mt-6" id="picks" aria-labelledby="picks-title">
          <SectionTitle id="picks-title" eyebrow title={t("home.chefsPicks")} subtitle={t("home.chefsPicksSub")} className="px-5" />
          <div className="no-scrollbar mt-5 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2">
            {menu
              ? featured.map((item, i) => <FeatureCard key={item.id} item={item} priority={i < 2} />)
              : Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} className="aspect-[4/5] w-[70vw] max-w-[280px] shrink-0 rounded-card" />
                ))}
          </div>
        </section>

        <section className="mt-12 px-4" aria-labelledby="explore">
          <SectionTitle id="explore" eyebrow title={t("home.explore")} className="px-1" />
          <div className="mt-5 grid grid-cols-2 gap-3">
            {menu
              ? menu.categories.map((cat, i) => {
                  const items = menu.items.filter((it) => it.categoryId === cat.id);
                  const cover = items.find((it) => it.featured) ?? items[0];
                  return (
                    <Link
                      key={cat.id}
                      href={`${base}/menu#${cat.slug}`}
                      className={cn(
                        "pressable group relative isolate flex overflow-hidden rounded-card bg-muted p-4 text-white shadow-soft ring-1 ring-gold-line/60",
                        i === 0 ? "col-span-2 aspect-[2/1]" : "aspect-square",
                      )}
                    >
                      {cover && (
                        <Image
                          src={cover.image}
                          alt=""
                          fill
                          sizes={i === 0 ? "(min-width: 768px) 740px, 100vw" : "(min-width: 768px) 370px, 50vw"}
                          className="-z-10 object-cover transition-transform duration-[1.2s] ease-out group-hover:scale-105"
                        />
                      )}
                      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/30 to-black/5" />
                      <div className="mt-auto min-w-0">
                        <p className="font-display text-xl font-semibold leading-tight">{cat.name}</p>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/75">
                          {t("home.dishes", { count: items.length })}
                        </p>
                      </div>
                    </Link>
                  );
                })
              : Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} className={cn("rounded-card", i === 0 ? "col-span-2 aspect-[2/1]" : "aspect-square")} />
                ))}
          </div>
        </section>

        <section className="mt-12 px-4" aria-labelledby="info">
          <h2 id="info" className="sr-only">
            {t("home.hours")}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <OpeningHoursCard />
            <ContactCard />
          </div>
        </section>
      </div>
    </main>
  );
}

function OpenStatus() {
  const { t } = useI18n();
  const now = useNow(60_000);
  if (now === null) return <span className="inline-block h-8" aria-hidden />;
  const state = openState(brand.openingHours, new Date(now), brand.timezone);
  const today = WEEKDAYS[localParts(new Date(now), brand.timezone).dayIdx];
  let label = t("home.closed");
  if (state.isOpen && state.until) label = t("home.openUntil", { time: formatClock(state.until) });
  else if (state.until && state.nextDay === today) label = t("home.closedOpensToday", { time: formatClock(state.until) });
  else if (state.until && state.nextDay) {
    label = t("home.closedOpensOn", { day: weekdayName(state.nextDay), time: formatClock(state.until) });
  }
  return (
    <span className="inline-flex min-h-8 items-center gap-2 rounded-full glass-dark px-3.5 py-1 text-[13px] font-semibold">
      <span className="relative flex size-2">
        {state.isOpen && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
        <span className={cn("relative inline-flex size-2 rounded-full", state.isOpen ? "bg-emerald-400" : "bg-rose-400")} />
      </span>
      {label}
    </span>
  );
}

function OpeningHoursCard() {
  const { t } = useI18n();
  const now = useNow(60_000);
  const todayKey = now === null ? null : WEEKDAYS[localParts(new Date(now), brand.timezone).dayIdx];
  const order = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
  return (
    <div className="card p-5">
      <p className="flex items-center gap-2 font-display text-lg font-semibold">
        <Clock className="size-4.5 text-primary" aria-hidden />
        {t("home.hours")}
      </p>
      <span aria-hidden className="gold-rule mt-3 block w-full opacity-60" />
      <dl className="mt-3 space-y-1 text-sm">
        {order.map((day) => {
          const slots = brand.openingHours[day];
          const isToday = day === todayKey;
          return (
            <div
              key={day}
              className={cn(
                "flex justify-between gap-4 rounded-lg px-2.5 py-1.5",
                isToday ? "bg-primary/10 font-semibold text-fg ring-1 ring-inset ring-gold-line" : "text-fg-muted",
              )}
            >
              <dt className="capitalize">
                {weekdayName(day, "long")}
                {isToday && <span className="sr-only"> ({t("home.today")})</span>}
              </dt>
              <dd className="tabular">
                {slots.length === 0
                  ? t("home.closed")
                  : slots.map((s) => `${formatClock(s.open)} – ${formatClock(s.close)}`).join(", ")}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

function ContactCard() {
  const { t } = useI18n();
  const { contact } = brand;
  const rows = [
    contact.address && {
      icon: MapPin,
      label: contact.address,
      href: contact.mapUrl,
      action: t("home.directions"),
    },
    contact.phone && {
      icon: Phone,
      label: contact.phone,
      href: `tel:${contact.phone.replace(/\s/g, "")}`,
      action: t("home.callUs"),
    },
  ].filter(Boolean) as { icon: typeof MapPin; label: string; href?: string; action: string }[];

  if (rows.length === 0) return null;
  return (
    <div className="card p-5">
      <p className="flex items-center gap-2 font-display text-lg font-semibold">
        <MapPin className="size-4.5 text-primary" aria-hidden />
        {t("home.findUs")}
      </p>
      <span aria-hidden className="gold-rule mt-3 block w-full opacity-60" />
      <ul className="mt-3 space-y-1.5">
        {rows.map(({ icon: Icon, label, href, action }) => (
          <li key={label}>
            <a
              href={href}
              className="pressable flex min-h-12 items-center gap-3 rounded-xl px-2 py-2 text-sm hover:bg-muted"
              {...(href?.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-full ring-1 ring-gold-line text-primary">
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{label}</span>
                <span className="block text-xs text-fg-muted">{action}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
