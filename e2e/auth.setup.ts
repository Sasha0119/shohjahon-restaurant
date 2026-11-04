import { expect, test as setup } from "@playwright/test";
import { AUTH, PHONE, tableLink, useEnglish } from "./helpers";
import { E2E_MANAGER, E2E_STAFF } from "./playwright.config";

/* Sign each staff role in once and save the session (keeps login rate limits out of the way). */
setup.beforeEach(async ({ context }) => useEnglish(context));

setup("manager signs in with email + password", async ({ page }) => {
  await page.goto("/staff/manager");
  await page.getByLabel("Email").fill(E2E_MANAGER.email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_MANAGER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin\/overview/);
  await page.context().storageState({ path: AUTH.manager });
});

for (const role of ["kitchen", "waiter"] as const) {
  setup(`${role} signs in with a PIN`, async ({ page }) => {
    const { name, pin } = E2E_STAFF[role];
    await page.goto("/staff");
    await page.getByRole("button", { name: new RegExp(name) }).click();
    await page.getByRole("button", { name: "Delete last digit" }).waitFor();
    await page.waitForTimeout(300); // keypad listens once mounted
    await page.keyboard.type(pin);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/${role}`));
    await page.context().storageState({ path: AUTH[role] });
  });
}

/*
 * Warm-up: a fresh production server renders its first guest page slowly
 * (server bundles, fonts) and optimises each menu photo on first request.
 * On HTTP/1.1 a phone opens only 6 connections, so cold photo requests would
 * queue the guest's own API calls behind them. Pay that cost once here, on a
 * spare table and the same phone screen size the tests use, so the timed tests
 * measure the app rather than a cold cache. (Production serves HTTP/2 and keeps
 * optimised photos cached, so real guests don't queue like this.)
 */
setup("warm up the guest pages and menu photos", async ({ browser }) => {
  setup.setTimeout(180_000);
  const link = await tableLink(browser, 12);
  const ctx = await browser.newContext(PHONE);
  await useEnglish(ctx);
  const page = await ctx.newPage();
  await page.goto(`${link}/menu`);
  await expect(page.getByRole("heading", { name: "Starters" })).toBeVisible({ timeout: 90_000 });
  // Scroll through the whole menu so every photo is requested (they load lazily).
  for (let i = 0; i < 40; i++) {
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(150);
  }
  await page.waitForLoadState("networkidle", { timeout: 90_000 });
  await ctx.close();
});
