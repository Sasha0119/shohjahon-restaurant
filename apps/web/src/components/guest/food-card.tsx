"use client";

import type { MenuItem } from "@app/shared";
import { motion } from "framer-motion";
import { Plus, Sparkles } from "lucide-react";
import Image from "next/image";
import { Skeleton } from "@/components/ui/misc";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { DietaryTags } from "./dietary-tags";
import { useGuest } from "./guest-context";
import { needsChoices, useQuickAdd } from "./use-quick-add";

/** Large menu card: photo, name, description, price and a quick-add button. */
export function FoodCard({ item, priority }: { item: MenuItem; priority?: boolean }) {
  const t = useT();
  const { openItem } = useGuest();
  const quickAdd = useQuickAdd();
  const soldOut = !item.inStock;

  return (
    <motion.article
      layout="position"
      className={cn(
        "group relative overflow-hidden rounded-card bg-surface shadow-soft ring-1 ring-line/60 transition-shadow duration-300 hover:shadow-lift",
        soldOut && "opacity-80",
      )}
    >
      <motion.button
        type="button"
        whileTap={{ scale: 0.985 }}
        onClick={() => openItem(item.id)}
        className="block w-full text-left"
        aria-label={`${item.name}, ${formatPrice(item.price)}${soldOut ? `, ${t("menu.soldOut")}` : ""}`}
      >
        <div className="relative aspect-[16/10] overflow-hidden bg-muted">
          <Image
            src={item.image}
            alt={item.imageAlt}
            fill
            priority={priority}
            sizes="(min-width: 768px) 380px, 100vw"
            className={cn(
              "object-cover transition-transform duration-700 ease-[cubic-bezier(.22,1,.36,1)] group-hover:scale-[1.045]",
              soldOut && "grayscale",
            )}
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/10"
          />
          <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
            {item.featured && !soldOut ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-on-secondary shadow-sm">
                <Sparkles className="size-3.5" aria-hidden />
                {t("menu.chefsPick")}
              </span>
            ) : (
              <span />
            )}
            <DietaryTags tags={item.tags} variant="glass" />
          </div>
          {soldOut && (
            <span className="absolute bottom-3 left-3 rounded-full bg-black/70 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white">
              {t("menu.soldOut")}
            </span>
          )}
        </div>
        <div className="p-4 pr-20">
          <h3 className="text-lg font-semibold leading-snug">{item.name}</h3>
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-fg-muted">{item.description}</p>
          <p className="mt-2.5 text-base font-bold tabular">{formatPrice(item.price)}</p>
        </div>
      </motion.button>

      {!soldOut && (
        <motion.button
          type="button"
          whileTap={{ scale: 0.85 }}
          whileHover={{ scale: 1.06 }}
          onClick={() => quickAdd(item)}
          aria-label={needsChoices(item) ? t("menu.customize", { name: item.name }) : t("menu.quickAdd", { name: item.name })}
          className="absolute bottom-4 right-4 grid size-12 place-items-center rounded-full bg-primary text-on-primary shadow-glow"
        >
          <Plus className="size-6" strokeWidth={2.4} aria-hidden />
        </motion.button>
      )}
    </motion.article>
  );
}

export function FoodCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-card bg-surface shadow-soft ring-1 ring-line/60" aria-hidden>
      <Skeleton className="aspect-[16/10] rounded-none" />
      <div className="space-y-2.5 p-4">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-4/5" />
        <Skeleton className="mt-3 h-5 w-16" />
      </div>
    </div>
  );
}

/** Tall photo card for carousels ("Chef's picks"). */
export function FeatureCard({ item, priority }: { item: MenuItem; priority?: boolean }) {
  const { openItem } = useGuest();
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.97 }}
      onClick={() => openItem(item.id)}
      className="group relative block aspect-[4/5] w-[68vw] max-w-[260px] shrink-0 snap-start overflow-hidden rounded-card bg-muted text-left shadow-soft"
      aria-label={`${item.name}, ${formatPrice(item.price)}`}
    >
      <Image
        src={item.image}
        alt={item.imageAlt}
        fill
        priority={priority}
        sizes="260px"
        className="object-cover transition-transform duration-700 group-hover:scale-105"
      />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
      <DietaryTags tags={item.tags} variant="glass" className="absolute right-3 top-3" />
      <div className="absolute inset-x-0 bottom-0 p-4 text-white">
        <h3 className="text-xl font-semibold leading-tight drop-shadow">{item.name}</h3>
        <p className="mt-1 text-[15px] font-semibold text-white/90 tabular">{formatPrice(item.price)}</p>
      </div>
    </motion.button>
  );
}

/** Compact horizontal card for upsell rows. */
export function MiniItemCard({ item }: { item: MenuItem }) {
  const t = useT();
  const { openItem } = useGuest();
  const quickAdd = useQuickAdd();
  return (
    <div className="relative flex w-[15.5rem] shrink-0 snap-start items-center gap-3 rounded-2xl bg-surface p-2.5 pr-14 shadow-soft ring-1 ring-line/60">
      <button
        type="button"
        onClick={() => openItem(item.id)}
        className="flex min-w-0 items-center gap-3 text-left"
      >
        <span className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-muted">
          <Image src={item.image} alt="" fill sizes="64px" className="object-cover" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{item.name}</span>
          <span className="block text-sm text-fg-muted tabular">{formatPrice(item.price)}</span>
        </span>
      </button>
      <motion.button
        type="button"
        whileTap={{ scale: 0.85 }}
        onClick={() => quickAdd(item)}
        aria-label={t("menu.quickAdd", { name: item.name })}
        className="absolute right-2.5 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-primary/12 text-primary"
      >
        <Plus className="size-5" strokeWidth={2.4} aria-hidden />
      </motion.button>
    </div>
  );
}
