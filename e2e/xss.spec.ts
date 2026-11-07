import { expect, test } from "@playwright/test";
import { closeContexts, guestPage, tableLink } from "./helpers";

test.afterEach(async ({ browser }) => closeContexts(browser));

test("a nickname containing HTML is shown as plain text", async ({ browser }) => {
  const errors: string[] = [];
  const nickname = "<img src=x onerror=a()>";
  const link = await tableLink(browser, 10);
  const { page } = await guestPage(browser, errors);
  await page.goto(link);

  await page.locator("#nickname").fill(nickname);
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText(nickname)).toBeVisible();
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
});
