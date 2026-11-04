"use client";

import type { DietaryTag } from "@app/shared";
import { BadgeCheck, Flame, Leaf, Sprout, WheatOff, type LucideIcon } from "lucide-react";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";

export const tagIcons: Record<DietaryTag, LucideIcon> = {
  vegan: Leaf,
  vegetarian: Sprout,
  "gluten-free": WheatOff,
  halal: BadgeCheck,
  spicy: Flame,
};

interface DietaryTagsProps {
  tags: DietaryTag[];
  /** "pills" = icon + label; "glass" = compact icon chips on top of a photo. */
  variant?: "pills" | "glass";
  className?: string;
}

export function DietaryTags({ tags, variant = "pills", className }: DietaryTagsProps) {
  const t = useT();
  if (tags.length === 0) return null;

  if (variant === "glass") {
    return (
      <ul className={cn("flex gap-1.5", className)} aria-label={tags.map((tag) => t(`tags.${tag}`)).join(", ")}>
        {tags.map((tag) => {
          const Icon = tagIcons[tag];
          return (
            <li key={tag} className="grid size-8 place-items-center rounded-full glass-dark" title={t(`tags.${tag}`)}>
              <Icon className="size-[15px]" strokeWidth={1.8} aria-hidden />
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {tags.map((tag) => {
        const Icon = tagIcons[tag];
        return (
          <li
            key={tag}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
              tag === "spicy" ? "text-danger ring-danger/35" : "text-fg ring-gold-line",
            )}
          >
            <Icon className={cn("size-3.5", tag !== "spicy" && "text-primary")} aria-hidden />
            {t(`tags.${tag}`)}
          </li>
        );
      })}
    </ul>
  );
}
