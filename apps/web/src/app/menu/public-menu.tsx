"use client";

import { brand } from "@app/config";
import { isAvailableAt, type Category, type MenuItem } from "@app/shared";
import { CloudOff, ScanLine } from "lucide-react";
import Image from "next/image";
import { useMemo } from "react";
import { LanguageSwitcher } from "@/components/brand/language-switcher";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/brand/theme-toggle";
import { DietaryTags } from "@/components/guest/dietary-tags";
import { Button } from "@/components/ui/button";
import { CurtainLink } from "@/components/ui/page-curtain";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { useMenu } from "@/hooks/use-menu";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";

/**
 * Read-only: no cart and no table session.
 * It reads the same public GET /api/menu as the guest screens, through the same
 * store, so stock, translations and time-based categories always match them.
 */
export function PublicMenu() {
  const { t } = useI18n();
  const { menu, error, retry } = useMenu();

  const categories = useMemo(() => {
    const now = new Date();
    return (menu?.categories ?? [])
      .filter((c) => isAvailableAt(c.availability, now))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [menu]);

  return (
    <main className="min-h-svh">
      <header className="sticky top-0 z-30 glass border-b border-gold-line/50">
        <div className="flex h-16 items-center gap-3 px-4 lg:px-8">
          <CurtainLink href="/" aria-label={`${brand.name} — ${t("common.home")}`} className="pressable rounded-full">
            <Logo size={38} />
          </CurtainLink>
          <h1 className="min-w-0 flex-1 truncate font-display text-[1.35rem] font-semibold leading-tight">
            {t("menu.title")}
          </h1>
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto max-w-6xl">
        <aside className="mx-4 mt-5 flex gap-4 border-y border-gold-line/50 py-5 lg:mx-8">
          <ScanLine className="mt-0.5 size-7 shrink-0 text-primary" strokeWidth={1.5} aria-hidden />
          <div>
            <h2 className="text-xl leading-snug">{t("landing.title")}</h2>
            <p className="mt-1 text-[15px] text-fg-muted">{t("landing.body")}</p>
            <CurtainLink href="/reserve" className="mt-2 inline-block font-semibold text-primary underline underline-offset-4">
              {t("reserve.cta")}
            </CurtainLink>
          </div>
        </aside>

        {error ? (
          <EmptyState
            icon={CloudOff}
            title={t("menu.loadError")}
            action={<Button onClick={retry}>{t("common.retry")}</Button>}
          />
        ) : !menu ? (
          <MenuSkeleton />
        ) : (
          <Categories categories={categories} items={menu.items} />
        )}
      </div>
    </main>
  );
}

function Categories({ categories, items }: { categories: Category[]; items: MenuItem[] }) {
  const { t } = useI18n();
  return (
    <>
      <nav aria-label={t("menu.categories")} className="sticky top-16 z-20 mt-3 glass border-b border-gold-line/50">
        <ul className="no-scrollbar flex gap-1 overflow-x-auto px-2 lg:px-6">
          {categories.map((c) => (
            <li key={c.id} className="shrink-0">
              <a
                href={`#${c.slug}`}
                className="flex min-h-12 items-center whitespace-nowrap px-3.5 text-[13px] font-label uppercase tracking-[0.08em] text-fg-muted transition-colors hover:text-primary"
              >
                {c.name}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-12 px-4 pb-16 pt-8 lg:px-8">
        {categories.map((c) => {
          const catItems = items.filter((i) => i.categoryId === c.id);
          if (catItems.length === 0) return null;
          return (
            <section key={c.id} id={c.slug} aria-labelledby={`h-${c.slug}`} className="scroll-mt-[8.5rem]">
              <p className="eyebrow">{t("home.dishes", { count: catItems.length })}</p>
              <h2 id={`h-${c.slug}`} className="mt-2 text-[1.9rem] leading-tight">
                {c.name}
              </h2>
              {c.description && <p className="mt-1.5 text-[15px] italic text-fg-muted">{c.description}</p>}
              <ul className="mt-4 grid lg:grid-cols-2 lg:gap-x-10">
                {catItems.map((item) => (
                  <MenuEntry key={item.id} item={item} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}

function MenuEntry({ item }: { item: MenuItem }) {
  const { t } = useI18n();
  const soldOut = !item.inStock;
  return (
    <li className="flex gap-4 border-t border-line py-4">
      <div className="relative size-24 shrink-0 overflow-hidden rounded-2xl bg-muted sm:size-28">
        <Image
          src={item.image}
          alt={item.imageAlt}
          fill
          sizes="112px"
          className={cn("object-cover", soldOut && "grayscale")}
        />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-[1.2rem] leading-snug">{item.name}</h3>
        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-fg-muted">{item.description}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className={cn("text-[15px] font-semibold tabular text-primary", soldOut && "text-fg-muted line-through")}>
            {formatPrice(item.price)}
          </span>
          {soldOut ? (
            <span className="text-xs font-semibold text-fg-muted">{t("menu.soldOut")}</span>
          ) : (
            item.featured && <span className="text-xs font-semibold text-primary">{t("menu.chefsPick")}</span>
          )}
          <DietaryTags tags={item.tags} className="basis-full" />
        </div>
      </div>
    </li>
  );
}

function MenuSkeleton() {
  return (
    <div aria-busy="true" className="space-y-5 px-4 pt-8 lg:px-8">
      <Skeleton className="h-8 w-40" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-4">
          <Skeleton className="size-24 shrink-0 rounded-2xl sm:size-28" />
          <div className="flex-1 space-y-2.5 pt-1">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}
