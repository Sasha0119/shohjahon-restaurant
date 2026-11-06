import type { LocaleCode } from "@app/config";

/**
 * The gallery's dishes. Written out rather than read from the live menu, so the
 * page still shows them while the API is waking up. Names match the seed menu,
 * and test/signature-dishes.test.ts fails if they drift apart.
 */
export const SIGNATURE_DISHES: { slug: string; name: Record<LocaleCode, string> }[] = [
  { slug: "tashkent-plov", name: { uz: "Toshkent oshi", en: "Tashkent plov", ru: "Ташкентский плов" } },
  { slug: "lamb-shashlik", name: { uz: "Qoʻy goʻshtidan shashlik", en: "Lamb shashlik", ru: "Шашлык из баранины" } },
  { slug: "hand-pulled-lagman", name: { uz: "Qoʻlda choʻzilgan lagʻmon", en: "Hand-pulled lagman", ru: "Лагман ручной тяжки" } },
  { slug: "tandir-samsa", name: { uz: "Tandir somsa", en: "Tandoor samsa", ru: "Тандырная самса" } },
  { slug: "napoleon", name: { uz: "Napoleon", en: "Napoleon cake", ru: "Торт «Наполеон»" } },
];
