import { suggestionsForItem, validateSelection, defaultSelection, unitPrice } from "@app/shared";
import type { MenuDTO } from "@app/shared/api";
import { describe, expect, it } from "vitest";
import { localizeMenu, menuFromDTO } from "../src/store/menu-store";

const dto: MenuDTO = {
  version: "v1",
  categories: [
    { id: "c1", slug: "mains", name: "Asosiy taomlar", description: null, translations: { en: { name: "Mains" }, ru: { name: "Основные" } }, station: "kitchen", sortOrder: 0 },
  ],
  items: [
    {
      id: "i1",
      slug: "steak",
      categoryId: "c1",
      name: "Steyk",
      description: "Grilda",
      translations: { en: { name: "Steak", description: "Grilled" }, ru: { name: "Стейк" } },
      priceCents: 3000,
      imageUrl: "/uploads/abc.webp",
      imageAlt: "",
      tags: ["gluten-free"],
      allergens: ["milk"],
      calories: null,
      inStock: true,
      stockVersion: 0,
      featured: true,
      modifierGroups: [
        {
          id: "g1",
          name: "Pishirish darajasi",
          translations: { en: { name: "Doneness" } },
          minSelect: 1,
          maxSelect: 1,
          options: [
            { id: "o1", name: "Kam pishgan", translations: { en: { name: "Rare" } }, priceDeltaCents: 0, isDefault: false },
            { id: "o2", name: "Vagyu", translations: {}, priceDeltaCents: 1500, isDefault: false },
          ],
        },
      ],
    },
    {
      id: "i2",
      slug: "fries",
      categoryId: "c1",
      name: "Fri",
      description: "",
      translations: {},
      priceCents: 500,
      imageUrl: "/images/menu/achichuk.jpg",
      imageAlt: "Fries in a basket",
      tags: [],
      allergens: [],
      calories: 400,
      inStock: true,
      stockVersion: 0,
      featured: false,
      modifierGroups: [],
    },
  ],
  suggestions: [{ itemId: "i1", suggestItemId: "i2" }],
  combos: [{ id: "x1", name: "Steyk kechasi", translations: { en: { name: "Steak night" } }, discountCents: 200, itemIds: ["i1", "i2"] }],
};

describe("menuFromDTO", () => {
  const menu = menuFromDTO(dto);
  const byId = new Map(menu.items.map((i) => [i.id, i]));

  it("maps prices, images and alt text", () => {
    const steak = byId.get("i1")!;
    expect(steak).toMatchObject({ price: 3000, image: "/uploads/abc.webp", imageAlt: "Steyk", featured: true });
    expect(steak.calories).toBeUndefined();
    expect(byId.get("i2")!.calories).toBe(400);
    expect(menu.categories[0]).not.toHaveProperty("description");
  });

  it("keeps the shared cart logic working on API data", () => {
    const steak = byId.get("i1")!;
    expect(validateSelection(steak, defaultSelection(steak))).toHaveLength(1); // required, no default
    expect(unitPrice(steak, { g1: ["o2"] })).toBe(4500);
  });

  it("turns suggestions and combos into upsell rules", () => {
    expect(suggestionsForItem("i1", menu.upsells, byId).map((i) => i.id)).toEqual(["i2"]);
    expect(menu.upsells.find((u) => u.kind === "combo")).toMatchObject({ name: "Steyk kechasi", discount: 200, itemIds: ["i1", "i2"] });
  });
});

describe("localizeMenu", () => {
  const menu = menuFromDTO(dto);

  it("shows names, descriptions and options in the chosen language", () => {
    const en = localizeMenu(menu, "en");
    const steak = en.items[0]!;
    expect(steak.name).toBe("Steak");
    expect(steak.description).toBe("Grilled");
    expect(steak.modifierGroups[0]!.name).toBe("Doneness");
    expect(steak.modifierGroups[0]!.options.map((o) => o.name)).toEqual(["Rare", "Vagyu"]); // untranslated → default language
    expect(en.categories[0]!.name).toBe("Mains");
    expect(en.upsells.find((u) => u.kind === "combo")).toMatchObject({ name: "Steak night" });
  });

  it("falls back to the default language field by field", () => {
    const ru = localizeMenu(menu, "ru");
    expect(ru.items[0]!.name).toBe("Стейк");
    expect(ru.items[0]!.description).toBe("Grilda"); // no Russian description
    expect(localizeMenu(menu, "uz").items[0]!.name).toBe("Steyk");
  });

  it("never changes ids or prices, so carts work in every language", () => {
    const ru = localizeMenu(menu, "ru");
    expect(ru.items.map((i) => [i.id, i.price])).toEqual(menu.items.map((i) => [i.id, i.price]));
    expect(unitPrice(ru.items[0]!, { g1: ["o2"] })).toBe(4500);
  });
});
