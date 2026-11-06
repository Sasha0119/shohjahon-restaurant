"use client";

import { ApiClientError } from "@/lib/api";
import type { MessageKey, Vars } from "./translate";

type T = (key: MessageKey, vars?: Vars) => string;

/**
 * Turns any error into a sentence in the current language. Server errors are
 * translated by their code (errors.codes.* in the language files); the
 * server's own English message is never shown to guests or staff.
 */
export function translateError(e: unknown, t: T, fallback: MessageKey = "errors.generic"): string {
  if (e instanceof ApiClientError) {
    if (e.code === "NETWORK") return t("errors.offline");
    const key = `errors.codes.${e.code}` as MessageKey;
    const text = t(key);
    if (text !== key) return text;
  }
  return t(fallback);
}
