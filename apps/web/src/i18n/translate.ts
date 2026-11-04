import type { en } from "./en";

export type PluralForms = { other: string } & Partial<Record<Intl.LDMLPluralRule, string>>;

/**
 * The shape every language file must match: the same keys as English, with any
 * plain string allowed, and plural objects free to use the forms their language
 * needs (Russian uses one / few / many / other, Uzbek only one / other).
 */
type Shape<T> = {
  [K in keyof T]: T[K] extends string ? string : T[K] extends { other: string } ? PluralForms : Shape<T[K]>;
};
export type Messages = Shape<typeof en>;

/** Every valid key, e.g. "menu.title" or "cart.items" (plural objects count as leaves). */
type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : T[K] extends PluralForms
      ? `${P}${K}`
      : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<Messages>;
export type Vars = Record<string, string | number>;

function lookup(messages: unknown, key: string): unknown {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in node) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return node;
}

/** Fill {placeholders}. Unknown placeholders are left visible so they get noticed. */
export function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/**
 * Translate `key` using `messages`, falling back to `fallback` (English), then
 * to the key itself so a missing string never crashes the UI.
 */
export function translate(
  locale: string,
  messages: unknown,
  fallback: unknown,
  key: string,
  vars?: Vars,
): string {
  const value = lookup(messages, key) ?? lookup(fallback, key);
  if (typeof value === "string") return interpolate(value, vars);
  if (value && typeof value === "object" && "other" in value) {
    const forms = value as PluralForms;
    const count = Number(vars?.count ?? 0);
    const rule = new Intl.PluralRules(locale).select(count);
    return interpolate(forms[rule] ?? forms.other, vars);
  }
  return key;
}
