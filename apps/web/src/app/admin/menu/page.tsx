"use client";

import { brand, type LocaleCode } from "@app/config";
import {
  ArrowDown,
  ArrowUp,
  CloudOff,
  Loader2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Tag,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  apiMessage,
  EditLanguageBar,
  Field,
  inputClass,
  MoneyField,
  slugify,
  Switch,
  textIn,
  ToggleChip,
  withText,
} from "@/components/admin/form";
import { Button, LinkButton } from "@/components/ui/button";
import { Badge, EmptyState, Segmented, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { useT } from "@/i18n";
import {
  categoryToInput,
  moved,
  useAdminMenu,
  type AdminCategory,
  type AdminCombo,
  type AdminItem,
  useNameIn,
} from "@/lib/admin-menu";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { setInStock, useInStock, useStockErrorToast } from "@/lib/stock";

type Tab = "items" | "categories" | "combos";

export default function MenuAdminPage() {
  const t = useT();
  const [tab, setTab] = useState<Tab>("items");
  const { menu, failed, reload } = useAdminMenu();

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[2.1rem] font-semibold leading-tight">{t("admin.menu.title")}</h1>
          <p className="mt-1 text-fg-muted">{t("admin.menu.subtitle")}</p>
        </div>
        <LinkButton href="/admin/menu/items/new">
          <Plus className="size-5" aria-hidden />
          {t("admin.menu.newItem")}
        </LinkButton>
      </div>

      <Segmented
        className="mt-6 max-w-md"
        label={t("admin.menu.title")}
        value={tab}
        onChange={setTab}
        options={(["items", "categories", "combos"] as const).map((v) => ({
          value: v,
          label: t(`admin.menu.tabs.${v}`),
        }))}
      />

      <div className="mt-6">
        {failed && !menu ? (
          <EmptyState
            icon={CloudOff}
            title={t("admin.menu.loadError")}
            action={<Button onClick={() => void reload()}>{t("common.retry")}</Button>}
          />
        ) : !menu ? (
          <div className="space-y-3" aria-busy="true">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-20 rounded-card" />
            ))}
          </div>
        ) : tab === "items" ? (
          <ItemsTab items={menu.items} categories={menu.categories} reload={reload} />
        ) : tab === "categories" ? (
          <CategoriesTab categories={menu.categories} reload={reload} />
        ) : (
          <CombosTab combos={menu.combos} items={menu.items} reload={reload} />
        )}
      </div>
    </div>
  );
}

// ── Items ──────────────────────────────────────────────────────────────────
function ItemsTab({
  items,
  categories,
  reload,
}: {
  items: AdminItem[];
  categories: AdminCategory[];
  reload: () => Promise<void>;
}) {
  const nameIn = useNameIn();
  const t = useT();
  const [cat, setCat] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [archived, setArchived] = useState(false);
  useStockErrorToast();

  const catName = useMemo(() => new Map(categories.map((c) => [c.id, nameIn(c)])), [categories, nameIn]);
  const visible = items.filter(
    (i) =>
      (archived || !i.archived) &&
      (cat === "all" || i.categoryId === cat) &&
      (!query.trim() ||
        nameIn(i).toLowerCase().includes(query.trim().toLowerCase()) ||
        i.name.toLowerCase().includes(query.trim().toLowerCase())),
  );
  const canReorder = cat !== "all" && !query.trim() && !archived;

  const move = async (index: number, delta: number) => {
    const ids = moved(visible, index, delta);
    try {
      await api("PUT", "/api/admin/menu/order", { items: { categoryId: cat, itemIds: ids } });
      await reload();
    } catch (e) {
      toast.error(apiMessage(e, t));
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-fg-muted"
            aria-hidden
          />
          <input
            className={cn(inputClass, "bg-surface pl-12 ring-1 ring-line")}
            placeholder={t("admin.menu.search")}
            aria-label={t("admin.menu.search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <ToggleChip on={archived} onClick={() => setArchived((a) => !a)}>
          {t("admin.menu.showArchived")}
        </ToggleChip>
      </div>
      <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
        <ToggleChip on={cat === "all"} onClick={() => setCat("all")}>
          {t("admin.menu.all")}
        </ToggleChip>
        {categories.map((c) => (
          <ToggleChip key={c.id} on={cat === c.id} onClick={() => setCat(c.id)}>
            {nameIn(c)}
          </ToggleChip>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={UtensilsCrossed} title={t("admin.menu.empty")} />
      ) : (
        <div className="mt-4 overflow-hidden card">
          {/* lg+: column headings, so the list reads as a table. */}
          <div
            aria-hidden
            className="hidden items-center gap-3 border-b border-line px-4 py-3 text-xs font-semibold uppercase tracking-wider text-fg-muted lg:flex"
          >
            <span className="w-14 shrink-0" />
            <span className="min-w-0 flex-1">{t("admin.menu.item.name")}</span>
            <span className="w-44 shrink-0">{t("admin.menu.item.category")}</span>
            <span className="w-28 shrink-0 text-right">{t("admin.menu.item.price")}</span>
            {canReorder && <span className="w-8 shrink-0" />}
            <span className="w-44 shrink-0 text-right">{t("kitchen.stock")}</span>
            <span className="w-11 shrink-0" />
          </div>
          <ul>
            {visible.map((item, i) => (
              <ItemRow
                key={item.id}
                item={item}
                categoryName={catName.get(item.categoryId)}
                canMoveUp={canReorder && i > 0}
                canMoveDown={canReorder && i < visible.length - 1}
                showMove={canReorder}
                onMove={(delta) => void move(i, delta)}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ItemRow({
  item,
  categoryName,
  showMove,
  canMoveUp,
  canMoveDown,
  onMove,
}: {
  item: AdminItem;
  categoryName: string | undefined;
  showMove: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (delta: number) => void;
}) {
  const t = useT();
  const nameIn = useNameIn();
  // Only this row re-renders when its stock changes (here, in the kitchen, or on another manager's screen).
  const inStock = useInStock(item.id, item.inStock);

  return (
    <li
      className={cn(
        "flex items-center gap-3 border-b border-line px-4 py-3 transition-colors last:border-b-0 hover:bg-muted/30",
        item.archived && "opacity-55",
      )}
    >
      <span className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-muted">
        <Image src={item.imageUrl} alt="" fill sizes="64px" className={cn("object-cover", !inStock && "grayscale")} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          <span className="truncate">{nameIn(item)}</span>
          {item.featured && (
            <Badge tone="secondary">
              <Sparkles className="size-3" aria-hidden />
              {t("admin.menu.featured")}
            </Badge>
          )}
          {item.archived && <Badge>{t("admin.menu.archived")}</Badge>}
        </p>
        <p className="truncate text-sm text-fg-muted lg:hidden">
          {categoryName} · <span className="tabular">{formatPrice(item.priceCents)}</span>
        </p>
      </div>
      <span className="hidden w-44 shrink-0 truncate text-sm text-fg-muted lg:block">{categoryName}</span>
      <span className="hidden w-28 shrink-0 text-right font-semibold tabular lg:block">
        {formatPrice(item.priceCents)}
      </span>
      {showMove && (
        <div className="hidden w-8 shrink-0 flex-col sm:flex">
          <button
            type="button"
            disabled={!canMoveUp}
            onClick={() => onMove(-1)}
            aria-label={t("admin.menu.moveUp", { name: item.name })}
            className="grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-muted disabled:opacity-30"
          >
            <ArrowUp className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            disabled={!canMoveDown}
            onClick={() => onMove(1)}
            aria-label={t("admin.menu.moveDown", { name: item.name })}
            className="grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-muted disabled:opacity-30"
          >
            <ArrowDown className="size-4" aria-hidden />
          </button>
        </div>
      )}
      {item.archived ? (
        <span className="hidden w-44 shrink-0 lg:block" />
      ) : (
        <div className="flex shrink-0 items-center justify-end gap-2 lg:w-44">
          <span className={cn("hidden text-xs font-semibold sm:inline", inStock ? "text-success" : "text-danger")}>
            {inStock ? t("admin.menu.inStock") : t("admin.menu.soldOut")}
          </span>
          <Switch
            compact
            checked={inStock}
            onChange={(v) => setInStock(item.id, v)}
            label={`${item.name}: ${t("admin.menu.inStock")}`}
          />
        </div>
      )}
      <Link
        href={`/admin/menu/items/${item.id}`}
        aria-label={t("admin.menu.edit", { name: item.name })}
        className="grid size-11 shrink-0 place-items-center rounded-full text-fg-muted hover:bg-muted hover:text-fg"
      >
        <Pencil className="size-5" aria-hidden />
      </Link>
    </li>
  );
}

// ── Categories ─────────────────────────────────────────────────────────────
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type Window = AdminCategory["availability"][number];

function CategoriesTab({ categories, reload }: { categories: AdminCategory[]; reload: () => Promise<void> }) {
  const t = useT();
  const nameIn = useNameIn();
  const [editing, setEditing] = useState<AdminCategory | "new" | null>(null);

  const move = async (index: number, delta: number) => {
    try {
      await api("PUT", "/api/admin/menu/order", { categoryIds: moved(categories, index, delta) });
      await reload();
    } catch (e) {
      toast.error(apiMessage(e, t));
    }
  };

  return (
    <div>
      <div className="flex justify-end">
        <Button variant="secondary" onClick={() => setEditing("new")}>
          <Plus className="size-5" aria-hidden />
          {t("admin.menu.category.new")}
        </Button>
      </div>
      <ul className="mt-4 overflow-hidden card">
        {categories.map((c, i) => (
          <li
            key={c.id}
            className={cn(
              "flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0",
              !c.active && "opacity-55",
            )}
          >
            <div className="flex flex-col">
              <button
                type="button"
                disabled={i === 0}
                onClick={() => void move(i, -1)}
                aria-label={t("admin.menu.moveUp", { name: c.name })}
                className="grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-muted disabled:opacity-30"
              >
                <ArrowUp className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                disabled={i === categories.length - 1}
                onClick={() => void move(i, 1)}
                aria-label={t("admin.menu.moveDown", { name: c.name })}
                className="grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-muted disabled:opacity-30"
              >
                <ArrowDown className="size-4" aria-hidden />
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                {nameIn(c)}
                {!c.active && <Badge>{t("admin.menu.hidden")}</Badge>}
              </p>
              <p className="text-sm text-fg-muted">
                {t("admin.menu.category.items", { count: c.itemCount })} ·{" "}
                {t(`admin.menu.category.stations.${c.station}`)} ·{" "}
                {c.availability.length
                  ? c.availability
                      .map(
                        (w) =>
                          `${w.days.length ? w.days.map((d) => d.slice(0, 1).toUpperCase() + d.slice(1)).join(", ") + " " : ""}${w.from}–${w.to}`,
                      )
                      .join("; ")
                  : t("admin.menu.category.allDay")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditing(c)}
              aria-label={t("admin.menu.edit", { name: c.name })}
              className="grid size-11 place-items-center rounded-full text-fg-muted hover:bg-muted hover:text-fg"
            >
              <Pencil className="size-5" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <CategorySheet target={editing} onClose={() => setEditing(null)} onSaved={reload} nextSort={categories.length} />
    </div>
  );
}

function CategorySheet({
  target,
  onClose,
  onSaved,
  nextSort,
}: {
  target: AdminCategory | "new" | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  nextSort: number;
}) {
  const t = useT();
  const existing = target && target !== "new" ? target : null;
  const [form, setForm] = useState(() => blankCategory(nextSort));
  const [lang, setLang] = useState<LocaleCode>(brand.defaultLanguage);
  const main = lang === brand.defaultLanguage;
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);

  const targetKey = target === null ? null : target === "new" ? "new" : target.id;
  if (targetKey !== key) {
    setKey(targetKey);
    setForm(
      existing ? { ...categoryToInput(existing), description: existing.description ?? "" } : blankCategory(nextSort),
    );
    setSlugTouched(!!existing);
    setError(null);
  }

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setWindow = (i: number, patch: Partial<Window>) =>
    set(
      "availability",
      form.availability.map((w, j) => (j === i ? { ...w, ...patch } : w)),
    );

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { ...form, description: form.description || undefined };
      if (existing) await api("PUT", `/api/admin/categories/${existing.id}`, body);
      else await api("POST", "/api/admin/categories", body);
      toast.success(t("admin.menu.category.saved"));
      await onSaved();
      onClose();
    } catch (err) {
      setError(apiMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    setBusy(true);
    try {
      await api("DELETE", `/api/admin/categories/${existing.id}`);
      toast.success(t("admin.menu.category.deleted"));
      await onSaved();
      onClose();
    } catch (err) {
      setError(apiMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={!!target}
      onClose={onClose}
      title={existing ? t("admin.menu.category.edit") : t("admin.menu.category.new")}
    >
      <form onSubmit={save} className="mt-5 space-y-4">
        <EditLanguageBar value={lang} onChange={setLang} />
        <Field label={t("admin.menu.category.name")} htmlFor="cat-name">
          <input
            id="cat-name"
            lang={lang}
            className={inputClass}
            value={textIn(lang, form.name, form.translations, "name")}
            placeholder={main ? undefined : form.name}
            maxLength={60}
            required={main}
            onChange={(e) => {
              if (!main) return set("translations", withText(form.translations, lang, "name", e.target.value));
              set("name", e.target.value);
              if (!slugTouched) set("slug", slugify(e.target.value));
            }}
          />
        </Field>
        <Field label={t("admin.menu.category.slug")} hint={t("admin.menu.category.slugHint")} htmlFor="cat-slug">
          <input
            id="cat-slug"
            className={cn(inputClass, "font-mono text-sm")}
            value={form.slug}
            onChange={(e) => {
              setSlugTouched(true);
              set("slug", e.target.value);
            }}
            required
          />
        </Field>
        <Field label={t("admin.menu.category.description")} htmlFor="cat-desc">
          <input
            id="cat-desc"
            lang={lang}
            className={inputClass}
            value={textIn(lang, form.description ?? "", form.translations, "description")}
            placeholder={main ? undefined : form.description}
            maxLength={200}
            onChange={(e) =>
              main
                ? set("description", e.target.value)
                : set("translations", withText(form.translations, lang, "description", e.target.value))
            }
          />
        </Field>
        <Field label={t("admin.menu.category.station")}>
          <Segmented
            label={t("admin.menu.category.station")}
            value={form.station}
            onChange={(v) => set("station", v)}
            options={(["kitchen", "bar"] as const).map((v) => ({
              value: v,
              label: t(`admin.menu.category.stations.${v}`),
            }))}
          />
        </Field>
        <Switch checked={form.active} onChange={(v) => set("active", v)} label={t("admin.menu.category.visible")} />

        <div>
          <p className="text-sm font-semibold">{t("admin.menu.category.availability")}</p>
          <p className="mt-1 text-sm text-fg-muted">{t("admin.menu.category.availabilityHint")}</p>
          <>
            {form.availability.map((w, i) => (
              <div key={i} className="enter mt-3 overflow-hidden rounded-2xl bg-muted/50 p-3">
                <div className="flex flex-wrap gap-1.5">
                  {DAYS.map((d) => (
                    <ToggleChip
                      key={d}
                      on={w.days.includes(d)}
                      onClick={() =>
                        setWindow(i, { days: w.days.includes(d) ? w.days.filter((x) => x !== d) : [...w.days, d] })
                      }
                    >
                      {d.slice(0, 1).toUpperCase() + d.slice(1)}
                    </ToggleChip>
                  ))}
                </div>
                {w.days.length === 0 && (
                  <p className="mt-1.5 text-xs text-fg-muted">{t("admin.menu.category.everyDay")}</p>
                )}
                <div className="mt-3 flex items-end gap-3">
                  <Field label={t("admin.menu.category.from")} className="flex-1">
                    <input
                      type="time"
                      className={inputClass}
                      value={w.from}
                      onChange={(e) => setWindow(i, { from: e.target.value })}
                    />
                  </Field>
                  <Field label={t("admin.menu.category.to")} className="flex-1">
                    <input
                      type="time"
                      className={inputClass}
                      value={w.to}
                      onChange={(e) => setWindow(i, { to: e.target.value })}
                    />
                  </Field>
                  <button
                    type="button"
                    onClick={() =>
                      set(
                        "availability",
                        form.availability.filter((_, j) => j !== i),
                      )
                    }
                    aria-label={t("admin.menu.category.remove")}
                    className="grid size-12 shrink-0 place-items-center rounded-2xl text-danger hover:bg-danger/10"
                  >
                    <Trash2 className="size-5" aria-hidden />
                  </button>
                </div>
              </div>
            ))}
          </>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => set("availability", [...form.availability, { days: [], from: "08:00", to: "11:30" }])}
          >
            <Plus className="size-4" aria-hidden />
            {t("admin.menu.category.addWindow")}
          </Button>
        </div>

        <p className="min-h-5 text-sm font-medium text-danger" role="alert">
          {error}
        </p>
        <div className="flex flex-wrap gap-3">
          {existing && (
            <Button variant="danger" onClick={() => void remove()} disabled={busy}>
              <Trash2 className="size-4" aria-hidden />
              {t("admin.menu.category.delete")}
            </Button>
          )}
          <Button type="submit" className="ml-auto min-w-32" disabled={busy || !form.name.trim() || !form.slug}>
            {busy && <Loader2 className="size-5 animate-spin" aria-hidden />}
            {t("admin.tables.save")}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

function blankCategory(sortOrder: number) {
  return {
    slug: "",
    name: "",
    description: "",
    translations: {} as Partial<Record<string, { name?: string; description?: string }>>,
    station: "kitchen" as "kitchen" | "bar",
    sortOrder,
    active: true,
    availability: [] as Window[],
  };
}

// ── Combos ─────────────────────────────────────────────────────────────────
function CombosTab({
  combos,
  items,
  reload,
}: {
  combos: AdminCombo[];
  items: AdminItem[];
  reload: () => Promise<void>;
}) {
  const t = useT();
  const nameIn = useNameIn();
  const [editing, setEditing] = useState<AdminCombo | "new" | null>(null);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  return (
    <div>
      <div className="flex justify-end">
        <Button variant="secondary" onClick={() => setEditing("new")}>
          <Plus className="size-5" aria-hidden />
          {t("admin.menu.combo.new")}
        </Button>
      </div>
      {combos.length === 0 ? (
        <EmptyState icon={Tag} title={t("admin.menu.combo.empty")} />
      ) : (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {combos.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setEditing(c)}
                className={cn("glass-card lift w-full rounded-card p-5 text-left", !c.active && "opacity-55")}
              >
                <p className="flex items-center justify-between gap-2">
                  <span className="font-display text-xl font-semibold">{nameIn(c)}</span>
                  <Badge tone={c.active ? "success" : "muted"}>
                    {t("admin.menu.combo.saves", { amount: formatPrice(c.discountCents) })}
                  </Badge>
                </p>
                <div className="mt-3 flex -space-x-3">
                  {c.itemIds.map((id) => {
                    const it = byId.get(id);
                    return it ? (
                      <span
                        key={id}
                        className="relative size-12 overflow-hidden rounded-full ring-2 ring-surface"
                        title={nameIn(it)}
                      >
                        <Image src={it.imageUrl} alt="" fill sizes="48px" className="object-cover" />
                      </span>
                    ) : null;
                  })}
                </div>
                <p className="mt-2 text-sm text-fg-muted">
                  {c.itemIds
                    .map((id) => byId.get(id))
                    .filter(Boolean)
                    .map((x) => nameIn(x!))
                    .join(" + ")}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
      <ComboSheet target={editing} items={items} onClose={() => setEditing(null)} onSaved={reload} />
    </div>
  );
}

function ComboSheet({
  target,
  items,
  onClose,
  onSaved,
}: {
  target: AdminCombo | "new" | null;
  items: AdminItem[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const t = useT();
  const nameIn = useNameIn();
  const existing = target && target !== "new" ? target : null;
  const [name, setName] = useState("");
  const [translations, setTranslations] = useState<Partial<Record<string, { name?: string }>>>({});
  const [lang, setLang] = useState<LocaleCode>(brand.defaultLanguage);
  const main = lang === brand.defaultLanguage;
  const [discount, setDiscount] = useState<number | null>(null);
  const [itemIds, setItemIds] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);

  const targetKey = target === null ? null : target === "new" ? "new" : target.id;
  if (targetKey !== key) {
    setKey(targetKey);
    setName(existing?.name ?? "");
    setTranslations(existing?.translations ?? {});
    setDiscount(existing?.discountCents ?? null);
    setItemIds(existing?.itemIds ?? []);
    setActive(existing?.active ?? true);
    setError(null);
  }

  const choosable = items.filter((i) => !i.archived);
  const run = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      toast.success(message);
      await onSaved();
      onClose();
    } catch (err) {
      setError(apiMessage(err, t));
    } finally {
      setBusy(false);
    }
  };
  const body = { name, translations, discountCents: discount ?? 0, itemIds, active };

  return (
    <Sheet open={!!target} onClose={onClose} title={existing ? t("admin.menu.combo.edit") : t("admin.menu.combo.new")}>
      <form
        className="mt-5 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            () =>
              existing ? api("PUT", `/api/admin/combos/${existing.id}`, body) : api("POST", "/api/admin/combos", body),
            t("admin.menu.combo.saved"),
          );
        }}
      >
        <EditLanguageBar value={lang} onChange={setLang} />
        <div className="grid grid-cols-[1fr_9rem] gap-3">
          <Field label={t("admin.menu.combo.name")} htmlFor="combo-name">
            <input
              id="combo-name"
              lang={lang}
              className={inputClass}
              value={textIn(lang, name, translations, "name")}
              placeholder={main ? undefined : name}
              maxLength={60}
              onChange={(e) =>
                main ? setName(e.target.value) : setTranslations(withText(translations, lang, "name", e.target.value))
              }
              required={main}
            />
          </Field>
          <Field label={t("admin.menu.combo.discount")} htmlFor="combo-discount">
            <MoneyField id="combo-discount" cents={discount} onChange={setDiscount} />
          </Field>
        </div>
        <Field label={t("admin.menu.combo.items")}>
          <div className="flex max-h-64 flex-wrap gap-2 overflow-y-auto rounded-2xl bg-muted/40 p-2">
            {choosable.map((i) => (
              <ToggleChip
                key={i.id}
                on={itemIds.includes(i.id)}
                onClick={() =>
                  setItemIds((ids) =>
                    ids.includes(i.id) ? ids.filter((x) => x !== i.id) : ids.length < 6 ? [...ids, i.id] : ids,
                  )
                }
              >
                {nameIn(i)}
              </ToggleChip>
            ))}
          </div>
        </Field>
        <Switch checked={active} onChange={setActive} label={t("admin.menu.combo.active")} />
        <p className="min-h-5 text-sm font-medium text-danger" role="alert">
          {error}
        </p>
        <div className="flex flex-wrap gap-3">
          {existing && (
            <Button
              variant="danger"
              disabled={busy}
              onClick={() =>
                void run(() => api("DELETE", `/api/admin/combos/${existing.id}`), t("admin.menu.combo.deleted"))
              }
            >
              <Trash2 className="size-4" aria-hidden />
              {t("admin.menu.combo.delete")}
            </Button>
          )}
          <Button
            type="submit"
            className="ml-auto min-w-32"
            disabled={busy || !name.trim() || !discount || itemIds.length < 2}
          >
            {busy && <Loader2 className="size-5 animate-spin" aria-hidden />}
            {t("admin.menu.combo.save")}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
