import { expect, test } from "@playwright/test";
import { addToCart, guestPage, staffPage, tableLink, closeContexts } from "./helpers";

test.afterEach(async ({ browser }) => closeContexts(browser));

/**
 * The main promise of the app, end to end:
 * scan → order → kitchen cooks (live) → call a server → pay by card → rate.
 */
test("a guest orders, the kitchen and waiter react live, the guest pays and rates", async ({ browser }) => {
  const errors: string[] = [];
  const link = await tableLink(browser, 4);
  const { page: kds } = await staffPage(browser, "kitchen", errors);
  const { page: waiter } = await staffPage(browser, "waiter", errors, { viewport: { width: 390, height: 844 } });
  const { page: guest } = await guestPage(browser, errors);

  await kds.goto("/kitchen");
  await expect(kds.getByText("All clear")).toBeVisible();
  await waiter.goto("/waiter");
  await expect(waiter.getByText("No one is waiting")).toBeVisible();

  // Order a burger (kitchen) and a flat white (bar).
  await guest.goto(`${link}/menu`);
  await expect(guest.getByRole("heading", { name: "Starters" })).toBeVisible();
  await addToCart(guest, "Double Smash Burger");
  await addToCart(guest, "Flat White");
  await guest.goto(`${link}/cart`);
  await guest.getByRole("button", { name: /Send to kitchen/ }).click();
  await expect(guest.getByText("Round 1")).toBeVisible();

  // Both tickets reach the kitchen display without a refresh.
  const card = (dish: string) => kds.locator("article", { hasText: dish });
  await expect(card("Double Smash Burger")).toBeVisible();
  await expect(card("Flat White")).toBeVisible();
  const round = guest.locator("article header", { hasText: "Round 1" });

  for (const dish of ["Double Smash Burger", "Flat White"]) await card(dish).getByRole("button", { name: "Start" }).click();
  await expect(round.getByText("Preparing", { exact: true })).toBeVisible();

  // Call server → the waiter sees it live and handles it.
  await guest.getByRole("button", { name: "Call" }).click();
  await guest.getByRole("button", { name: /Water refill/ }).click();
  await expect(guest.getByText("On the way").first()).toBeVisible();
  await expect(waiter.getByText("Water refill")).toBeVisible();
  await guest.keyboard.press("Escape");
  await waiter.getByRole("button", { name: /Done: Table 4/ }).click();
  await expect(waiter.getByText("No one is waiting")).toBeVisible();

  for (const dish of ["Double Smash Burger", "Flat White"]) await card(dish).getByRole("button", { name: "Ready", exact: true }).click();
  await expect(round.getByText("Ready", { exact: true })).toBeVisible();
  for (const dish of ["Double Smash Burger", "Flat White"]) await card(dish).getByRole("button", { name: "Served", exact: true }).click();
  await expect(round.getByText("Served", { exact: true })).toBeVisible();
  await expect(kds.getByText("All clear")).toBeVisible();

  // Pay the full bill by (mock) card, no tip.
  await guest.goto(`${link}/bill`);
  await expect(guest.getByText("Your order")).toBeVisible();
  await guest.getByRole("radio", { name: "No tip" }).click();
  await guest.getByRole("button", { name: /^Pay \$/ }).click();
  await expect(guest.getByText("Thanks for visiting!")).toBeVisible();

  // 5 stars → offered the public review link.
  await guest.getByRole("radio", { name: /5 stars/ }).click();
  await guest.getByRole("button", { name: "Send", exact: true }).click();
  await expect(guest.getByRole("link", { name: /Leave a public review/ })).toBeVisible();

  expect(errors).toEqual([]);
});

test("an unhappy rating goes to the manager's private feedback log, not to public links", async ({ browser }) => {
  const errors: string[] = [];
  const link = await tableLink(browser, 5);
  const { page: mgr } = await staffPage(browser, "manager", errors);
  const { page: guest } = await guestPage(browser, errors);

  await guest.goto(`${link}/menu`);
  await addToCart(guest, "Truffle Parmesan Fries");
  await guest.goto(`${link}/cart`);
  await guest.getByRole("button", { name: /Send to kitchen/ }).click();
  await expect(guest.getByText("Round 1")).toBeVisible();
  await guest.goto(`${link}/bill`);
  await guest.getByRole("radio", { name: "No tip" }).click();
  await guest.getByRole("button", { name: /^Pay \$/ }).click();
  await expect(guest.getByText("Thanks for visiting!")).toBeVisible();

  await mgr.goto("/admin/feedback");
  await guest.getByRole("radio", { name: /2 stars/ }).click();
  await guest.getByLabel(/What could we do better/).fill("E2E: fries were cold");
  await guest.getByRole("button", { name: "Send", exact: true }).click();
  await expect(guest.getByText("the manager reads every message")).toBeVisible();
  await expect(guest.getByRole("link", { name: /Leave a public review/ })).toHaveCount(0);
  await expect(mgr.getByText("E2E: fries were cold")).toBeVisible(); // arrives live

  expect(errors).toEqual([]);
});
