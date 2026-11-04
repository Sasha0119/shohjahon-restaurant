import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

/** Saved staff sessions (written by auth.setup.ts). */
export const AUTH = {
  manager: "e2e/.auth/manager.json",
  kitchen: "e2e/.auth/kitchen.json",
  waiter: "e2e/.auth/waiter.json",
} as const;

export const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } as const;

/**
 * The app defaults to Uzbek; these tests read English labels, so every
 * browser context gets the language cookie the switcher would set.
 */
export async function useEnglish(ctx: BrowserContext) {
  await ctx.addCookies([{ name: "lang", value: "en", url: process.env.E2E_BASE_URL ?? "http://localhost:3300" }]);
}

/** Fail the test on any uncaught page error or CSP violation. */
export function watchForErrors(page: Page, errors: string[]) {
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy|Refused to/.test(m.text())) errors.push(`csp: ${m.text()}`);
  });
}

export async function staffPage(browser: Browser, role: keyof typeof AUTH, errors: string[], opts = {}): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ storageState: AUTH[role], ...opts });
  await useEnglish(ctx);
  const page = await ctx.newPage();
  watchForErrors(page, errors);
  return { ctx, page };
}

export async function guestPage(browser: Browser, errors: string[]): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext(PHONE);
  await useEnglish(ctx);
  const page = await ctx.newPage();
  watchForErrors(page, errors);
  return { ctx, page };
}

/** The signed QR link of a table, read through the manager's API session. */
export async function tableLink(browser: Browser, number: number): Promise<string> {
  const ctx = await browser.newContext({ storageState: AUTH.manager });
  const res = await ctx.request.get("/api/admin/tables");
  expect(res.ok()).toBe(true);
  const { tables } = (await res.json()) as { tables: { number: number; url: string }[] };
  await ctx.close();
  const t = tables.find((x) => x.number === number);
  if (!t) throw new Error(`No table ${number}`);
  // Seeded links point at PUBLIC_WEB_URL; keep only the path so baseURL applies.
  return new URL(t.url).pathname;
}

export async function addToCart(page: Page, dish: string) {
  await page.getByRole("button", { name: `Add ${dish} to cart` }).click();
  await expect(page.getByText("Added to cart").first()).toBeVisible();
}

/** Close every context a test opened (staff screens, extra phones) so sockets don't pile up. */
export async function closeContexts(browser: Browser) {
  await Promise.all(browser.contexts().map((c) => c.close().catch(() => {})));
}
