import { expect, test } from "@playwright/test";
import { E2E_STAFF } from "./playwright.config";
import { staffPage, tableLink, closeContexts, useEnglish } from "./helpers";

test.beforeEach(async ({ context }) => useEnglish(context));
test.afterEach(async ({ browser }) => closeContexts(browser));

test("staff screens are role-gated in the browser and on the API", async ({ browser, page }) => {
  const errors: string[] = [];

  // Signed out → sent to the sign-in screen.
  await page.goto("/admin/overview");
  await expect(page).toHaveURL(/\/staff\/manager/);
  expect((await page.request.get("/api/admin/analytics")).status()).toBe(401);

  // A waiter can't open the admin area, and the API refuses too.
  const { page: waiter } = await staffPage(browser, "waiter", errors);
  await waiter.goto("/admin/overview");
  await expect(waiter).toHaveURL(/\/staff$|\/waiter/);
  expect((await waiter.request.get("/api/admin/orders")).status()).toBe(403);
  expect((await waiter.request.get("/api/admin/orders/export.csv")).status()).toBe(403);

  // The kitchen can't read the waiter's calls.
  const { page: kitchen } = await staffPage(browser, "kitchen", errors);
  expect((await kitchen.request.get("/api/admin/audit")).status()).toBe(403);
  expect(errors).toEqual([]);
});

test("a wrong PIN is refused without revealing anything", async ({ page }) => {
  await page.goto("/staff");
  await page.getByRole("button", { name: new RegExp(E2E_STAFF.waiter.name) }).click();
  await page.getByRole("button", { name: "Delete last digit" }).waitFor();
  await page.waitForTimeout(300);
  await page.keyboard.type("9999");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: /PIN|try again/i })).toBeVisible();
  await expect(page).toHaveURL(/\/staff/);
});

test("a tampered table link is rejected", async ({ browser, page }) => {
  const link = await tableLink(browser, 7);
  await page.goto(`${link.slice(0, -3)}xyz/menu`);
  await expect(page.getByText(/isn't valid|not valid|scan the QR/i).first()).toBeVisible();
});

test("the manager lands on the dashboard and can export orders", async ({ browser }) => {
  const errors: string[] = [];
  const { page } = await staffPage(browser, "manager", errors, { acceptDownloads: true });
  await page.goto("/admin/overview");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByText("Sales per day")).toBeVisible();
  await page.goto("/admin/orders");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Export CSV" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^orders_\d{4}-\d{2}-\d{2}_to_\d{4}-\d{2}-\d{2}\.csv$/);
  await page.goto("/admin/audit");
  await expect(page.getByText(/Staff · login/).first()).toBeVisible();
  expect(errors).toEqual([]);
});
