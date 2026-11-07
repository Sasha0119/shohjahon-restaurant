"use client";

import { toggleOption, unitPrice, type MenuItem, type ModifierSelection } from "@app/shared";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { useMenu } from "@/hooks/use-menu";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";

export interface ChosenDish {
  item: MenuItem;
  quantity: number;
  selection: ModifierSelection;
  note: string;
}

export const dishesTotal = (dishes: ChosenDish[]) =>
  dishes.reduce((n, d) => n + unitPrice(d.item, d.selection) * d.quantity, 0);

/** The dishes the kitchen will have ready when the guest arrives. */
export function BookingDishes({
  chosen,
  onAdd,
  onChange,
}: {
  chosen: ChosenDish[];
  onAdd: (item: MenuItem) => void;
  onChange: (itemId: string, next: ChosenDish | null) => void;
}) {
  const t = useT();
  const { menu } = useMenu();
  if (!menu) return <p className="text-sm text-fg-muted">{t("reserve.dishesLoading")}</p>;

  return (
    <div className="space-y-5">
      {menu.categories.map((category) => {
        const items = menu.items.filter((i) => i.categoryId === category.id && i.inStock);
        if (items.length === 0) return null;
        return (
          <section key={category.id} aria-label={category.name}>
            <h3 className="text-[13px] font-label uppercase tracking-[0.08em] text-primary">{category.name}</h3>
            <ul className="mt-1 divide-y divide-line">
              {items.map((item) => {
                const dish = chosen.find((d) => d.item.id === item.id);
                return (
                  <li key={item.id} className="py-3">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{item.name}</p>
                        <p className="text-sm tabular text-fg-muted">{formatPrice(item.price)}</p>
                      </div>
                      {dish ? (
                        <QuantityStepper
                          size="sm"
                          min={0}
                          removable
                          removeLabel={t("cart.remove", { name: item.name })}
                          value={dish.quantity}
                          onChange={(quantity) => onChange(item.id, quantity > 0 ? { ...dish, quantity } : null)}
                        />
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          aria-label={t("reserve.addDish", { name: item.name })}
                          onClick={() => onAdd(item)}
                        >
                          <Plus className="size-4" aria-hidden />
                          {t("reserve.add")}
                        </Button>
                      )}
                    </div>
                    {dish && <DishOptions dish={dish} onChange={(next) => onChange(item.id, next)} />}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function DishOptions({ dish, onChange }: { dish: ChosenDish; onChange: (next: ChosenDish) => void }) {
  const t = useT();
  return (
    <div className="mt-2 space-y-2">
      {dish.item.modifierGroups.map((group) => (
        <div key={group.id} role="group" aria-label={group.name}>
          <p className="text-sm font-semibold">{group.name}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {group.options.map((option) => {
              const current = dish.selection[group.id] ?? [];
              const on = current.includes(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    onChange({
                      ...dish,
                      selection: { ...dish.selection, [group.id]: toggleOption(group, current, option.id) },
                    })
                  }
                  className={cn(
                    "rounded-full px-3 py-1 text-sm ring-1 ring-inset",
                    on ? "bg-primary text-on-primary ring-primary" : "bg-muted ring-line",
                  )}
                >
                  {option.name}
                  {option.priceDelta > 0 && ` +${formatPrice(option.priceDelta)}`}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <input
        value={dish.note}
        maxLength={140}
        placeholder={t("reserve.dishNote")}
        aria-label={t("reserve.dishNote")}
        onChange={(e) => onChange({ ...dish, note: e.target.value })}
        className="h-10 w-full rounded-2xl bg-muted px-4 text-sm ring-1 ring-inset ring-line placeholder:text-fg-muted focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
      />
    </div>
  );
}
