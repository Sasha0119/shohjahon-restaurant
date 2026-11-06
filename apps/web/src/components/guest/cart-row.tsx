"use client";

import type { CartLineDTO } from "@app/shared/api";
import Image from "next/image";
import { Badge } from "@/components/ui/misc";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { useSessionStore } from "@/store/session-store";
import { GuestAvatar } from "./guest-avatar";
import { useGuest } from "./guest-context";
import { useGuestActions } from "./use-guest-actions";

/** One line of the shared cart: photo, name, options, who added it, quantity. */
export function CartRow({ line, compact }: { line: CartLineDTO; compact?: boolean }) {
  const t = useT();
  const { menuState, openItem } = useGuest();
  const meId = useSessionStore((s) => s.snapshot?.me.id);
  const { setQuantity } = useGuestActions();
  const item = menuState.itemsById.get(line.itemId);
  const by = line.guestId === meId ? t("common.you") : line.addedBy || t("common.guest");
  const options = item
    ? item.modifierGroups.flatMap((g) =>
        (line.selection[g.id] ?? []).map((id) => g.options.find((o) => o.id === id)?.name).filter(Boolean),
      )
    : [];
  const name = item?.name ?? t("cart.unavailableItem");

  return (
    <li className="enter border-b border-line last:border-b-0">
      <div className={cn("flex gap-3.5", compact ? "p-3" : "p-4")}>
        <button
          type="button"
          onClick={() => item && openItem(item.id)}
          className={cn(
            "pressable relative shrink-0 overflow-hidden rounded-2xl bg-muted ring-1 ring-line",
            compact ? "size-14" : "size-[4.75rem]",
          )}
          aria-label={name}
        >
          {item && (
            <Image
              src={item.image}
              alt=""
              fill
              sizes="80px"
              className={item.inStock ? "object-cover" : "object-cover grayscale"}
            />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p
              className={cn(
                "min-w-0 font-display font-semibold leading-snug",
                compact ? "text-[15px]" : "text-[1.05rem]",
              )}
            >
              {name}
            </p>
            <p className="shrink-0 font-semibold tabular text-primary">
              {formatPrice(line.unitPriceCents * line.quantity)}
            </p>
          </div>
          {item && !item.inStock && (
            <Badge tone="danger" className="mt-1">
              {t("menu.soldOut")}
            </Badge>
          )}
          {options.length > 0 && <p className="mt-0.5 text-sm text-fg-muted">{options.join(" · ")}</p>}
          {line.note && <p className="mt-0.5 text-sm italic text-fg-muted">“{line.note}”</p>}
          {!compact && (
            <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-fg-muted">
              <GuestAvatar name={line.addedBy || t("common.guest")} me={line.guestId === meId} size={22} />
              <span className="truncate">{t("cart.addedBy", { name: by })}</span>
            </p>
          )}
          <div className="mt-2 flex justify-end">
            <QuantityStepper
              size="sm"
              removable
              min={0}
              value={line.quantity}
              onChange={(q) => void setQuantity(line.id, q)}
              removeLabel={t("cart.remove", { name })}
            />
          </div>
        </div>
      </div>
    </li>
  );
}
