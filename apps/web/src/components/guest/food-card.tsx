"use client";

import type { MenuItem } from "@app/shared";
import { Plus, Sparkles } from "lucide-react";
import Image from "next/image";
import { Skeleton } from "@/components/ui/misc";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { DietaryTags } from "./dietary-tags";
import { useGuest } from "./guest-context";
import { needsChoices, useQuickAdd } from "./use-quick-add";

/** A clear "sold out" seal across a photo: dimmed, desaturated, an ivory-on-black label. */
function SoldOutSeal({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-black/45">
      <span className="glass-photo rounded-card px-4 py-1.5 text-[11px] font-label uppercase tracking-[0.08em]">
        {label}
      </span>
    </div>
  );
}

/** Large menu card: photo, name, description, price and a quick-add button. */
export function FoodCard({ item, priority }: { item: MenuItem; priority?: boolean }) {
  const t = useT();
  const { openItem } = useGuest();
  const quickAdd = useQuickAdd();
  const soldOut = !item.inStock;

  return (
    <article className="glass-card lift group relative overflow-hidden rounded-card">
      <button
        type="button"
        onClick={() => openItem(item.id)}
        className="pressable-soft block w-full text-left"
        aria-label={`${item.name}, ${formatPrice(item.price)}${soldOut ? `, ${t("menu.soldOut")}` : ""}`}
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-muted">
          <Image
            src={item.image}
            alt={item.imageAlt}
            fill
            priority={priority}
            sizes="(min-width: 1536px) 360px, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className={cn(
              "object-cover transition-transform duration-[900ms] ease-[cubic-bezier(.22,1,.36,1)] group-hover:scale-[1.05]",
              soldOut && "grayscale",
            )}
          />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/15" />
          <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
            {item.featured && !soldOut ? (
              <span className="glass-photo inline-flex items-center gap-1.5 rounded-card px-2.5 py-1 text-[11px] font-label uppercase tracking-[0.08em] !text-[#E7D6AE]">
                <Sparkles className="size-3.5" aria-hidden />
                {t("menu.chefsPick")}
              </span>
            ) : (
              <span />
            )}
            <DietaryTags tags={item.tags} variant="glass" />
          </div>
          {soldOut && <SoldOutSeal label={t("menu.soldOut")} />}
        </div>
        <div className={cn("p-4 pr-[4.5rem]", soldOut && "opacity-70")}>
          <h3 className="font-display text-[1.2rem] font-semibold leading-snug">{item.name}</h3>
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-fg-muted">{item.description}</p>
          <p className={cn("mt-3 text-[15px] font-semibold tabular text-primary", soldOut && "text-fg-muted line-through")}>
            {formatPrice(item.price)}
          </p>
        </div>
      </button>

      {!soldOut && (
        <button
          type="button"
          onClick={() => quickAdd(item)}
          aria-label={needsChoices(item) ? t("menu.customize", { name: item.name }) : t("menu.quickAdd", { name: item.name })}
          className="pressable absolute bottom-4 right-4 grid size-12 place-items-center rounded-full bg-primary text-on-primary shadow-[inset_0_1px_0_rgb(255_255_255/0.3),var(--shadow-glow)]"
        >
          <Plus className="size-6" strokeWidth={2.2} aria-hidden />
        </button>
      )}
    </article>
  );
}

export function FoodCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("glass-card overflow-hidden rounded-card", className)} aria-hidden>
      <Skeleton className="aspect-[4/3] rounded-none" />
      <div className="space-y-2.5 p-4">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-4/5" />
        <Skeleton className="mt-3 h-5 w-24" />
      </div>
    </div>
  );
}

/** Tall photo card for carousels ("Chef's picks"). */
export function FeatureCard({ item, priority }: { item: MenuItem; priority?: boolean }) {
  const t = useT();
  const { openItem } = useGuest();
  return (
    <button
      type="button"
      onClick={() => openItem(item.id)}
      className="pressable group relative block aspect-[4/5] w-[70vw] max-w-[280px] shrink-0 snap-start overflow-hidden rounded-card bg-muted text-left shadow-soft ring-1 ring-gold-line/70"
      aria-label={`${item.name}, ${formatPrice(item.price)}`}
    >
      <Image
        src={item.image}
        alt={item.imageAlt}
        fill
        priority={priority}
        sizes="280px"
        className="object-cover transition-transform duration-[1.1s] ease-out group-hover:scale-105"
      />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />
      <DietaryTags tags={item.tags} variant="glass" className="absolute right-3 top-3" />
      <div className="absolute inset-x-0 bottom-0 p-5 text-white">
        <p className="text-[10px] font-label uppercase tracking-[0.08em] text-[#E7D6AE]">{t("menu.chefsPick")}</p>
        <h3 className="mt-1.5 font-display text-[1.45rem] font-semibold leading-tight">{item.name}</h3>
        <span aria-hidden className="mt-3 block h-px w-10 bg-[#C9A45C]" />
        <p className="mt-3 text-[15px] font-semibold text-white/95 tabular">{formatPrice(item.price)}</p>
      </div>
    </button>
  );
}

/** Compact horizontal card for upsell rows ("Goes well with", "Complete your meal"). */
export function MiniItemCard({ item }: { item: MenuItem }) {
  const t = useT();
  const { openItem } = useGuest();
  const quickAdd = useQuickAdd();
  return (
    <div className="glass-card relative flex w-[16rem] shrink-0 snap-start items-center gap-3 rounded-2xl p-2.5 pr-14">
      <button type="button" onClick={() => openItem(item.id)} className="pressable flex min-w-0 items-center gap-3 text-left">
        <span className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-muted">
          <Image src={item.image} alt="" fill sizes="64px" className="object-cover" />
        </span>
        <span className="min-w-0">
          <span className="line-clamp-2 font-display text-[15px] font-semibold leading-tight">{item.name}</span>
          <span className="mt-1 block text-sm text-primary tabular">{formatPrice(item.price)}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => quickAdd(item)}
        aria-label={t("menu.quickAdd", { name: item.name })}
        className="absolute right-2.5 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full text-primary ring-1 ring-gold-line hover:bg-primary/10 active:brightness-90"
      >
        <Plus className="size-5" strokeWidth={2.2} aria-hidden />
      </button>
    </div>
  );
}
