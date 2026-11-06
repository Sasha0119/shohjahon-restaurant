"use client";

import {
  combosForItem,
  defaultSelection,
  suggestionsForItem,
  toggleOption,
  unitPrice,
  validateSelection,
  type MenuItem,
  type ModifierGroup,
  type ModifierSelection,
} from "@app/shared";
import { Check, Info, Loader2, Tag } from "lucide-react";
import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { shake } from "@/lib/shake";
import { formatPrice } from "@/lib/format";
import { useGuestActions } from "./use-guest-actions";
import { DietaryTags } from "./dietary-tags";
import { MiniItemCard } from "./food-card";
import { useGuest } from "./guest-context";
import { haptic } from "./use-quick-add";

interface FormState {
  selection: ModifierSelection;
  quantity: number;
  note: string;
  /** Guest tried to add with missing required choices → show errors. */
  attempted: boolean;
}

const initialForm = (item: MenuItem): FormState => ({
  selection: defaultSelection(item),
  quantity: 1,
  note: "",
  attempted: false,
});

interface ItemSheetProps {
  itemId: string | null;
  onClose: () => void;
}

/** Item details in a bottom sheet: options, notes, pairings, add to cart. */
export function ItemSheet({ itemId, onClose }: ItemSheetProps) {
  const t = useT();
  const { menuState } = useGuest();
  const { addToCart } = useGuestActions();
  const [adding, setAdding] = useState(false);
  const addButton = useRef<HTMLDivElement>(null);

  const item = itemId ? menuState.itemsById.get(itemId) : undefined;
  // Keep the last item so the closing animation still has content.
  const lastItem = useRef<MenuItem | undefined>(undefined);
  if (item) lastItem.current = item;
  const shown = item ?? lastItem.current;

  // Reset the form whenever a different item is opened (or the same one re-opened).
  const [form, setForm] = useState<FormState | null>(null);
  const [formKey, setFormKey] = useState<string | null>(null);
  const openKey = item ? item.id : null;
  if (openKey !== formKey) {
    setFormKey(openKey);
    if (item) setForm(initialForm(item));
  }
  const update = (patch: Partial<FormState>) => setForm((f) => (f ? { ...f, ...patch } : f));

  const submit = async () => {
    if (!shown || !form || adding) return;
    const errors = validateSelection(shown, form.selection);
    if (errors.length > 0) {
      update({ attempted: true });
      haptic(30);
      shake(addButton.current, 8);
      document.getElementById(`group-${errors[0]!.groupId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setAdding(true);
    haptic();
    const ok = await addToCart({ itemId: shown.id, quantity: form.quantity, selection: form.selection, note: form.note });
    setAdding(false);
    if (!ok) return; // the action already explained what went wrong
    toast.success(t("item.added"), t("item.addedBody", { quantity: form.quantity, name: shown.name }));
    onClose();
  };

  const footer =
    shown && form ? (
      shown.inStock ? (
        <div className="flex items-center gap-3">
          <QuantityStepper value={form.quantity} onChange={(quantity) => update({ quantity })} />
          <div ref={addButton} className="min-w-0 flex-1">
            <Button
              size="lg"
              className="w-full min-w-0 justify-between gap-3 px-5"
              onClick={() => void submit()}
              disabled={adding}
              aria-busy={adding}
              aria-label={t("item.add", {
                quantity: form.quantity,
                price: formatPrice(unitPrice(shown, form.selection) * form.quantity),
              })}
            >
              <span className="flex min-w-0 items-center gap-2 truncate">
                {adding && <Loader2 className="size-5 animate-spin" aria-hidden />}
                {t("item.addButton")}
              </span>
              <span
                key={unitPrice(shown, form.selection) * form.quantity}
                className="enter shrink-0 whitespace-nowrap tabular"
              >
                {formatPrice(unitPrice(shown, form.selection) * form.quantity)}
              </span>
            </Button>
          </div>
        </div>
      ) : (
        <Button size="lg" className="w-full" disabled>
          {t("item.soldOut")}
        </Button>
      )
    ) : null;

  return (
    <Sheet
      open={!!item}
      onClose={onClose}
      title={shown?.name ?? ""}
      hideTitle
      scrollKey={shown?.id}
      layout="split"
      media={shown && <ItemMedia item={shown} />}
      footer={footer}
    >
      {shown && form && <ItemBody item={shown} form={form} update={update} />}
    </Sheet>
  );
}

function ItemMedia({ item }: { item: MenuItem }) {
  return (
    // Phones/tablets: a 4:3 / 16:10 photo above the details. Desktop (split sheet): fills the left half.
    <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted sm:aspect-[16/10] lg:aspect-auto lg:h-full">
      <div
        key={item.id}
        className="enter absolute inset-0"
      >
        <Image
          src={item.image}
          alt={item.imageAlt}
          fill
          sizes="(min-width: 1024px) 512px, (min-width: 768px) 672px, (min-width: 640px) 576px, 100vw"
          className={cn("object-cover", !item.inStock && "grayscale")}
          priority
        />
      </div>
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-transparent" />
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-surface to-transparent lg:hidden" />
    </div>
  );
}

function groupHint(group: ModifierGroup, t: ReturnType<typeof useT>) {
  if (group.maxSelect === 1) return t("item.chooseOne");
  if (group.minSelect > 0 && group.minSelect !== group.maxSelect) {
    return t("item.chooseBetween", { min: group.minSelect, max: group.maxSelect });
  }
  return t("item.chooseUpTo", { max: group.maxSelect });
}

interface ItemBodyProps {
  item: MenuItem;
  form: FormState;
  update: (patch: Partial<FormState>) => void;
}

function ItemBody({ item, form, update }: ItemBodyProps) {
  const t = useT();
  const { menuState } = useGuest();
  const errorGroups = new Set(validateSelection(item, form.selection).map((e) => e.groupId));
  const upsells = menuState.menu?.upsells ?? [];
  const suggestions = useMemo(
    () => suggestionsForItem(item.id, upsells, menuState.itemsById),
    [item.id, upsells, menuState.itemsById],
  );
  const combos = combosForItem(item.id, upsells);

  return (
    <div>
      <p className="font-display text-[1.85rem] font-semibold leading-tight" aria-hidden>
        {item.name}
      </p>
      <div className="mt-3 flex items-center gap-3">
        <span aria-hidden className="h-px w-10 bg-primary" />
        <p className="text-lg font-semibold tabular text-primary">{formatPrice(item.price)}</p>
      </div>

      <DietaryTags tags={item.tags} className="mt-4" />

      <p className="mt-4 text-[15px] leading-relaxed text-fg-muted">{item.description}</p>

      <div className="mt-5 flex items-start gap-2.5 rounded-2xl bg-muted/60 px-3.5 py-3 text-sm ring-1 ring-inset ring-line">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <p>
          <span className="font-semibold">{t("item.contains")}: </span>
          <span className="text-fg-muted">
            {item.allergens.length > 0
              ? item.allergens.map((a) => t(`allergens.${a}`)).join(", ")
              : t("item.noAllergens")}
          </span>
          {item.calories ? (
            <span className="text-fg-muted"> · {t("item.calories", { count: item.calories })}</span>
          ) : null}
        </p>
      </div>

      {combos.map((combo) => (
        <div
          key={combo.id}
          className="mt-3 flex items-start gap-2.5 rounded-2xl border border-dashed border-gold-line bg-primary/5 px-3.5 py-3 text-sm"
        >
          <Tag className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <p>
            <span className="font-semibold">{t("item.combo")}: </span>
            <span className="text-fg-muted">
              {t("item.comboBody", {
                items: combo.itemIds
                  .map((id) => menuState.itemsById.get(id)?.name)
                  .filter(Boolean)
                  .join(" + "),
                amount: formatPrice(combo.discount),
              })}
            </span>
          </p>
        </div>
      ))}

      {item.modifierGroups.map((group) => {
        const chosen = form.selection[group.id] ?? [];
        const required = group.minSelect > 0;
        const invalid = form.attempted && errorGroups.has(group.id);
        const multi = group.maxSelect > 1;
        const full = multi && chosen.length >= group.maxSelect;
        const setChosen = (ids: string[]) => update({ selection: { ...form.selection, [group.id]: ids } });

        return (
          <fieldset key={group.id} id={`group-${group.id}`} className="mt-7 scroll-mt-6">
            <legend className="flex w-full items-center justify-between gap-3">
              <span>
                <span className="block font-display text-[1.15rem] font-semibold">{group.name}</span>
                <span className="block text-sm text-fg-muted">{groupHint(group, t)}</span>
              </span>
              {invalid ? (
                <span key={String(form.attempted)} className="shake">
                  <Badge tone="danger">{t("item.pleaseChoose")}</Badge>
                </span>
              ) : required ? (
                <Badge tone={chosen.length >= group.minSelect ? "success" : "primary"}>
                  {chosen.length >= group.minSelect && <Check className="size-3.5" aria-hidden />}
                  {t("item.required")}
                </Badge>
              ) : (
                <Badge>{t("item.optional")}</Badge>
              )}
            </legend>
            <div
              className={cn(
                "mt-3 overflow-hidden rounded-2xl ring-1 transition-colors",
                invalid ? "ring-2 ring-danger/70" : "ring-line",
              )}
            >
              {group.options.map((option, idx) => {
                const selected = chosen.includes(option.id);
                const disabled = !selected && full;
                return (
                  <label
                    key={option.id}
                    className={cn(
                      "flex min-h-14 cursor-pointer items-center gap-3.5 px-4 py-3 transition-colors",
                      idx > 0 && "border-t border-line/70",
                      selected ? "bg-primary/8" : "hover:bg-muted/60",
                      disabled && "cursor-not-allowed opacity-45",
                    )}
                  >
                    <input
                      type={multi ? "checkbox" : "radio"}
                      name={`${item.id}-${group.id}`}
                      className="peer sr-only"
                      checked={selected}
                      disabled={disabled}
                      onChange={() => {
                        haptic(6);
                        setChosen(toggleOption(group, chosen, option.id));
                      }}
                      onClick={() => {
                        // Radios don't fire onChange when re-clicked: allow clearing an optional one.
                        if (!multi && selected && !required) setChosen([]);
                      }}
                    />
                    <span
                      aria-hidden
                      className={cn(
                        "grid size-[22px] shrink-0 place-items-center border-2 transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface",
                        multi ? "rounded-md" : "rounded-full",
                        selected ? "border-primary bg-primary text-on-primary shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary-color)_18%,transparent)]" : "border-fg/25",
                      )}
                    >
                      {selected &&
                        (multi ? (
                          <Check className="size-3.5" strokeWidth={3.2} />
                        ) : (
                          <span className="size-2 rounded-full bg-on-primary" />
                        ))}
                    </span>
                    <span className={cn("flex-1 text-[15px] font-medium", selected && "text-fg")}>{option.name}</span>
                    {option.priceDelta > 0 && (
                      <span className="text-sm text-fg-muted tabular">+{formatPrice(option.priceDelta)}</span>
                    )}
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}

      {item.inStock && (
        <div className="mt-7">
          <label htmlFor={`note-${item.id}`} className="block font-display text-[1.15rem] font-semibold">
            {t("item.instructions")}{" "}
            <span className="text-sm font-normal text-fg-muted">· {t("item.optional")}</span>
          </label>
          <textarea
            id={`note-${item.id}`}
            value={form.note}
            onChange={(e) => update({ note: e.target.value.slice(0, 140) })}
            placeholder={t("item.instructionsPlaceholder")}
            rows={2}
            maxLength={140}
            className="mt-3 w-full resize-none rounded-2xl bg-muted px-4 py-3 text-[15px] ring-1 ring-inset ring-line placeholder:text-fg-muted focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
            aria-describedby={`note-hint-${item.id}`}
          />
          <div id={`note-hint-${item.id}`} className="mt-1.5 flex justify-between gap-4 text-xs text-fg-muted">
            <span>{t("item.instructionsHint")}</span>
            <span className="tabular">{form.note.length}/140</span>
          </div>
        </div>
      )}

      {suggestions.length > 0 && (
        <section className="mt-8" aria-labelledby={`pair-${item.id}`}>
          <h3 id={`pair-${item.id}`} className="font-display text-[1.15rem] font-semibold">
            {t("item.goesWellWith")}
          </h3>
          <div className="no-scrollbar -mx-5 mt-3 flex snap-x gap-3 overflow-x-auto px-5 pb-1 md:-mx-7 md:px-7">
            {suggestions.map((s) => (
              <MiniItemCard key={s.id} item={s} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
