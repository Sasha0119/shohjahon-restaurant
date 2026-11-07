import { expect, test } from "@playwright/test";
import pg from "pg";
import { closeContexts, guestPage, staffPage, tableLink } from "./helpers";

test.afterEach(async ({ browser }) => closeContexts(browser));

const NAME = "Dilshod Karimov";
const TABLE = 11; // free when this test runs

test("an online booking reaches staff live, and warns whoever scans that table's QR", async ({ browser }, info) => {
  const errors: string[] = [];
  const { page: waiter } = await staffPage(browser, "waiter", errors, { viewport: { width: 1440, height: 900 } });
  const { page: manager } = await staffPage(browser, "manager", errors, { viewport: { width: 1440, height: 900 } });
  await waiter.goto("/waiter");
  await expect(waiter.getByRole("heading", { name: "Reservations" })).toBeVisible();

  // A visitor books tomorrow's first time from their phone.
  const { page: visitor } = await guestPage(browser, errors);
  await visitor.goto("/reserve");
  const tomorrow = await visitor
    .getByLabel("Date", { exact: true })
    .getAttribute("min")
    .then((min) => {
      const d = new Date(`${min}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString().slice(0, 10);
    });
  await visitor.getByLabel("Date", { exact: true }).fill(tomorrow);
  await visitor.getByLabel("Your name").fill(NAME);
  await visitor.getByLabel("Phone number").fill("+998 90 123 45 67");
  await visitor.getByRole("button", { name: "Add Cappuccino" }).click();
  await visitor.getByRole("button", { name: /^Pay .* and reserve$/ }).click();
  await expect(visitor.getByRole("heading", { name: "Your table is reserved" })).toBeVisible();
  await expect(visitor.getByText(/^Table \d+ · /)).toBeVisible();
  await visitor.screenshot({ path: info.outputPath("visitor-booked.png") });

  // It appears on the waiter's open screen without a reload.
  await expect(waiter.getByText(NAME)).toBeVisible();
  await expect(waiter.getByText("+998901234567")).toBeVisible();

  // Move it to about an hour from now on a table nobody is using.
  const db = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL });
  await db.connect();
  const startsAt = new Date(Date.now() + 60 * 60_000);
  await db.query(
    `UPDATE reservations SET starts_at = $1::timestamptz AT TIME ZONE 'UTC',
       table_id = (SELECT id FROM dining_tables WHERE number = $2)
     WHERE guest_name = $3`,
    [startsAt.toISOString(), TABLE, NAME],
  );
  await db.end();
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tashkent",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(startsAt);

  // Waiter and admin both see the table as reserved for that time.
  await waiter.reload();
  await expect(
    waiter.getByRole("button", { name: new RegExp(`^${TABLE}\\b`) }).getByText(`Reserved ${time}`),
  ).toBeVisible();
  await waiter.screenshot({ path: info.outputPath("waiter.png"), fullPage: true });
  await manager.goto("/admin/tables");
  await expect(manager.getByText(NAME)).toBeVisible();
  await expect(
    manager.getByRole("button", { name: new RegExp(`^${TABLE}\\b`) }).getByText(`Reserved ${time}`),
  ).toBeVisible();
  await manager.screenshot({ path: info.outputPath("admin.png"), fullPage: true });

  // Someone scans the QR: the message comes first, and they can carry on if it's theirs.
  const link = await tableLink(browser, TABLE);
  const { page: scanner } = await guestPage(browser, errors);
  await scanner.goto(link);
  await expect(scanner.getByRole("heading", { name: `Table ${TABLE} is reserved` })).toBeVisible();
  await expect(scanner.getByText(`It's reserved for ${time}.`)).toBeVisible();
  await scanner.screenshot({ path: info.outputPath("scan-warning.png") });
  await scanner.getByRole("button", { name: "Continue" }).click();
  await expect(scanner.getByRole("heading", { name: `Table ${TABLE} is reserved` })).toBeHidden();
  await expect(scanner.getByRole("link", { name: /menu/i }).first()).toBeVisible();

  // Staff cancel it, and it leaves the admin screen live. This is the waiter's first tap on the page,
  // which must land even though it also dismisses the sound banner.
  await waiter.getByRole("listitem").filter({ hasText: NAME }).getByRole("button", { name: "Cancel" }).click();
  await waiter.getByRole("button", { name: "Yes, cancel it" }).click();
  await expect(waiter.getByText(NAME)).toBeHidden();
  await expect(manager.getByText(NAME)).toBeHidden();

  expect(errors).toEqual([]);
});
