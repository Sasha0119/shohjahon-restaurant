import { expect, test as setup } from "@playwright/test";
import { AUTH } from "./helpers";
import { E2E_MANAGER, E2E_STAFF } from "./playwright.config";

/* Sign each staff role in once and save the session (keeps login rate limits out of the way). */

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
