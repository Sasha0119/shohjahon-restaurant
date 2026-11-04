import { expect, test } from "@playwright/test";
import { addToCart, guestPage, staffPage, tableLink, closeContexts } from "./helpers";

test.afterEach(async ({ browser }) => closeContexts(browser));

test("two phones share one cart, split the bill, and the waiter confirms cash", async ({ browser }) => {
  const errors: string[] = [];
  const link = await tableLink(browser, 6);
  const { page: waiter } = await staffPage(browser, "waiter", errors, { viewport: { width: 390, height: 844 } });
  const { page: a } = await guestPage(browser, errors);
  const { page: b } = await guestPage(browser, errors);
  await waiter.goto("/waiter");

  await a.goto(`${link}/menu`);
  await addToCart(a, "Tashkent plov");

  // The second phone joins the same table and sees the shared cart.
  await b.goto(`${link}/menu`);
  await b.getByRole("button", { name: "Join this table" }).click();
  await expect(b.getByRole("link", { name: /View cart: 1 item/ })).toBeVisible();
  await addToCart(b, "Cappuccino");
  await expect(a.getByRole("link", { name: /View cart: 2 items/ })).toBeVisible(); // live

  await a.goto(`${link}/cart`);
  await a.getByRole("button", { name: /Send to kitchen/ }).click();
  await expect(a.getByText("Round 1")).toBeVisible();

  // A declined card never charges anything (the mock provider declines amounts ending in 13).
  await a.goto(`${link}/bill`);
  await a.getByRole("radio", { name: "Custom" }).first().click();
  await a.getByLabel("Amount to pay").fill("1013");
  await a.getByRole("radio", { name: "No tip" }).click();
  await a.getByRole("button", { name: /^Pay 1\D?013/ }).click();
  await expect(a.getByText("Payment declined")).toBeVisible();
  await a.getByRole("button", { name: "Back to the bill" }).click();

  // B pays a share by card; A sees it live.
  await b.goto(`${link}/bill`);
  await b.getByRole("radio", { name: "Custom" }).first().click();
  await b.getByLabel("Amount to pay").fill("5000");
  await b.getByRole("radio", { name: "No tip" }).click();
  await b.getByRole("button", { name: /^Pay 5\D?000/ }).click();
  await expect(b.getByRole("heading", { name: "Payment complete" })).toBeVisible();
  await expect(a.getByText("Paid so far")).toBeVisible();

  // A pays the rest in cash → the waiter confirms → the table closes for everyone.
  await a.getByRole("radio", { name: "Full bill" }).click();
  await a.getByRole("radio", { name: "Cash" }).click();
  await a.getByRole("button", { name: /^Pay \d/ }).click();
  await expect(a.getByText("A server is on the way").first()).toBeVisible();
  await expect(waiter.getByText("Paying cash")).toBeVisible();
  await waiter.getByRole("button", { name: /Cash received: Table 6/ }).click();
  await expect(a.getByText("Thanks for visiting!")).toBeVisible();
  await expect(b.getByText("Thanks for visiting!")).toBeVisible();

  await a.getByRole("link", { name: "View your receipt" }).click();
  await expect(a.getByText("Receipt #")).toBeVisible();

  expect(errors).toEqual([]);
});
