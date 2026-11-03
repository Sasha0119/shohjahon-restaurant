import { suggestionsForItem, validateSelection, defaultSelection, unitPrice } from "@app/shared";
import type { MenuDTO } from "@app/shared/api";
import { describe, expect, it } from "vitest";
import { menuFromDTO } from "../src/store/menu-store";

const dto: MenuDTO = {
  version: "v1",
  categories: [{ id: "c1", slug: "mains", name: "Mains", description: null, station: "kitchen", sortOrder: 0 }],
  items: [
    {
      id: "i1",
      slug: "steak",
      categoryId: "c1",
      name: "Steak",
      description: "Grilled",
      priceCents: 3000,
      imageUrl: "/uploads/abc.webp",
      imageAlt: "",
      tags: ["gluten-free"],
      allergens: ["milk"],
      calories: null,
      inStock: true,
      featured: true,
      modifierGroups: [
        {
          id: "g1",
          name: "Doneness",
          minSelect: 1,
          maxSelect: 1,
          options: [
            { id: "o1", name: "Rare", priceDeltaCents: 0, isDefault: false },
            { id: "o2", name: "Wagyu upgrade", priceDeltaCents: 1500, isDefault: false },
          ],
        },
      ],
    },
    {
      id: "i2",
      slug: "fries",
      categoryId: "c1",
      name: "Fries",
      description: "",
      priceCents: 500,
      imageUrl: "/images/menu/parmesan-fries.jpg",
      imageAlt: "Fries in a basket",
      tags: [],
      allergens: [],
      calories: 400,
      inStock: true,
      featured: false,
      modifierGroups: [],
    },
  ],
  suggestions: [{ itemId: "i1", suggestItemId: "i2" }],
  combos: [{ id: "x1", name: "Steak night", discountCents: 200, itemIds: ["i1", "i2"] }],
};

describe("menuFromDTO", () => {
  const menu = menuFromDTO(dto);
  const byId = new Map(menu.items.map((i) => [i.id, i]));

  it("maps prices, images and alt text", () => {
    const steak = byId.get("i1")!;
    expect(steak).toMatchObject({ price: 3000, image: "/uploads/abc.webp", imageAlt: "Steak", featured: true });
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
    expect(menu.upsells.find((u) => u.kind === "combo")).toMatchObject({ name: "Steak night", discount: 200, itemIds: ["i1", "i2"] });
  });
});
