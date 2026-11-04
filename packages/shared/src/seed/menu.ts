import type {
  Category,
  Menu,
  MenuItem,
  ModifierGroup,
  ModifierOption,
  TextTranslations,
  UpsellRule,
} from "../types";

/**
 * Demo menu for "Shohjahon": premium modern Uzbek cuisine with European
 * touches. 25 dishes in 5 categories. Prices are whole so'm.
 *
 * Every text is written in Uzbek (the restaurant's default language, stored
 * in the plain fields) with English and Russian translations.
 * Photos: apps/web/public/images/menu/<slug>.jpg (see CREDITS.md there).
 * This same data seeds the database (`npm run db:seed`).
 */

// ── helpers ──────────────────────────────────────────────────────────────────
/** One text in every language: [uz, en, ru]. */
type T3 = readonly [uz: string, en: string, ru: string];

function translations<F extends string>(fields: Partial<Record<F, T3>>): TextTranslations<F> {
  const out: Record<string, Partial<Record<F, string>>> = { en: {}, ru: {} };
  for (const [field, t] of Object.entries(fields) as [F, T3][]) {
    out.en![field] = t[1];
    out.ru![field] = t[2];
  }
  return out;
}

function opt(id: string, name: T3, extra = 0, isDefault = false): ModifierOption {
  return { id, name: name[0], translations: translations({ name }), priceDelta: extra, ...(isDefault ? { isDefault } : {}) };
}

function group(id: string, name: T3, minSelect: number, maxSelect: number, options: ModifierOption[]): ModifierGroup {
  return { id, name: name[0], translations: translations({ name }), minSelect, maxSelect, options };
}
/** Guest must pick exactly one. */
const pickOne = (id: string, name: T3, options: ModifierOption[]) => group(id, name, 1, 1, options);
/** Optional, at most one. */
const maybeOne = (id: string, name: T3, options: ModifierOption[]) => group(id, name, 0, 1, options);
/** Optional, up to `max`. */
const upTo = (max: number, id: string, name: T3, options: ModifierOption[]) => group(id, name, 0, max, options);

type ItemInput = Omit<
  MenuItem,
  "id" | "image" | "imageAlt" | "inStock" | "modifierGroups" | "name" | "description" | "translations"
> & {
  name: T3;
  description: T3;
  inStock?: boolean;
  modifierGroups?: ModifierGroup[];
};

function item(input: ItemInput): MenuItem {
  const { name, description, ...rest } = input;
  return {
    ...rest,
    id: `item-${input.slug}`,
    name: name[0],
    description: description[0],
    translations: translations({ name, description, imageAlt: name }),
    image: `/images/menu/${input.slug}.jpg`,
    imageAlt: name[0],
    inStock: input.inStock ?? true,
    modifierGroups: input.modifierGroups ?? [],
  };
}

function category(c: Omit<Category, "name" | "description" | "translations"> & { name: T3; description: T3 }): Category {
  const { name, description, ...rest } = c;
  return { ...rest, name: name[0], description: description[0], translations: translations({ name, description }) };
}

// Shared modifier groups
const drinkSize = (jugExtra: number) =>
  pickOne("size", ["Hajmi", "Size", "Объём"], [
    opt("glass", ["Stakan", "Glass", "Стакан"], 0, true),
    opt("jug", ["Grafin (1 litr)", "Jug (1 litre)", "Кувшин (1 л)"], jugExtra),
  ]);

// ── categories ───────────────────────────────────────────────────────────────
export const categories: Category[] = [
  category({
    id: "cat-starters",
    slug: "starters",
    name: ["Salatlar va gazaklar", "Starters", "Закуски"],
    description: [
      "Dasturxonni boshlash uchun yengil taomlar.",
      "Small plates to start the table.",
      "Лёгкие блюда, чтобы начать застолье.",
    ],
    station: "kitchen",
    sortOrder: 1,
  }),
  category({
    id: "cat-mains",
    slug: "mains",
    name: ["Asosiy taomlar", "Main dishes", "Основные блюда"],
    description: [
      "Qozon va tandirdan — oilaviy retseptlar zamonaviy talqinda.",
      "From the kazan and the tandoor — family recipes, refined.",
      "Из казана и тандыра — семейные рецепты в современной подаче.",
    ],
    station: "kitchen",
    sortOrder: 2,
  }),
  category({
    id: "cat-grill",
    slug: "grill",
    name: ["Kabob va grill", "Grill", "Гриль"],
    description: ["Saksovul koʻmirida pishirilgan.", "Cooked over saxaul charcoal.", "Готовим на углях саксаула."],
    station: "kitchen",
    sortOrder: 3,
  }),
  category({
    id: "cat-desserts",
    slug: "desserts",
    name: ["Shirinliklar", "Desserts", "Десерты"],
    description: [
      "Choy bilan yoki choysiz — shirin yakun.",
      "A sweet finish, with or without tea.",
      "Сладкое завершение — к чаю и не только.",
    ],
    station: "kitchen",
    sortOrder: 4,
  }),
  category({
    id: "cat-drinks",
    slug: "drinks",
    name: ["Ichimliklar", "Drinks", "Напитки"],
    description: ["Choy, qahva va uy limonadlari.", "Tea, coffee and house lemonades.", "Чай, кофе и домашние лимонады."],
    station: "bar",
    sortOrder: 5,
    // Example of a time-based menu (uncomment to try):
    // availability: [{ from: "08:00", to: "23:00" }],
  }),
];

// ── items ────────────────────────────────────────────────────────────────────
export const items: MenuItem[] = [
  // ── Starters
  item({
    slug: "achichuk",
    categoryId: "cat-starters",
    name: ["Achchiq-chuchuk", "Achichuk tomato salad", "Салат ачичук"],
    description: [
      "Toshkent pomidorlari, yupqa toʻgʻralgan shirin piyoz, rayhon va ozgina achchiq qalampir.",
      "Tashkent tomatoes, paper-thin sweet onion, basil and a little hot pepper.",
      "Ташкентские помидоры, тонкий сладкий лук, базилик и немного острого перца.",
    ],
    price: 32_000,
    tags: ["vegan", "gluten-free"],
    allergens: [],
    calories: 90,
  }),
  item({
    slug: "burrata-tomatoes",
    categoryId: "cat-starters",
    name: ["Burrata va Toshkent pomidorlari", "Burrata with Tashkent tomatoes", "Буррата с ташкентскими томатами"],
    description: [
      "Kremli burrata, pishgan mahalliy pomidorlar, rayhon va zaytun moyi.",
      "Creamy burrata on ripe local tomatoes with basil and olive oil.",
      "Нежная буррата на спелых местных томатах с базиликом и оливковым маслом.",
    ],
    price: 98_000,
    tags: ["vegetarian", "gluten-free"],
    allergens: ["milk"],
    calories: 380,
    featured: true,
  }),
  item({
    slug: "beef-tartare",
    categoryId: "cat-starters",
    name: ["Mol goʻshtidan tartar", "Beef tartare", "Тартар из говядины"],
    description: [
      "Qoʻlda toʻgʻralgan mol goʻshti, kaperslar, tuxum sarigʻi va qizartirilgan tandir noni.",
      "Hand-cut beef, capers, a golden yolk and toasted tandoor bread.",
      "Говядина ручной рубки, каперсы, желток и подсушенный тандырный хлеб.",
    ],
    price: 95_000,
    tags: ["halal"],
    allergens: ["eggs", "gluten", "mustard"],
    calories: 420,
  }),
  item({
    slug: "tandir-samsa",
    categoryId: "cat-starters",
    name: ["Tandir somsa", "Tandoor samsa", "Тандырная самса"],
    description: [
      "Qatlamli xamir ichida mayda toʻgʻralgan goʻsht va piyoz, tandir devorida pishirilgan. Narxi bir dona uchun.",
      "Flaky pastry filled with hand-chopped meat and onion, baked on the tandoor wall. Price per piece.",
      "Слоёное тесто с рубленым мясом и луком, запечённое на стенке тандыра. Цена за штуку.",
    ],
    price: 22_000,
    tags: ["halal"],
    allergens: ["gluten", "eggs", "sesame"],
    calories: 360,
    modifierGroups: [
      pickOne("filling", ["Ichi", "Filling", "Начинка"], [
        opt("lamb", ["Qoʻy goʻshti", "Lamb", "Баранина"], 0, true),
        opt("beef", ["Mol goʻshti", "Beef", "Говядина"]),
        opt("pumpkin", ["Qovoq (goʻshtsiz)", "Pumpkin (meat-free)", "Тыква (без мяса)"]),
      ]),
    ],
  }),
  item({
    slug: "lamb-shurpa",
    categoryId: "cat-starters",
    name: ["Qoʻy goʻshtli shoʻrva", "Lamb shurpa", "Шурпа из баранины"],
    description: [
      "Suyakli qoʻy goʻshtida sekin qaynatilgan shaffof shoʻrva, sabzavotlar va yangi koʻkatlar bilan.",
      "Clear lamb broth slow-simmered on the bone, with vegetables and fresh herbs.",
      "Прозрачный бульон из баранины на кости с овощами и свежей зеленью.",
    ],
    price: 68_000,
    tags: ["halal", "gluten-free"],
    allergens: ["celery"],
    calories: 450,
  }),

  // ── Main dishes
  item({
    slug: "tashkent-plov",
    categoryId: "cat-mains",
    name: ["Toshkent oshi", "Tashkent plov", "Ташкентский плов"],
    description: [
      "Devzira guruchi, sariq sabzi, qoʻy goʻshti, noʻxat va mayiz — qozonda damlangan. Bedana tuxumi bilan.",
      "Devzira rice, yellow carrots, lamb, chickpeas and raisins, slow-steamed in the kazan. With quail eggs.",
      "Рис девзира, жёлтая морковь, баранина, нут и изюм, томлённые в казане. С перепелиными яйцами.",
    ],
    price: 89_000,
    tags: ["halal", "gluten-free"],
    allergens: ["eggs"],
    calories: 880,
    featured: true,
    modifierGroups: [
      upTo(2, "extras", ["Qoʻshimcha", "Extras", "Добавить"], [
        opt("qazi", ["Qazi", "Qazi (horse sausage)", "Казы"], 35_000),
        opt("quail-eggs", ["Yana bedana tuxumi", "More quail eggs", "Ещё перепелиные яйца"], 8_000),
      ]),
    ],
  }),
  item({
    slug: "hand-pulled-lagman",
    categoryId: "cat-mains",
    name: ["Qoʻlda choʻzilgan lagʻmon", "Hand-pulled lagman", "Лагман ручной тяжки"],
    description: [
      "Yangi choʻzilgan ugra, mol goʻshti, bulgʻor qalampiri va uygʻurcha sous.",
      "Fresh hand-pulled noodles tossed with beef, peppers and a Uyghur-style sauce.",
      "Свежая лапша ручной тяжки с говядиной, перцем и уйгурским соусом.",
    ],
    price: 76_000,
    tags: ["halal", "spicy"],
    allergens: ["gluten", "celery"],
    calories: 760,
    modifierGroups: [
      pickOne("style", ["Tayyorlanishi", "Style", "Подача"], [
        opt("fried", ["Qovurma", "Stir-fried", "Жареный"], 0, true),
        opt("broth", ["Shoʻrvali", "In broth", "С бульоном"]),
      ]),
    ],
  }),
  item({
    slug: "lamb-manti",
    categoryId: "cat-mains",
    name: ["Manti", "Manti dumplings", "Манты"],
    description: [
      "Bugʻda pishirilgan yupqa xamirli manti, suzma va qalampirli sariyogʻ bilan.",
      "Delicate steamed dumplings with suzma and chilli butter.",
      "Нежные манты на пару с сузьмой и перечным маслом.",
    ],
    price: 72_000,
    tags: ["halal"],
    allergens: ["gluten", "milk"],
    calories: 690,
    modifierGroups: [
      pickOne("filling", ["Ichi", "Filling", "Начинка"], [
        opt("lamb", ["Qoʻy goʻshti va piyoz", "Lamb and onion", "Баранина с луком"], 0, true),
        opt("pumpkin", ["Qovoq", "Pumpkin", "Тыква"]),
      ]),
    ],
  }),
  item({
    slug: "sea-bass-saffron",
    categoryId: "cat-mains",
    name: ["Zafaronli levrek", "Sea bass with saffron", "Сибас с шафраном"],
    description: [
      "Qarsildoq terili levrek filesi, zafaronli pyure va bahor sabzavotlari.",
      "Crisp-skinned sea bass fillet, saffron purée and spring vegetables.",
      "Филе сибаса с хрустящей корочкой, шафрановое пюре и весенние овощи.",
    ],
    price: 165_000,
    tags: ["gluten-free"],
    allergens: ["fish", "milk"],
    calories: 540,
  }),
  item({
    slug: "beef-dimlama",
    categoryId: "cat-mains",
    name: ["Mol goʻshtli dimlama", "Beef dimlama", "Димлама из говядины"],
    description: [
      "Mol goʻshti va mavsumiy sabzavotlar oʻz sharbatida olti soat damlangan.",
      "Beef and seasonal vegetables slow-braised in their own juices for six hours.",
      "Говядина и сезонные овощи, шесть часов томлённые в собственном соку.",
    ],
    price: 128_000,
    tags: ["halal", "gluten-free"],
    allergens: ["celery"],
    calories: 720,
  }),

  // ── Grill
  item({
    slug: "lamb-shashlik",
    categoryId: "cat-grill",
    name: ["Qoʻy goʻshtidan shashlik", "Lamb shashlik", "Шашлык из баранины"],
    description: [
      "Yumshoq qoʻy goʻshti saksovul koʻmirida, sumaxli piyoz bilan.",
      "Tender lamb over saxaul charcoal, with sumac onions.",
      "Нежная баранина на углях саксаула с луком и сумахом.",
    ],
    price: 79_000,
    tags: ["halal", "gluten-free"],
    allergens: [],
    calories: 640,
    featured: true,
    modifierGroups: [
      pickOne("portion", ["Porsiya", "Portion", "Порция"], [
        opt("2", ["2 six", "2 skewers", "2 шампура"], 0, true),
        opt("4", ["4 six", "4 skewers", "4 шампура"], 76_000),
      ]),
      maybeOne("bread", ["Yoniga", "On the side", "К блюду"], [
        opt("tandir-non", ["Issiq tandir noni", "Warm tandoor bread", "Тёплая тандырная лепёшка"], 8_000),
      ]),
    ],
  }),
  item({
    slug: "lula-kebab",
    categoryId: "cat-grill",
    name: ["Lula kabob", "Lula kebab", "Люля-кебаб"],
    description: [
      "Qoʻlda qiyma qilingan mol va qoʻy goʻshti, zira va kashnich bilan.",
      "Hand-minced beef and lamb with cumin and coriander, grilled on flat skewers.",
      "Рубленая говядина и баранина с зирой и кориандром на плоских шампурах.",
    ],
    price: 62_000,
    tags: ["halal", "gluten-free"],
    allergens: [],
    calories: 560,
  }),
  item({
    slug: "saffron-chicken-shashlik",
    categoryId: "cat-grill",
    name: ["Zafaronli tovuq shashlik", "Saffron chicken shashlik", "Шашлык из курицы с шафраном"],
    description: [
      "Qatiq va zafaronda marinadlangan tovuq soni.",
      "Chicken thigh marinated in yogurt and saffron.",
      "Куриное бедро в маринаде из йогурта и шафрана.",
    ],
    price: 58_000,
    tags: ["halal", "gluten-free"],
    allergens: ["milk"],
    calories: 480,
  }),
  item({
    slug: "ribeye-steak",
    categoryId: "cat-grill",
    name: ["Ribai steyk", "Dry-aged ribeye", "Рибай сухого вызревания"],
    description: [
      "300 g quruq yetiltirilgan ribai, koʻkatli sariyogʻ bilan.",
      "300 g dry-aged ribeye, rested and sliced, with herb butter.",
      "300 г рибая сухого вызревания с маслом с травами.",
    ],
    price: 295_000,
    tags: ["halal", "gluten-free"],
    allergens: ["milk"],
    calories: 980,
    featured: true,
    modifierGroups: [
      pickOne("doneness", ["Pishirish darajasi", "How would you like it cooked?", "Степень прожарки"], [
        opt("rare", ["Kam pishgan", "Rare", "С кровью"]),
        opt("medium-rare", ["Oʻrtachadan kam", "Medium rare", "Слабая прожарка"]),
        opt("medium", ["Oʻrtacha", "Medium", "Средняя прожарка"]),
        opt("medium-well", ["Oʻrtachadan koʻp", "Medium well", "Почти полная прожарка"]),
        opt("well-done", ["Toʻliq pishgan", "Well done", "Полная прожарка"]),
      ]),
    ],
  }),
  item({
    slug: "grilled-vegetables",
    categoryId: "cat-grill",
    name: ["Grilda pishgan sabzavotlar", "Charred vegetables", "Овощи на гриле"],
    description: [
      "Baqlajon, qalampir, qovoqcha va pomidor — tahini va anor bilan.",
      "Aubergine, peppers, courgette and tomatoes with tahini and pomegranate.",
      "Баклажан, перец, цукини и томаты с тахини и гранатом.",
    ],
    price: 48_000,
    tags: ["vegan", "gluten-free"],
    allergens: ["sesame"],
    calories: 310,
  }),

  // ── Desserts
  item({
    slug: "napoleon",
    categoryId: "cat-desserts",
    name: ["Napoleon", "Napoleon cake", "Торт «Наполеон»"],
    description: [
      "Yupqa qatlamli xamir va vanilli qaymoq — oilaviy retsept.",
      "Paper-thin pastry layers and vanilla custard cream, a family recipe.",
      "Тончайшие коржи и ванильный заварной крем по семейному рецепту.",
    ],
    price: 42_000,
    tags: ["vegetarian"],
    allergens: ["gluten", "milk", "eggs"],
    calories: 520,
  }),
  item({
    slug: "honey-cake",
    categoryId: "cat-desserts",
    name: ["Asal torti", "Honey cake", "Медовик"],
    description: [
      "Asalli yupqa qatlamlar va yengil smetanali krem.",
      "Thin honey sponge layers with a light sour-cream frosting.",
      "Тонкие медовые коржи с лёгким сметанным кремом.",
    ],
    price: 45_000,
    tags: ["vegetarian"],
    allergens: ["gluten", "milk", "eggs"],
    calories: 480,
  }),
  item({
    slug: "chocolate-fondant",
    categoryId: "cat-desserts",
    name: ["Shokoladli fondan", "Chocolate fondant", "Шоколадный фондан"],
    description: [
      "Ichi suyuq issiq shokoladli fondan, vanilli muzqaymoq va karamel bilan.",
      "Warm chocolate fondant with a molten centre, vanilla ice cream and caramel.",
      "Тёплый фондан с жидкой серединой, ванильным мороженым и карамелью.",
    ],
    price: 58_000,
    tags: ["vegetarian"],
    allergens: ["gluten", "milk", "eggs"],
    calories: 610,
  }),
  item({
    slug: "walnut-halva",
    categoryId: "cat-desserts",
    name: ["Yongʻoqli holva", "Walnut & date halva", "Халва с орехами и финиками"],
    description: [
      "Xurmo, yongʻoq va bodom — qoʻlda tayyorlangan, shakar qoʻshilmagan.",
      "Dates, walnuts and almonds, pressed by hand. No added sugar.",
      "Финики, грецкие орехи и миндаль ручной работы. Без добавленного сахара.",
    ],
    price: 38_000,
    tags: ["vegan", "gluten-free"],
    allergens: ["tree-nuts"],
    calories: 340,
  }),
  item({
    slug: "creamy-ice-cream",
    categoryId: "cat-desserts",
    name: ["Qaymoqli muzqaymoq", "Cream ice cream", "Сливочное мороженое"],
    description: [
      "Ikki shar: vanilli va shokoladli.",
      "Two scoops: vanilla and dark chocolate.",
      "Два шарика: ванильный и шоколадный.",
    ],
    price: 34_000,
    tags: ["vegetarian", "gluten-free"],
    allergens: ["milk"],
    calories: 290,
  }),

  // ── Drinks
  item({
    slug: "green-tea",
    categoryId: "cat-drinks",
    name: ["Koʻk choy", "Green tea", "Зелёный чай"],
    description: [
      "Choynakda damlangan barg choy, limon va yalpiz bilan.",
      "A pot of loose-leaf green tea with lemon and mint.",
      "Чайник зелёного листового чая с лимоном и мятой.",
    ],
    price: 24_000,
    tags: ["vegan", "gluten-free"],
    allergens: [],
    calories: 5,
    modifierGroups: [
      pickOne("pot", ["Choynak", "Teapot", "Чайник"], [
        opt("small", ["Kichik (2 kishi)", "Small (for 2)", "Маленький (на двоих)"], 0, true),
        opt("large", ["Katta (4 kishi)", "Large (for 4)", "Большой (на четверых)"], 16_000),
      ]),
    ],
  }),
  item({
    slug: "blooming-herbal-tea",
    categoryId: "cat-drinks",
    name: ["Togʻ oʻtlari choyi", "Mountain herbal tea", "Травяной чай с гор"],
    description: [
      "Chimyon togʻ oʻtlari, naʼmatak va bir qoshiq asal.",
      "Herbs from the Chimgan mountains, rosehip and a spoon of honey.",
      "Травы с гор Чимгана, шиповник и ложка мёда.",
    ],
    price: 32_000,
    tags: ["vegetarian", "gluten-free"],
    allergens: [],
    calories: 40,
  }),
  item({
    slug: "cappuccino",
    categoryId: "cat-drinks",
    name: ["Kapuchino", "Cappuccino", "Капучино"],
    description: [
      "Ikki shot espresso va baxmal sut koʻpigi.",
      "Double espresso with velvety milk foam.",
      "Двойной эспрессо с бархатной молочной пенкой.",
    ],
    price: 32_000,
    tags: ["vegetarian", "gluten-free"],
    allergens: ["milk"],
    calories: 120,
    modifierGroups: [
      pickOne("milk", ["Sut", "Milk", "Молоко"], [
        opt("whole", ["Oddiy sut", "Whole milk", "Обычное молоко"], 0, true),
        opt("oat", ["Suli suti", "Oat milk", "Овсяное молоко"], 8_000),
        opt("almond", ["Bodom suti", "Almond milk", "Миндальное молоко"], 8_000),
      ]),
    ],
  }),
  item({
    slug: "pomegranate-lemonade",
    categoryId: "cat-drinks",
    name: ["Anorli limonad", "Pomegranate lemonade", "Гранатовый лимонад"],
    description: [
      "Yangi siqilgan anor sharbati, rozmarin va gazli suv.",
      "Fresh pomegranate juice, rosemary and sparkling water.",
      "Свежевыжатый гранатовый сок, розмарин и газированная вода.",
    ],
    price: 36_000,
    tags: ["vegan", "gluten-free"],
    allergens: [],
    calories: 140,
    modifierGroups: [drinkSize(68_000)],
  }),
  item({
    slug: "lemon-mint-lemonade",
    categoryId: "cat-drinks",
    name: ["Limon va yalpizli limonad", "Lemon & mint lemonade", "Лимонад с лимоном и мятой"],
    description: [
      "Limon, yangi yalpiz va asal, gazli suv bilan.",
      "Lemon, fresh mint and honey with sparkling water.",
      "Лимон, свежая мята и мёд с газированной водой.",
    ],
    price: 32_000,
    tags: ["vegetarian", "gluten-free"],
    allergens: [],
    calories: 110,
    modifierGroups: [drinkSize(60_000)],
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
  suggest("tashkent-plov", "achichuk"),
  suggest("tashkent-plov", "green-tea"),
  suggest("lamb-shashlik", "achichuk"),
  suggest("lamb-shashlik", "pomegranate-lemonade"),
  suggest("lula-kebab", "grilled-vegetables"),
  suggest("saffron-chicken-shashlik", "lemon-mint-lemonade"),
  suggest("ribeye-steak", "grilled-vegetables"),
  suggest("sea-bass-saffron", "burrata-tomatoes"),
  suggest("hand-pulled-lagman", "tandir-samsa"),
  suggest("lamb-manti", "green-tea"),
  suggest("beef-dimlama", "achichuk"),
  suggest("beef-tartare", "pomegranate-lemonade"),
  suggest("napoleon", "cappuccino"),
  suggest("honey-cake", "green-tea"),
  suggest("chocolate-fondant", "cappuccino"),
  suggest("walnut-halva", "blooming-herbal-tea"),
  suggest("creamy-ice-cream", "cappuccino"),
  {
    id: "combo-tashkent-table",
    kind: "combo",
    name: "Toshkent dasturxoni",
    translations: translations({ name: ["Toshkent dasturxoni", "Tashkent table", "Ташкентский стол"] }),
    itemIds: ["item-tashkent-plov", "item-achichuk", "item-green-tea"],
    discount: 15_000,
  },
  {
    id: "combo-shashlik-night",
    kind: "combo",
    name: "Kabob kechasi",
    translations: translations({ name: ["Kabob kechasi", "Shashlik night", "Вечер шашлыка"] }),
    itemIds: ["item-lamb-shashlik", "item-achichuk", "item-pomegranate-lemonade"],
    discount: 12_000,
  },
];

export const seedMenu: Menu = { categories, items, upsells };
