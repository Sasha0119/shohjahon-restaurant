import { brand, type LocaleCode } from "@app/config";

/*
 * Language selection shared by the server (app/layout.tsx reads the cookie so
 * the first paint is already in the right language) and the client provider.
 */

/** Cookie that remembers each guest's (and staff member's) language on this device. */
export const LANGUAGE_COOKIE = "lang";

/** A cookie value → a language this brand offers (anything else → the default). */
export function pickLocale(value: string | undefined | null): LocaleCode {
  return value && (brand.languages as string[]).includes(value) ? (value as LocaleCode) : brand.defaultLanguage;
}
