"use client";

import { isAvailableAt, type Category, type MenuItem } from "@app/shared";
import { AnimatePresence, motion } from "framer-motion";
import { CloudOff, Search, SearchX, X } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { FoodCard, FoodCardSkeleton } from "@/components/guest/food-card";
import { useGuest } from "@/components/guest/guest-context";
import { PageHeader } from "@/components/guest/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/cn";

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

export default function MenuPage() {
  const { t } = useI18n();
  const { menuState, table } = useGuest();
  const { menu, error, retry } = menuState;
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  // Time-based menus: hide categories outside their window.
  const categories = useMemo(() => {
    const now = new Date();
    return (menu?.categories ?? [])
      .filter((c) => isAvailableAt(c.availability, now))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [menu]);

  const results = useMemo(() => {
    const q = normalize(deferredQuery.trim());
    if (!q || !menu) return null;
    const visible = new Set(categories.map((c) => c.id));
    return menu.items.filter((item) => {
      if (!visible.has(item.categoryId)) return false;
      const haystack = normalize(
        [item.name, item.description, ...item.tags.map((tag) => t(`tags.${tag}`))].join(" "),
      );
      return q.split(/\s+/).every((word) => haystack.includes(word));
    });
  }, [deferredQuery, menu, categories, t]);

  return (
    <main>
      <PageHeader title={t("menu.title")} subtitle={t("common.table", { number: table.number })} />

      <div className="px-4 pt-4">
        <SearchField value={query} onChange={setQuery} />
      </div>

      {error ? (
        <EmptyState
          icon={CloudOff}
          title={t("menu.loadError")}
          action={<Button onClick={retry}>{t("common.retry")}</Button>}
        />
      ) : !menu ? (
        <MenuSkeleton />
      ) : results ? (
        <SearchResults items={results} query={deferredQuery.trim()} />
      ) : (
        <CategorizedMenu categories={categories} items={menu.items} />
      )}
    </main>
  );
}

function SearchField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-fg-muted" aria-hidden />
      <input
        ref={inputRef}
        type="search"
        inputMode="search"
        enterKeyHint="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("menu.searchPlaceholder")}
        aria-label={t("menu.searchLabel")}
        className="h-13 w-full rounded-full bg-surface pl-12 pr-12 shadow-soft ring-1 ring-line/70 placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-primary [&::-webkit-search-cancel-button]:hidden"
      />
      <AnimatePresence>
        {value && (
          <motion.button
            type="button"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            onClick={() => {
              onChange("");
              inputRef.current?.focus();
            }}
            aria-label={t("menu.clearSearch")}
            className="absolute right-1.5 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full text-fg-muted hover:bg-muted"
          >
            <X className="size-5" aria-hidden />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

function CategorizedMenu({ categories, items }: { categories: Category[]; items: MenuItem[] }) {
  const { t } = useI18n();
  const [active, setActive] = useState(categories[0]?.slug ?? "");
  const chipsRef = useRef<HTMLDivElement>(null);
  const clickLock = useRef(0);

  // Scroll-spy: highlight the category currently under the sticky chips.
  useEffect(() => {
    const sections = categories
      .map((c) => document.getElementById(c.slug))
      .filter((el): el is HTMLElement => !!el);
    const observer = new IntersectionObserver(
      (entries) => {
        if (Date.now() < clickLock.current) return;
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        const top = visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]!;
        setActive(top.target.id);
      },
      { rootMargin: "-140px 0px -55% 0px", threshold: 0 },
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [categories]);

  // Keep the active chip visible inside the horizontal chip bar.
  useEffect(() => {
    const bar = chipsRef.current;
    const chip = bar?.querySelector<HTMLElement>(`[data-slug="${active}"]`);
    if (!bar || !chip) return;
    bar.scrollTo({ left: chip.offsetLeft - bar.clientWidth / 2 + chip.clientWidth / 2, behavior: "smooth" });
  }, [active]);

  // Deep links from the home screen, e.g. /menu#desserts
  useEffect(() => {
    const slug = decodeURIComponent(window.location.hash.slice(1));
    if (!slug) return;
    const el = document.getElementById(slug);
    if (el) {
      setActive(slug);
      clickLock.current = Date.now() + 800;
      requestAnimationFrame(() => el.scrollIntoView({ block: "start" }));
    }
  }, []);

  const goTo = (slug: string) => {
    setActive(slug);
    clickLock.current = Date.now() + 900;
    document.getElementById(slug)?.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${slug}`);
  };

  let cardIndex = 0;
  return (
    <>
      <nav
        aria-label={t("menu.categories")}
        className="sticky top-16 z-20 mt-3 border-b border-line/40 glass"
      >
        <div ref={chipsRef} className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-2.5">
          {categories.map((c) => {
            const isActive = c.slug === active;
            return (
              <button
                key={c.id}
                type="button"
                data-slug={c.slug}
                onClick={() => goTo(c.slug)}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "relative h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors",
                  isActive ? "text-on-primary" : "bg-muted text-fg-muted hover:text-fg",
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="chip-active"
                    className="absolute inset-0 rounded-full bg-primary shadow-glow"
                    transition={{ type: "spring", stiffness: 500, damping: 38 }}
                  />
                )}
                <span className="relative">{c.name}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <div className="space-y-12 px-4 pt-6">
        {categories.map((c) => {
          const catItems = items.filter((i) => i.categoryId === c.id);
          return (
            <section key={c.id} id={c.slug} aria-labelledby={`h-${c.slug}`} className="scroll-mt-[8.5rem]">
              <h2 id={`h-${c.slug}`} className="text-[1.75rem] font-semibold leading-tight">
                {c.name}
              </h2>
              {c.description && <p className="mt-1 text-[15px] text-fg-muted">{c.description}</p>}
              <div className="mt-5 grid gap-5 md:grid-cols-2">
                {catItems.map((item) => (
                  <FoodCard key={item.id} item={item} priority={cardIndex++ < 2} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

function SearchResults({ items, query }: { items: MenuItem[]; query: string }) {
  const { t } = useI18n();
  if (items.length === 0) {
    return <EmptyState icon={SearchX} title={t("menu.noResults", { query })} body={t("menu.noResultsHint")} />;
  }
  return (
    <section className="px-4 pt-5" aria-live="polite">
      <p className="text-sm font-semibold text-fg-muted">{t("menu.results", { count: items.length })}</p>
      <div className="mt-4 grid gap-5 md:grid-cols-2">
        {items.map((item) => (
          <FoodCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

function MenuSkeleton() {
  return (
    <div aria-busy="true">
      <div className="mt-3 flex gap-2 overflow-hidden px-4 py-2.5">
        {["w-20", "w-18", "w-28", "w-24", "w-18"].map((w, i) => (
          <Skeleton key={i} className={cn("h-10 shrink-0 rounded-full", w)} />
        ))}
      </div>
      <div className="space-y-5 px-4 pt-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64" />
        <div className="grid gap-5 md:grid-cols-2">
          <FoodCardSkeleton />
          <FoodCardSkeleton />
          <FoodCardSkeleton />
        </div>
      </div>
    </div>
  );
}
