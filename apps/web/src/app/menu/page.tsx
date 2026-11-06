import type { Metadata } from "next";
import { cookies } from "next/headers";
import { en } from "@/i18n/en";
import { pickLocale, LANGUAGE_COOKIE } from "@/i18n/locale";
import { ru } from "@/i18n/ru";
import { uz } from "@/i18n/uz";
import { PublicMenu } from "./public-menu";

const dictionaries = { uz, en, ru };

export async function generateMetadata(): Promise<Metadata> {
  const locale = pickLocale((await cookies()).get(LANGUAGE_COOKIE)?.value);
  return { title: dictionaries[locale].menu.title };
}

/** /menu: the menu for visitors without a table. Ordering stays under /table/<token>. */
export default function MenuPage() {
  return <PublicMenu />;
}
