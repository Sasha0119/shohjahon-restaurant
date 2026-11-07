import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { closeContexts, guestPage, staffPage, tableLink } from "./helpers";

test.afterEach(async ({ browser }) => closeContexts(browser));

const TABLE = 3; // free when this test runs

/** Fills in the booking form for tomorrow and pays. */
async function bookTomorrow(visitor: Page, name: string, phone: string) {
  await visitor.goto("/reserve");
  const min = await visitor.getByLabel("Date", { exact: true }).getAttribute("min");
  const tomorrow = new Date(`${min}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  await visitor.getByLabel("Date", { exact: true }).fill(tomorrow.toISOString().slice(0, 10));
  await visitor.getByLabel("Your name").fill(name);
  await visitor.getByLabel("Phone number").fill(phone);
  await visitor.getByRole("button", { name: "Add Cappuccino" }).click();
  await expect(visitor.getByText("Pay now (50%)")).toBeVisible();
  await visitor.getByRole("button", { name: /^Pay .* and reserve$/ }).click();
  await expect(visitor.getByRole("heading", { name: "Your table is reserved" })).toBeVisible();
}

test("a booking needs a dish, tells the kitchen at once, and can be cancelled for a refund", async ({
  browser,
}, info) => {
  const errors: string[] = [];
  const { page: kitchen } = await staffPage(browser, "kitchen", errors, { viewport: { width: 1440, height: 900 } });
  await kitchen.goto("/kitchen");
  await expect(kitchen.getByRole("heading", { name: "Bookings" })).toBeHidden();

  const { page: visitor } = await guestPage(browser, errors);
  await visitor.goto("/reserve");
  await visitor.getByLabel("Your name").fill("Nodira Azimova");
  await visitor.getByLabel("Phone number").fill("+998 90 555 11 22");
  await visitor.getByRole("button", { name: "Reserve", exact: true }).click();
  await expect(visitor.getByText(/at least one dish/)).toBeVisible();
  await visitor.screenshot({ path: info.outputPath("no-dish.png"), fullPage: true });

  await bookTomorrow(visitor, "Nodira Azimova", "+998 90 555 11 22");
  await visitor.screenshot({ path: info.outputPath("booked.png"), fullPage: true });

  // The kitchen hears about it straight away, without the guest's details.
  await expect(kitchen.getByRole("heading", { name: "Bookings" })).toBeVisible();
  await expect(kitchen.getByText("1× Cappuccino")).toBeVisible();
  await expect(kitchen.getByText("Nodira")).toBeHidden();
  await kitchen.screenshot({ path: info.outputPath("kitchen.png") });

  // The guest's private link shows the booking and what they'd get back: 40%, a day ahead.
  await visitor.getByRole("link", { name: "View or cancel this booking" }).click();
  await expect(visitor.getByText(/If you cancel now you get .* back/)).toBeVisible();
  await visitor.screenshot({ path: info.outputPath("manage.png"), fullPage: true });
  await visitor.getByRole("button", { name: "Cancel booking" }).click();
  await visitor.getByRole("button", { name: "Yes, cancel my booking" }).click();
  await expect(visitor.getByText(/Cancelled\. Refund:/)).toBeVisible();

  // And it leaves the kitchen's screen.
  await expect(kitchen.getByRole("heading", { name: "Bookings" })).toBeHidden();

  expect(errors).toEqual([]);
});

test("when the guest arrives, the waiter opens the table with their dishes and deposit", async ({ browser }) => {
  const errors: string[] = [];
  const name = "Jasur Tursunov";
  const { page: visitor } = await guestPage(browser, errors);
  await bookTomorrow(visitor, name, "+998 90 555 33 44");

  // Move it to 20 minutes from now, on a table nobody is using.
  const db = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL });
  await db.connect();
  await db.query(
    `UPDATE reservations SET starts_at = $1::timestamptz AT TIME ZONE 'UTC',
       table_id = (SELECT id FROM dining_tables WHERE number = $2)
     WHERE guest_name = $3`,
    [new Date(Date.now() + 20 * 60_000).toISOString(), TABLE, name],
  );
  await db.end();

  const { page: waiter } = await staffPage(browser, "waiter", errors, { viewport: { width: 1440, height: 900 } });
  await waiter.goto("/waiter");
  await waiter.getByRole("listitem").filter({ hasText: name }).getByRole("button", { name: "Guest arrived" }).click();
  await expect(waiter.getByText(name)).toBeHidden();

  // The guest scans the table's QR: no PIN, and the dish is already on the order.
  const link = await tableLink(browser, TABLE);
  const { page: guest } = await guestPage(browser, errors);
  await guest.goto(`${link}/bill`);
  await expect(guest.getByLabel(/6-digit table PIN/)).toBeHidden();
  await expect(guest.getByText(/Cappuccino/).first()).toBeVisible();

  // Leave the kitchen board and the table empty for the next test.
  const open =
    "SELECT s.id FROM table_sessions s JOIN dining_tables t ON t.id = s.table_id WHERE t.number = $1 AND s.status = 'OPEN'";
  const cleanup = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL });
  await cleanup.connect();
  await cleanup.query(`UPDATE orders SET status = 'SERVED' WHERE session_id IN (${open})`, [TABLE]);
  await cleanup.query(`UPDATE table_sessions SET status = 'CLOSED' WHERE id IN (${open})`, [TABLE]);
  await cleanup.end();

  expect(errors).toEqual([]);
});
