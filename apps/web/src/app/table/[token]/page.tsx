"use client";

import { brand, localize } from "@app/config";
import { WEEKDAYS, localParts, openState } from "@app/shared";
import { motion, type Variants } from "framer-motion";
import { ArrowRight, Clock, MapPin, Phone, Wifi } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
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
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } },
};
const rise: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

export default function HomePage() {
  const { t, locale } = useI18n();
  const { base, menuState } = useGuest();
  const { menu } = menuState;
  const featured = menu?.items.filter((i) => i.featured && i.inStock) ?? [];

  return (
    <main>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative isolate flex h-[78svh] min-h-[540px] max-h-[820px] flex-col overflow-hidden text-white md:mx-4 md:mt-4 md:rounded-[2rem]">
        <motion.div
          className="absolute inset-0 -z-10"
          initial={{ scale: 1.12 }}
          animate={{ scale: 1 }}
          transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <Image
            src={brand.heroImage.src}
            alt={brand.heroImage.alt}
            fill
            priority
            sizes="(min-width: 768px) 768px, 100vw"
            className="object-cover"
          />
        </motion.div>
        <div aria-hidden className="absolute inset-0 -z-10" style={{ background: "var(--hero-tint)" }} />
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background:
              "linear-gradient(180deg, rgba(0,0,0,.50) 0%, rgba(0,0,0,0) 26%, rgba(0,0,0,.08) 48%, rgba(0,0,0,.78) 82%, rgba(0,0,0,.88) 100%)",
          }}
        />

        <div className="flex items-center justify-between gap-3 px-4 pt-[max(env(safe-area-inset-top),1rem)]">
          <div className="flex items-center gap-2.5">
            <Logo size={42} onImage />
            <span className="text-sm font-semibold tracking-wide text-white/90 drop-shadow">{brand.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <TablePill onImage />
            <ThemeToggle onImage />
          </div>
        </div>

        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="mt-auto px-5 pb-14 sm:px-8"
        >
          <motion.div variants={rise}>
            <OpenStatus />
          </motion.div>
          <motion.p variants={rise} className="mt-5 text-sm font-semibold uppercase tracking-[0.2em] text-white/75">
            {t("home.welcomeTo")}
          </motion.p>
          <motion.h1
            variants={rise}
            className="mt-2 text-[clamp(2.6rem,11vw,4.5rem)] font-semibold leading-[0.95] drop-shadow-sm"
          >
            {brand.name}
          </motion.h1>
          <motion.p variants={rise} className="mt-4 max-w-md text-[17px] leading-relaxed text-white/85">
            {localize(brand.welcomeLine, locale)}
          </motion.p>
          <motion.div variants={rise} className="mt-7 flex flex-wrap gap-3">
            <LinkButton href={`${base}/menu`} size="lg" className="pr-5">
              {t("home.viewMenu")}
              <ArrowRight className="size-5" aria-hidden />
            </LinkButton>
            <LinkButton href={`${base}/wifi`} size="lg" variant="glass">
              <Wifi className="size-5" aria-hidden />
              {t("home.wifi")}
            </LinkButton>
          </motion.div>
        </motion.div>
      </section>

      {/* ── Content sheet overlapping the hero ───────────────── */}
      <div className="relative -mt-6 rounded-t-[1.75rem] bg-bg pt-6 md:mt-6 md:rounded-none md:pt-0">
        <div className="px-4">
          <NicknameCard />
        </div>

        <section className="mt-10" aria-labelledby="picks">
          <SectionTitle id="picks" title={t("home.chefsPicks")} subtitle={t("home.chefsPicksSub")} className="px-5" />
          <div className="no-scrollbar mt-4 flex snap-x snap-mandatory scroll-px-4 gap-3.5 overflow-x-auto px-4 pb-2">
            {menu
              ? featured.map((item, i) => <FeatureCard key={item.id} item={item} priority={i < 2} />)
              : Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} className="aspect-[4/5] w-[68vw] max-w-[260px] shrink-0 rounded-card" />
                ))}
          </div>
        </section>

        <section className="mt-10 px-4" aria-labelledby="explore">
          <SectionTitle id="explore" title={t("home.explore")} className="px-1" />
          <div className="mt-4 grid grid-cols-2 gap-3">
            {menu
              ? menu.categories.map((cat, i) => {
                  const items = menu.items.filter((it) => it.categoryId === cat.id);
                  const cover = items.find((it) => it.featured) ?? items[0];
                  return (
                    <Link
                      key={cat.id}
                      href={`${base}/menu#${cat.slug}`}
                      className={cn(
                        "group relative isolate flex overflow-hidden rounded-card bg-muted p-4 text-white shadow-soft transition-transform active:scale-[0.98]",
                        i === 0 ? "col-span-2 aspect-[2/1]" : "aspect-square",
                      )}
                    >
                      {cover && (
                        <Image
                          src={cover.image}
                          alt=""
                          fill
                          sizes={i === 0 ? "(min-width: 768px) 740px, 100vw" : "(min-width: 768px) 370px, 50vw"}
                          className="-z-10 object-cover transition-transform duration-700 group-hover:scale-105"
                        />
                      )}
                      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/25 to-black/5" />
                      <div className="mt-auto">
                        <p className="font-display text-xl font-semibold leading-tight">{cat.name}</p>
                        <p className="mt-0.5 text-sm text-white/80">{t("home.dishes", { count: items.length })}</p>
                      </div>
                    </Link>
                  );
                })
              : Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} className={cn("rounded-card", i === 0 ? "col-span-2 aspect-[2/1]" : "aspect-square")} />
                ))}
          </div>
        </section>

        <section className="mt-10 px-4" aria-labelledby="info">
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
    <span className="inline-flex h-8 items-center gap-2 rounded-full glass-dark px-3 text-sm font-semibold">
      <span className="relative flex size-2">
        {state.isOpen && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
        <span className={cn("relative inline-flex size-2 rounded-full", state.isOpen ? "bg-emerald-400" : "bg-rose-400")} />
      </span>
      {label}
    </span>
  );
}

function OpeningHoursCard() {
  const { t, locale } = useI18n();
  const now = useNow(60_000);
  const todayKey = now === null ? null : WEEKDAYS[localParts(new Date(now), brand.timezone).dayIdx];
  const order = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
  return (
    <div className="rounded-card bg-surface p-5 shadow-soft ring-1 ring-line/60">
      <p className="flex items-center gap-2 font-semibold">
        <Clock className="size-4.5 text-primary" aria-hidden />
        {t("home.hours")}
      </p>
      <dl className="mt-3 space-y-1.5 text-sm">
        {order.map((day) => {
          const slots = brand.openingHours[day];
          const isToday = day === todayKey;
          return (
            <div
              key={day}
              className={cn(
                "flex justify-between gap-4 rounded-lg px-2 py-1",
                isToday ? "bg-primary/10 font-semibold text-fg" : "text-fg-muted",
              )}
            >
              <dt>
                {weekdayName(day, "long", locale)}
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
    <div className="rounded-card bg-surface p-5 shadow-soft ring-1 ring-line/60">
      <p className="flex items-center gap-2 font-semibold">
        <MapPin className="size-4.5 text-primary" aria-hidden />
        {t("home.findUs")}
      </p>
      <ul className="mt-3 space-y-2">
        {rows.map(({ icon: Icon, label, href, action }) => (
          <li key={label}>
            <a
              href={href}
              className="flex min-h-12 items-center gap-3 rounded-xl px-2 py-2 text-sm transition-colors hover:bg-muted"
              {...(href?.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted">
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{label}</span>
                <span className="block text-xs text-fg-muted">{action}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
