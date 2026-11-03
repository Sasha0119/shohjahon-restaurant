import type {
  Category,
  Menu,
  MenuItem,
  ModifierGroup,
  ModifierOption,
  UpsellRule,
} from "../types";

/**
 * Demo menu: 25 dishes across 5 categories. Prices are in cents.
 * Photos: apps/web/public/images/menu/<slug>.jpg (see CREDITS.md there).
 * In Phase 2 this same data seeds the database.
 */

// ── helpers ──────────────────────────────────────────────────────────────────
const $ = (dollars: number) => Math.round(dollars * 100);

function opt(id: string, name: string, extra = 0, isDefault = false): ModifierOption {
  return { id, name, priceDelta: $(extra), ...(isDefault ? { isDefault } : {}) };
}

/** Guest must pick exactly one. */
function pickOne(id: string, name: string, options: ModifierOption[]): ModifierGroup {
  return { id, name, minSelect: 1, maxSelect: 1, options };
}

/** Optional, at most one. */
function maybeOne(id: string, name: string, options: ModifierOption[]): ModifierGroup {
  return { id, name, minSelect: 0, maxSelect: 1, options };
}

/** Optional, up to `max`. */
function upTo(max: number, id: string, name: string, options: ModifierOption[]): ModifierGroup {
  return { id, name, minSelect: 0, maxSelect: max, options };
}

type ItemInput = Omit<MenuItem, "id" | "image" | "imageAlt" | "inStock" | "modifierGroups"> & {
  imageAlt?: string;
  inStock?: boolean;
  modifierGroups?: ModifierGroup[];
};

function item(input: ItemInput): MenuItem {
  return {
    ...input,
    id: `item-${input.slug}`,
    image: `/images/menu/${input.slug}.jpg`,
    imageAlt: input.imageAlt ?? input.name,
    inStock: input.inStock ?? true,
    modifierGroups: input.modifierGroups ?? [],
  };
}

// Shared modifier groups
const pizzaSize = () =>
  pickOne("size", "Size", [opt("10in", '10" classic', 0, true), opt("14in", '14" large', 5)]);
const coffeeMilk = () =>
  pickOne("milk", "Milk", [
    opt("whole", "Whole milk", 0, true),
    opt("skim", "Skimmed milk"),
    opt("oat", "Oat milk", 0.6),
    opt("almond", "Almond milk", 0.6),
  ]);
const coffeeExtras = () =>
  upTo(2, "extras", "Extras", [
    opt("shot", "Extra shot", 0.8),
    opt("vanilla", "Vanilla syrup", 0.5),
    opt("caramel", "Caramel syrup", 0.5),
  ]);

// ── categories ───────────────────────────────────────────────────────────────
export const categories: Category[] = [
  {
    id: "cat-starters",
    slug: "starters",
    name: "Starters",
    description: "Small plates to share while you settle in.",
    station: "kitchen",
    sortOrder: 1,
  },
  {
    id: "cat-mains",
    slug: "mains",
    name: "Mains",
    description: "Grill, sea and garden — cooked to order.",
    station: "kitchen",
    sortOrder: 2,
  },
  {
    id: "cat-pizza-pasta",
    slug: "pizza-pasta",
    name: "Pizza & Pasta",
    description: "Slow-proved dough and sauces made in-house.",
    station: "kitchen",
    sortOrder: 3,
  },
  {
    id: "cat-desserts",
    slug: "desserts",
    name: "Desserts",
    description: "Leave room. You won't regret it.",
    station: "kitchen",
    sortOrder: 4,
  },
  {
    id: "cat-drinks",
    slug: "drinks",
    name: "Drinks",
    description: "Coffee, fresh juices and house coolers.",
    station: "bar",
    sortOrder: 5,
    // Example of a time-based menu (uncomment to try):
    // availability: [{ from: "08:00", to: "23:00" }],
  },
];

// ── items ────────────────────────────────────────────────────────────────────
export const items: MenuItem[] = [
  // Starters
  item({
    slug: "tomato-bruschetta",
    categoryId: "cat-starters",
    name: "Heirloom Tomato Bruschetta",
    description:
      "Charred sourdough, heirloom tomatoes, torn basil, garlic and a generous pour of extra-virgin olive oil.",
    price: $(9.5),
    tags: ["vegan"],
    allergens: ["gluten"],
    calories: 320,
    modifierGroups: [maybeOne("extras", "Make it richer", [opt("stracciatella", "Add stracciatella (contains milk)", 3.5)])],
  }),
  item({
    slug: "crispy-chicken-tenders",
    categoryId: "cat-starters",
    name: "Buttermilk Chicken Tenders",
    description: "Crunchy, juicy tenders brined overnight in buttermilk. Served with your choice of dip.",
    price: $(11),
    tags: ["halal"],
    allergens: ["gluten", "eggs", "milk"],
    calories: 540,
    modifierGroups: [
      pickOne("dip", "Choose a dip", [
        opt("honey-chipotle", "Honey chipotle", 0, true),
        opt("garlic-aioli", "Garlic aioli"),
        opt("smoky-bbq", "Smoky BBQ"),
      ]),
    ],
  }),
  item({
    slug: "smoky-chicken-wings",
    categoryId: "cat-starters",
    name: "Smoky Chicken Wings",
    description: "Slow-smoked, then flash-grilled and glazed. Crisp peppers and a cooling dip on the side.",
    price: $(12.5),
    tags: ["halal", "gluten-free", "spicy"],
    allergens: ["milk", "mustard", "celery"],
    calories: 610,
    modifierGroups: [
      pickOne("portion", "Portion", [opt("6", "6 pieces", 0, true), opt("12", "12 pieces", 9)]),
      pickOne("heat", "Heat level", [opt("mild", "Mild"), opt("medium", "Medium", 0, true), opt("hot", "Hot")]),
    ],
  }),
  item({
    slug: "roasted-pumpkin-soup",
    categoryId: "cat-starters",
    name: "Roasted Pumpkin Soup",
    description: "Velvety roasted pumpkin, coconut cream, toasted seeds and a pinch of chili.",
    price: $(8.5),
    tags: ["vegan", "gluten-free"],
    allergens: ["celery"],
    calories: 260,
    modifierGroups: [maybeOne("bread", "On the side", [opt("sourdough", "Warm sourdough (contains gluten)", 2)])],
  }),
  item({
    slug: "parmesan-fries",
    categoryId: "cat-starters",
    name: "Truffle Parmesan Fries",
    description: "Hand-cut fries tossed in truffle oil, aged parmesan and fresh parsley.",
    price: $(7.5),
    tags: ["vegetarian", "gluten-free"],
    allergens: ["milk"],
    calories: 480,
  }),

  // Mains
  item({
    slug: "double-smash-burger",
    categoryId: "cat-mains",
    name: "Double Smash Burger",
    description:
      "Two crisp-edged beef patties, aged cheddar, pickles and house sauce on a toasted brioche bun.",
    price: $(18.5),
    tags: ["halal"],
    allergens: ["gluten", "milk", "eggs", "mustard", "sesame"],
    calories: 980,
    featured: true,
    modifierGroups: [
      pickOne("side", "Choose a side", [
        opt("fries", "Skin-on fries", 0, true),
        opt("salad", "Side salad"),
        opt("truffle-fries", "Truffle parmesan fries", 2.5),
      ]),
      upTo(3, "extras", "Add extras", [
        opt("patty", "Extra patty", 5),
        opt("cheese", "Extra cheddar", 1.5),
        opt("bacon-jam", "Beef bacon jam", 2.5),
        opt("jalapenos", "Pickled jalapeños", 1),
      ]),
    ],
  }),
  item({
    slug: "steak-frites",
    categoryId: "cat-mains",
    name: "Ribeye Steak Frites",
    description: "300 g grass-fed ribeye, herb butter and crisp frites. Rested, sliced and served sizzling.",
    price: $(34),
    tags: ["halal", "gluten-free"],
    allergens: ["milk"],
    calories: 1150,
    featured: true,
    modifierGroups: [
      pickOne("doneness", "How would you like it cooked?", [
        opt("rare", "Rare"),
        opt("medium-rare", "Medium rare"),
        opt("medium", "Medium"),
        opt("medium-well", "Medium well"),
        opt("well-done", "Well done"),
      ]),
      maybeOne("sauce", "Add a sauce", [
        opt("peppercorn", "Green peppercorn", 2),
        opt("bearnaise", "Béarnaise (contains eggs)", 2),
        opt("chimichurri", "Chimichurri", 2),
      ]),
    ],
  }),
  item({
    slug: "seared-salmon",
    categoryId: "cat-mains",
    name: "Crispy-Skin Salmon",
    description: "Pan-seared salmon on wilted greens with a bright citrus butter and fresh lime.",
    price: $(27),
    tags: ["gluten-free"],
    allergens: ["fish", "milk"],
    calories: 640,
    featured: true,
  }),
  item({
    slug: "mixed-grill-skewers",
    categoryId: "cat-mains",
    name: "Charcoal Mixed Grill",
    description:
      "Marinated chicken and lamb skewers, blistered peppers, roast potatoes and two house dips.",
    price: $(26),
    tags: ["halal", "gluten-free", "spicy"],
    allergens: ["milk"],
    calories: 890,
    modifierGroups: [
      upTo(2, "dips", "Extra dips", [
        opt("harissa", "Chili harissa", 1),
        opt("garlic-yogurt", "Garlic yogurt", 1),
        opt("toum", "Whipped garlic toum", 1),
      ]),
    ],
  }),
  item({
    slug: "rainbow-buddha-bowl",
    categoryId: "cat-mains",
    name: "Rainbow Buddha Bowl",
    description:
      "Roast sweet potato, chickpeas, avocado, pickled red cabbage, greens and tahini-lemon dressing.",
    price: $(16.5),
    tags: ["vegan", "gluten-free"],
    allergens: ["sesame"],
    calories: 590,
    modifierGroups: [
      maybeOne("protein", "Add protein", [
        opt("tofu", "Crispy tofu (contains soy)", 3.5),
        opt("chicken", "Grilled chicken", 4.5),
        opt("salmon", "Seared salmon (contains fish)", 6.5),
      ]),
    ],
  }),

  // Pizza & Pasta
  item({
    slug: "margherita-pizza",
    categoryId: "cat-pizza-pasta",
    name: "Margherita",
    description: "San Marzano tomato, fior di latte, fresh basil and olive oil on a 48-hour dough.",
    price: $(15),
    tags: ["vegetarian"],
    allergens: ["gluten", "milk"],
    calories: 820,
    featured: true,
    modifierGroups: [
      pizzaSize(),
      upTo(3, "toppings", "Extra toppings", [
        opt("burrata", "Burrata", 4),
        opt("olives", "Kalamata olives", 1.5),
        opt("mushrooms", "Roast mushrooms", 1.5),
        opt("chili-oil", "Chili oil", 1),
      ]),
    ],
  }),
  item({
    slug: "four-cheese-pizza",
    categoryId: "cat-pizza-pasta",
    name: "Quattro Formaggi",
    description: "Mozzarella, gorgonzola, fontina and parmesan with a drizzle of wildflower honey.",
    price: $(17.5),
    tags: ["vegetarian"],
    allergens: ["gluten", "milk"],
    calories: 940,
    modifierGroups: [pizzaSize()],
  }),
  item({
    slug: "garlic-prawn-spaghetti",
    categoryId: "cat-pizza-pasta",
    name: "Garlic Prawn Spaghetti",
    description: "Tiger prawns, cherry tomatoes, garlic, chili and white wine, tossed through fresh spaghetti.",
    price: $(22),
    tags: ["spicy"],
    allergens: ["gluten", "crustaceans", "eggs", "sulphites"],
    calories: 760,
    inStock: false,
  }),
  item({
    slug: "penne-arrabbiata",
    categoryId: "cat-pizza-pasta",
    name: "Penne all'Arrabbiata",
    description: "Penne in a fiery tomato, garlic and chili sauce, finished with fresh parsley.",
    price: $(14.5),
    tags: ["vegan", "spicy"],
    allergens: ["gluten"],
    calories: 620,
    modifierGroups: [
      maybeOne("pasta", "Pasta", [opt("gf", "Gluten-free penne", 2)]),
      maybeOne("cheese", "Finish with", [opt("parmesan", "Shaved parmesan (contains milk)", 1.5)]),
    ],
  }),
  item({
    slug: "pesto-farfalle",
    categoryId: "cat-pizza-pasta",
    name: "Basil Pesto Farfalle",
    description: "Farfalle with fresh basil pesto, blistered cherry tomatoes and toasted pine nuts.",
    price: $(15.5),
    tags: ["vegetarian"],
    allergens: ["gluten", "milk", "tree-nuts"],
    calories: 680,
  }),

  // Desserts
  item({
    slug: "classic-tiramisu",
    categoryId: "cat-desserts",
    name: "Classic Tiramisu",
    description: "Espresso-soaked savoiardi, mascarpone cream and a dusting of dark cocoa.",
    price: $(9),
    tags: ["vegetarian"],
    allergens: ["gluten", "eggs", "milk"],
    calories: 450,
    featured: true,
  }),
  item({
    slug: "fudge-brownie",
    categoryId: "cat-desserts",
    name: "Warm Fudge Brownie",
    description: "Dense dark-chocolate brownie, served warm with a glossy fudge sauce.",
    price: $(8.5),
    tags: ["vegetarian"],
    allergens: ["gluten", "eggs", "milk", "tree-nuts"],
    calories: 520,
    modifierGroups: [maybeOne("side", "Add on the side", [opt("ice-cream", "Vanilla ice cream", 2.5)])],
  }),
  item({
    slug: "raspberry-layer-cake",
    categoryId: "cat-desserts",
    name: "Raspberry Layer Cake",
    description: "Light sponge layered with raspberry jam and vanilla cream, topped with fresh berries.",
    price: $(9.5),
    tags: ["vegetarian"],
    allergens: ["gluten", "eggs", "milk"],
    calories: 480,
    inStock: false,
  }),
  item({
    slug: "strawberry-panna-cotta",
    categoryId: "cat-desserts",
    name: "Strawberry Panna Cotta",
    description: "Silky vanilla panna cotta set with agar, macerated strawberries and mint.",
    price: $(8),
    tags: ["vegetarian", "gluten-free"],
    allergens: ["milk"],
    calories: 340,
  }),
  item({
    slug: "strawberry-soft-serve",
    categoryId: "cat-desserts",
    name: "Strawberry Soft Serve",
    description: "Creamy soft serve swirled with real strawberry. Simple, cold, perfect.",
    price: $(6),
    tags: ["vegetarian"],
    allergens: ["milk", "gluten"],
    calories: 290,
    modifierGroups: [
      pickOne("serve", "Cone or cup?", [opt("cone", "Waffle cone", 0, true), opt("cup", "Cup (gluten-free)")]),
    ],
  }),

  // Drinks
  item({
    slug: "flat-white",
    categoryId: "cat-drinks",
    name: "Flat White",
    description: "Double ristretto with silky micro-foamed milk.",
    price: $(4.5),
    tags: ["vegetarian", "gluten-free"],
    allergens: ["milk"],
    calories: 120,
    modifierGroups: [coffeeMilk(), coffeeExtras()],
  }),
  item({
    slug: "iced-latte",
    categoryId: "cat-drinks",
    name: "Iced Latte",
    description: "Espresso poured over cold milk and ice. Smooth and refreshing.",
    price: $(5.25),
    tags: ["vegetarian", "gluten-free"],
    allergens: ["milk"],
    calories: 150,
    modifierGroups: [coffeeMilk(), coffeeExtras()],
  }),
  item({
    slug: "fresh-orange-juice",
    categoryId: "cat-drinks",
    name: "Fresh Orange Juice",
    description: "Squeezed to order. Nothing added.",
    price: $(5.5),
    tags: ["vegan", "gluten-free"],
    allergens: [],
    calories: 110,
    modifierGroups: [pickOne("size", "Size", [opt("regular", "Regular", 0, true), opt("large", "Large", 1.5)])],
  }),
  item({
    slug: "mint-lime-cooler",
    categoryId: "cat-drinks",
    name: "Mint & Lime Cooler",
    description: "Muddled mint and lime, cane sugar and sparkling water over crushed ice.",
    price: $(6.5),
    tags: ["vegan", "gluten-free"],
    allergens: [],
    calories: 90,
    featured: true,
    modifierGroups: [
      pickOne("sweetness", "Sweetness", [opt("less", "Less sweet"), opt("regular", "Regular", 0, true)]),
    ],
  }),
  item({
    slug: "house-iced-tea",
    categoryId: "cat-drinks",
    name: "Peach Iced Tea",
    description: "Cold-brewed black tea with ripe peach and a squeeze of lime.",
    price: $(4.75),
    tags: ["vegan", "gluten-free"],
    allergens: [],
    calories: 80,
  }),
];

// ── upsell rules ─────────────────────────────────────────────────────────────
const suggest = (from: string, to: string): UpsellRule => ({
  id: `up-${from}-${to}`,
  kind: "suggest",
  itemId: `item-${from}`,
  suggestItemId: `item-${to}`,
});

export const upsells: UpsellRule[] = [
  suggest("double-smash-burger", "parmesan-fries"),
  suggest("double-smash-burger", "house-iced-tea"),
  suggest("steak-frites", "tomato-bruschetta"),
  suggest("steak-frites", "classic-tiramisu"),
  suggest("seared-salmon", "strawberry-panna-cotta"),
  suggest("seared-salmon", "mint-lime-cooler"),
  suggest("mixed-grill-skewers", "parmesan-fries"),
  suggest("mixed-grill-skewers", "mint-lime-cooler"),
  suggest("rainbow-buddha-bowl", "fresh-orange-juice"),
  suggest("margherita-pizza", "tomato-bruschetta"),
  suggest("margherita-pizza", "mint-lime-cooler"),
  suggest("four-cheese-pizza", "house-iced-tea"),
  suggest("penne-arrabbiata", "tomato-bruschetta"),
  suggest("pesto-farfalle", "fresh-orange-juice"),
  suggest("smoky-chicken-wings", "parmesan-fries"),
  suggest("crispy-chicken-tenders", "parmesan-fries"),
  suggest("classic-tiramisu", "flat-white"),
  suggest("fudge-brownie", "flat-white"),
  suggest("strawberry-soft-serve", "iced-latte"),
  {
    id: "combo-burger-night",
    kind: "combo",
    name: "Burger night",
    itemIds: ["item-double-smash-burger", "item-parmesan-fries", "item-house-iced-tea"],
    discount: $(3),
  },
  {
    id: "combo-coffee-and-cake",
    kind: "combo",
    name: "Coffee & tiramisu",
    itemIds: ["item-classic-tiramisu", "item-flat-white"],
    discount: $(1.5),
  },
];

export const seedMenu: Menu = { categories, items, upsells };
