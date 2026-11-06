import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { seedMenu } from "../../../packages/shared/src/seed/menu";
import { SIGNATURE_DISHES } from "../src/components/landing/signature-dishes";

describe("landing page dishes", () => {
  it.each(SIGNATURE_DISHES)("$slug matches the seed menu and has a photo", (dish) => {
    const item = seedMenu.items.find((i) => i.slug === dish.slug);
    expect(item, dish.slug).toBeDefined();
    expect(item!.translations?.uz?.name ?? item!.name).toBe(dish.name.uz);
    expect(item!.translations?.en?.name ?? item!.name).toBe(dish.name.en);
    expect(item!.translations?.ru?.name ?? item!.name).toBe(dish.name.ru);
    expect(existsSync(fileURLToPath(new URL(`../public/images/menu/${dish.slug}.jpg`, import.meta.url)))).toBe(true);
  });
});
