"use client";

import { ALLERGENS, DIETARY_TAGS } from "@app/shared";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ImagePlus, Loader2, Plus, SearchX, Trash2, X } from "lucide-react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { brand, type LocaleCode } from "@app/config";
import { EditLanguageBar, Field, MoneyField, Switch, ToggleChip, apiMessage, fieldErrors, inputClass, slugify, textIn, textareaClass, withText } from "@/components/admin/form";
import { tagIcons } from "@/components/guest/dietary-tags";
import { Button, LinkButton } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { useT } from "@/i18n";
import { itemToInput, useAdminMenu, type AdminItem } from "@/lib/admin-menu";
import { ApiClientError, api } from "@/lib/api";
import { cn } from "@/lib/cn";

type Form = ReturnType<typeof itemToInput>;
type Group = Form["modifierGroups"][number] & { key: string };
type Option = Group["options"][number] & { key: string };
type EditorForm = Omit<Form, "modifierGroups" | "priceCents"> & {
  priceCents: number | null;
  modifierGroups: (Omit<Group, "options"> & { options: Option[] })[];
};

let keySeq = 0;
const k = () => `k${++keySeq}`;

function toEditor(item: AdminItem): EditorForm {
  const f = itemToInput(item);
  return {
    ...f,
    modifierGroups: f.modifierGroups.map((g) => ({ ...g, key: k(), options: g.options.map((o) => ({ ...o, key: k() })) })),
  };
}

function blank(categoryId: string): EditorForm {
  return {
    slug: "",
    categoryId,
    name: "",
    description: "",
    translations: {},
    priceCents: null,
    imageUrl: "",
    imageAlt: "",
    tags: [],
    allergens: [],
    calories: null,
    inStock: true,
    featured: false,
    archived: false,
    sortOrder: 0,
    modifierGroups: [],
  };
}

export default function ItemEditorPage() {
  const t = useT();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const isNew = params.id === "new";
  const { menu, reload } = useAdminMenu();
  const item = menu?.items.find((i) => i.id === params.id);

  const [form, setForm] = useState<EditorForm | null>(null);
  /** Which language the text fields edit (the main one = the plain fields). */
  const [lang, setLang] = useState<LocaleCode>(brand.defaultLanguage);
  const main = lang === brand.defaultLanguage;
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Initialise once the menu is loaded.
  useEffect(() => {
    if (!menu || form) return;
    if (isNew) setForm(blank(menu.categories[0]?.id ?? ""));
    else if (item) setForm(toEditor(item));
  }, [menu, item, isNew, form]);

  const others = useMemo(() => (menu?.items ?? []).filter((i) => i.id !== params.id && !i.archived), [menu, params.id]);
  const pairings = (menu?.suggestions ?? []).filter((s) => s.itemId === params.id);
  const byId = useMemo(() => new Map((menu?.items ?? []).map((i) => [i.id, i])), [menu]);

  if (!menu) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 rounded-card" />
      </div>
    );
  }
  if (!isNew && !item) return <EmptyState icon={SearchX} title={t("admin.menu.item.notFound")} action={<LinkButton href="/admin/menu">{t("admin.menu.item.back")}</LinkButton>} />;
  if (!form) return null;

  const set = <K extends keyof EditorForm>(key: K, v: EditorForm[K]) => setForm((f) => (f ? { ...f, [key]: v } : f));
  const setGroup = (gi: number, patch: Partial<EditorForm["modifierGroups"][number]>) =>
    set("modifierGroups", form.modifierGroups.map((g, i) => (i === gi ? { ...g, ...patch } : g)));
  const setOption = (gi: number, oi: number, patch: Partial<Option>) =>
    setGroup(gi, { options: form.modifierGroups[gi]!.options.map((o, i) => (i === oi ? { ...o, ...patch } : o)) });
  const toggle = <T extends string>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const data = new FormData();
      data.append("image", file);
      const res = await fetch("/api/admin/uploads/images", { method: "POST", body: data, credentials: "same-origin" });
      const body = await res.json();
      if (!res.ok) throw new ApiClientError(res.status, body?.error?.code ?? "UPLOAD", body?.error?.message ?? "Upload failed");
      set("imageUrl", body.url);
      setErrors((e) => ({ ...e, imageUrl: "" }));
    } catch (e) {
      toast.error(apiMessage(e, t));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    // Catch the common slips before asking the server.
    const local: Record<string, string> = {};
    const required = t("admin.menu.item.requiredField");
    if (!form.name.trim()) local.name = required;
    if (form.priceCents == null) local.priceCents = required;
    if (!form.imageUrl) local.imageUrl = required;
    form.modifierGroups.forEach((g, gi) => {
      if (!g.name.trim()) local[`modifierGroups.${gi}.name`] = required;
      g.options.forEach((o, oi) => {
        if (!o.name.trim()) local[`modifierGroups.${gi}.options.${oi}.name`] = required;
      });
    });
    if (Object.keys(local).length) {
      setErrors(local);
      toast.error(t("admin.menu.item.fixFields"));
      return;
    }
    setBusy(true);
    setErrors({});
    const body = {
      ...form,
      priceCents: form.priceCents ?? -1,
      calories: form.calories ?? null,
      modifierGroups: form.modifierGroups.map(({ key: _k, options, ...g }) => ({
        ...g,
        options: options.map(({ key: _o, ...o }) => o),
      })),
    };
    try {
      if (isNew) {
        const { id } = await api<{ id: string }>("POST", "/api/admin/items", body);
        toast.success(t("admin.menu.item.created"));
        router.replace(`/admin/menu/items/${id}`);
      } else {
        await api("PUT", `/api/admin/items/${params.id}`, body);
        toast.success(t("admin.menu.item.saved"));
        await reload();
      }
    } catch (err) {
      const fields = fieldErrors(err, t);
      setErrors(fields);
      toast.error(Object.keys(fields).length ? t("admin.menu.item.fixFields") : apiMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  const addPairing = async (suggestItemId: string) => {
    try {
      await api("POST", "/api/admin/upsells", { itemId: params.id, suggestItemId });
      await reload();
    } catch (e) {
      toast.error(apiMessage(e, t));
    }
  };
  const removePairing = async (id: string) => {
    try {
      await api("DELETE", `/api/admin/upsells/${id}`);
      await reload();
    } catch (e) {
      toast.error(apiMessage(e, t));
    }
  };

  const card = "card p-5 sm:p-6";

  return (
    <form onSubmit={save} className="pb-28">
      <LinkButton href="/admin/menu" variant="ghost" size="sm" className="-ml-3">
        <ArrowLeft className="size-4" aria-hidden />
        {t("admin.menu.item.back")}
      </LinkButton>
      <h1 className="mt-2 text-[2.1rem] font-semibold leading-tight">{isNew ? t("admin.menu.item.newTitle") : form.name || t("admin.menu.item.editTitle")}</h1>
      <EditLanguageBar value={lang} onChange={setLang} className="mt-5 max-w-xl" />

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          {/* Basics */}
          <section className={card} aria-labelledby="sec-basics">
            <h2 id="sec-basics" className="font-display text-xl font-semibold">{t("admin.menu.item.basics")}</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label={t("admin.menu.item.name")} htmlFor="f-name" error={errors.name} className="sm:col-span-2">
                <input
                  id="f-name"
                  lang={lang}
                  className={inputClass}
                  value={textIn(lang, form.name, form.translations, "name")}
                  placeholder={main ? undefined : form.name}
                  maxLength={80}
                  aria-invalid={!!errors.name}
                  onChange={(e) => {
                    if (!main) return set("translations", withText(form.translations, lang, "name", e.target.value));
                    set("name", e.target.value);
                    if (!slugTouched) set("slug", slugify(e.target.value));
                  }}
                  required={main}
                />
              </Field>
              <Field label={t("admin.menu.item.category")} htmlFor="f-cat" error={errors.categoryId}>
                <select id="f-cat" className={inputClass} value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
                  {menu.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("admin.menu.item.price")} htmlFor="f-price" error={errors.priceCents}>
                <MoneyField id="f-price" cents={form.priceCents} onChange={(v) => set("priceCents", v)} invalid={!!errors.priceCents} />
              </Field>
              <Field label={t("admin.menu.item.description")} htmlFor="f-desc" error={errors.description} className="sm:col-span-2">
                <textarea
                  id="f-desc"
                  lang={lang}
                  rows={3}
                  maxLength={400}
                  className={textareaClass}
                  value={textIn(lang, form.description, form.translations, "description")}
                  placeholder={main ? undefined : form.description}
                  onChange={(e) =>
                    main
                      ? set("description", e.target.value)
                      : set("translations", withText(form.translations, lang, "description", e.target.value))
                  }
                />
              </Field>
              <Field label={t("admin.menu.item.slug")} htmlFor="f-slug" error={errors.slug} hint={t("admin.menu.category.slugHint")}>
                <input id="f-slug" className={cn(inputClass, "font-mono text-sm")} value={form.slug} aria-invalid={!!errors.slug} onChange={(e) => { setSlugTouched(true); set("slug", e.target.value); }} required />
              </Field>
              <Field label={t("admin.menu.item.calories")} htmlFor="f-cal" error={errors.calories}>
                <input
                  id="f-cal"
                  inputMode="numeric"
                  className={inputClass}
                  value={form.calories ?? ""}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 5);
                    set("calories", v ? Number(v) : null);
                  }}
                />
              </Field>
            </div>
          </section>

          {/* Dietary & allergens */}
          <section className={card} aria-labelledby="sec-diet">
            <h2 id="sec-diet" className="font-display text-xl font-semibold">{t("admin.menu.item.dietary")}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {DIETARY_TAGS.map((tag) => {
                const Icon = tagIcons[tag];
                return (
                  <ToggleChip key={tag} on={form.tags.includes(tag)} onClick={() => set("tags", toggle(form.tags, tag))}>
                    <Icon className="size-4" aria-hidden />
                    {t(`tags.${tag}`)}
                  </ToggleChip>
                );
              })}
            </div>
            <h2 className="mt-6 font-display text-xl font-semibold">{t("admin.menu.item.allergens")}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {ALLERGENS.map((a) => (
                <ToggleChip key={a} on={form.allergens.includes(a)} onClick={() => set("allergens", toggle(form.allergens, a))}>
                  {t(`allergens.${a}`)}
                </ToggleChip>
              ))}
            </div>
          </section>

          {/* Options */}
          <section className={card} aria-labelledby="sec-options">
            <h2 id="sec-options" className="font-display text-xl font-semibold">{t("admin.menu.item.options")}</h2>
            <p className="text-sm text-fg-muted">{t("admin.menu.item.optionsHint")}</p>
            <AnimatePresence initial={false}>
              {form.modifierGroups.map((g, gi) => (
                <motion.div key={g.key} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="mt-4 rounded-2xl ring-1 ring-line">
                  <div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
                    <Field label={t("admin.menu.item.groupName")} className="min-w-48 flex-1" error={errors[`modifierGroups.${gi}.name`]}>
                      <input
                        lang={lang}
                        className={inputClass}
                        value={textIn(lang, g.name, g.translations, "name")}
                        placeholder={main ? undefined : g.name}
                        maxLength={80}
                        aria-invalid={!!errors[`modifierGroups.${gi}.name`]}
                        onChange={(e) =>
                          setGroup(gi, main ? { name: e.target.value } : { translations: withText(g.translations, lang, "name", e.target.value) })
                        }
                      />
                    </Field>
                    <Field label={t("admin.menu.item.maxChoices")} className="w-28" error={errors[`modifierGroups.${gi}.maxSelect`]}>
                      <input
                        inputMode="numeric"
                        className={inputClass}
                        value={g.maxSelect}
                        onChange={(e) => {
                          const max = Math.max(1, Math.min(20, Number(e.target.value.replace(/\D/g, "")) || 1));
                          setGroup(gi, { maxSelect: max, minSelect: Math.min(g.minSelect, max) });
                        }}
                      />
                    </Field>
                    <div className="pb-1">
                      <Switch compact={false} checked={g.minSelect > 0} onChange={(v) => setGroup(gi, { minSelect: v ? 1 : 0 })} label={t("admin.menu.item.required")} />
                    </div>
                    <button type="button" onClick={() => set("modifierGroups", form.modifierGroups.filter((_, i) => i !== gi))} aria-label={t("admin.menu.item.removeGroup")} className="grid size-12 place-items-center rounded-2xl text-danger hover:bg-danger/10">
                      <Trash2 className="size-5" aria-hidden />
                    </button>
                  </div>
                  {errors[`modifierGroups.${gi}.minSelect`] && <p className="px-4 pt-2 text-sm text-danger">{errors[`modifierGroups.${gi}.minSelect`]}</p>}
                  <ul className="divide-y divide-line">
                    {g.options.map((o, oi) => (
                      <li key={o.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
                        <input
                          lang={lang}
                          className={cn(inputClass, "min-w-40 flex-1")}
                          placeholder={main ? t("admin.menu.item.optionName") : o.name}
                          aria-label={t("admin.menu.item.optionName")}
                          aria-invalid={!!errors[`modifierGroups.${gi}.options.${oi}.name`]}
                          value={textIn(lang, o.name, o.translations, "name")}
                          maxLength={80}
                          onChange={(e) =>
                            setOption(gi, oi, main ? { name: e.target.value } : { translations: withText(o.translations, lang, "name", e.target.value) })
                          }
                        />
                        <MoneyField className="w-32" aria-label={t("admin.menu.item.extraPrice")} cents={o.priceDeltaCents} onChange={(v) => setOption(gi, oi, { priceDeltaCents: v ?? 0 })} />
                        <ToggleChip on={o.isDefault} onClick={() => setOption(gi, oi, { isDefault: !o.isDefault })}>
                          {t("admin.menu.item.default")}
                        </ToggleChip>
                        <ToggleChip on={o.active} onClick={() => setOption(gi, oi, { active: !o.active })}>
                          {t("admin.menu.item.available")}
                        </ToggleChip>
                        <button type="button" onClick={() => setGroup(gi, { options: g.options.filter((_, i) => i !== oi) })} aria-label={t("admin.menu.item.removeOption")} className="grid size-10 place-items-center rounded-full text-fg-muted hover:bg-muted hover:text-danger">
                          <X className="size-4" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="p-3">
                    <Button variant="ghost" size="sm" onClick={() => setGroup(gi, { options: [...g.options, { key: k(), name: "", translations: {}, priceDeltaCents: 0, isDefault: false, active: true } as Option] })}>
                      <Plus className="size-4" aria-hidden />
                      {t("admin.menu.item.addOption")}
                    </Button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            <Button
              variant="secondary"
              size="sm"
              className="mt-4"
              onClick={() =>
                set("modifierGroups", [
                  ...form.modifierGroups,
                  { key: k(), name: "", translations: {}, minSelect: 0, maxSelect: 1, options: [{ key: k(), name: "", translations: {}, priceDeltaCents: 0, isDefault: false, active: true } as Option] },
                ] as EditorForm["modifierGroups"])
              }
            >
              <Plus className="size-4" aria-hidden />
              {t("admin.menu.item.addGroup")}
            </Button>
          </section>
        </div>

        {/* Side column */}
        <div className="space-y-5">
          <section className={card} aria-labelledby="sec-photo">
            <h2 id="sec-photo" className="font-display text-xl font-semibold">{t("admin.menu.item.photo")}</h2>
            <div className={cn("relative mt-3 aspect-[4/3] overflow-hidden rounded-2xl bg-muted", errors.imageUrl && "ring-2 ring-danger")}>
              {form.imageUrl ? (
                <Image src={form.imageUrl} alt={form.imageAlt || form.name} fill sizes="320px" className="object-cover" />
              ) : (
                <div className="grid size-full place-items-center text-fg-muted">
                  <ImagePlus className="size-10" aria-hidden />
                </div>
              )}
              {uploading && (
                <div className="absolute inset-0 grid place-items-center bg-black/40 text-white">
                  <Loader2 className="size-8 animate-spin" aria-label={t("admin.menu.item.uploading")} />
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" id="f-photo" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
            <Button variant="secondary" size="sm" className="mt-3 w-full" disabled={uploading} onClick={() => fileRef.current?.click()}>
              <ImagePlus className="size-4" aria-hidden />
              {form.imageUrl ? t("admin.menu.item.replacePhoto") : t("admin.menu.item.uploadPhoto")}
            </Button>
            <p className={cn("mt-2 text-xs", errors.imageUrl ? "font-medium text-danger" : "text-fg-muted")}>{errors.imageUrl || t("admin.menu.item.photoHint")}</p>
            <Field label={t("admin.menu.item.altText")} htmlFor="f-alt" className="mt-3">
              <input id="f-alt" className={inputClass} value={form.imageAlt} maxLength={200} onChange={(e) => set("imageAlt", e.target.value)} />
            </Field>
          </section>

          <section className={cn(card, "space-y-2")} aria-labelledby="sec-vis">
            <h2 id="sec-vis" className="mb-1 text-lg font-semibold">{t("admin.menu.item.visibility")}</h2>
            <Switch checked={form.inStock} onChange={(v) => set("inStock", v)} label={t("admin.menu.inStock")} hint={t("admin.menu.item.inStockHint")} />
            <Switch checked={form.featured} onChange={(v) => set("featured", v)} label={t("admin.menu.featured")} hint={t("admin.menu.item.featuredHint")} />
            <Switch checked={form.archived} onChange={(v) => set("archived", v)} label={t("admin.menu.archived")} hint={t("admin.menu.item.archivedHint")} />
          </section>

          <section className={card} aria-labelledby="sec-pair">
            <h2 id="sec-pair" className="font-display text-xl font-semibold">{t("admin.menu.item.pairings")}</h2>
            <p className="text-sm text-fg-muted">{t("admin.menu.item.pairingsHint")}</p>
            {isNew ? (
              <p className="mt-3 text-sm text-fg-muted">{t("admin.menu.item.saveFirst")}</p>
            ) : (
              <>
                <ul className="mt-3 space-y-2">
                  {pairings.map((p) => {
                    const it = byId.get(p.suggestItemId);
                    return (
                      <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-muted/50 p-2 pr-1">
                        {it && (
                          <span className="relative size-10 shrink-0 overflow-hidden rounded-xl">
                            <Image src={it.imageUrl} alt="" fill sizes="40px" className="object-cover" />
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{it?.name}</span>
                        <button type="button" onClick={() => void removePairing(p.id)} aria-label={t("admin.menu.item.removePairing", { name: it?.name ?? "" })} className="grid size-10 place-items-center rounded-full text-fg-muted hover:bg-muted hover:text-danger">
                          <X className="size-4" aria-hidden />
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <select
                  className={cn(inputClass, "mt-3")}
                  value=""
                  aria-label={t("admin.menu.item.addPairing")}
                  onChange={(e) => e.target.value && void addPairing(e.target.value)}
                >
                  <option value="">{t("admin.menu.item.addPairing")}</option>
                  {others
                    .filter((o) => !pairings.some((p) => p.suggestItemId === o.id))
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                </select>
              </>
            )}
          </section>
        </div>
      </div>

      {/* Sticky save bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line glass md:left-64">
        <div className="mx-auto flex max-w-5xl items-center justify-end gap-3 px-4 py-3 md:px-10">
          <LinkButton href="/admin/menu" variant="ghost">
            {t("admin.tables.cancel")}
          </LinkButton>
          <Button type="submit" size="lg" disabled={busy || uploading} className="min-w-40">
            {busy && <Loader2 className="size-5 animate-spin" aria-hidden />}
            {t("admin.menu.item.save")}
          </Button>
        </div>
      </div>
    </form>
  );
}
