import type { Metadata } from "next";
import { cookies } from "next/headers";
import { en } from "@/i18n/en";
import { LANGUAGE_COOKIE, pickLocale } from "@/i18n/locale";
import { ru } from "@/i18n/ru";
import { uz } from "@/i18n/uz";
import { ReserveForm } from "./reserve-form";

const dictionaries = { uz, en, ru };

export async function generateMetadata(): Promise<Metadata> {
  const locale = pickLocale((await cookies()).get(LANGUAGE_COOKIE)?.value);
  return { title: dictionaries[locale].reserve.title };
}

/** /reserve: book a table online. Staff see it on the waiter and admin screens. */
export default function ReservePage() {
  return <ReserveForm />;
}
