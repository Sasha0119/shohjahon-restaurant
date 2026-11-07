import { joinPinFor } from "../../src/sessions/join-pin.ts";
/**
 * Integration-test databases.
 *
 * TEST_DATABASE_URL points at any database on a PostgreSQL server the test
 * user may CREATE DATABASE on. Each test file gets its OWN brand-new database
 * (random name), migrated and seeded, and dropped again afterwards. Existing
 * databases are never modified.
 */
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createPrisma, type Db } from "../../src/db.ts";
import { writeMenu } from "../../src/seed-menu.ts";
import { buildSeedPlan } from "../../src/seed-plan.ts";
import { seedMenu as fixtureMenu } from "../../../../packages/shared/test/fixtures/classic-menu.ts";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const apiDir = fileURLToPath(new URL("../..", import.meta.url));

/** Test-only seed credentials (not used anywhere else). */
export const TEST_MANAGER = { email: "test-manager@example.com", password: "test-only-password-123" };
export const TEST_PIN_STAFF = {
  waiter: { id: "staff-demo-waiter", pin: "1234" },
  kitchen: { id: "staff-demo-kitchen", pin: "4321" },
};

/** The PIN a friend needs to join the open visit at this table (shown on the first guest's phone). */
export async function openTablePin(db: Db, tableId: string, qrSecret: string): Promise<string> {
  const open = await db.tableSession.findFirstOrThrow({ where: { tableId, status: "OPEN" }, select: { id: true } });
  return joinPinFor(qrSecret, open.id);
}

function adminUrl(url: string): string {
  const u = new URL(url);
  u.pathname = "/postgres";
  return u.toString();
}

export interface TestDb {
  db: Db;
  url: string;
  cleanup: () => Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL not set");
  const name = `rt_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
  const admin = new pg.Client({ connectionString: adminUrl(TEST_DATABASE_URL) });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}" ENCODING 'UTF8' TEMPLATE template0`);
  await admin.end();

  const u = new URL(TEST_DATABASE_URL);
  u.pathname = `/${name}`;
  const url = u.toString();
  const env = {
    ...process.env,
    DATABASE_URL: url,
    NODE_ENV: "test",
    SEED_DEMO_STAFF: "true",
    SEED_MANAGER_EMAIL: TEST_MANAGER.email,
    SEED_MANAGER_PASSWORD: TEST_MANAGER.password,
  };
  execSync("npx prisma migrate deploy", { cwd: apiDir, env, stdio: "pipe" });
  execSync("npx tsx prisma/seed.ts", { cwd: apiDir, env, stdio: "pipe" });

  const db = createPrisma(url);
  // The tests are written against a fixed fixture menu, not the demo menu (which
  // changes with the brand): swap it in, keeping the seeded tables and staff.
  await db.$transaction([db.menuItem.deleteMany(), db.comboDeal.deleteMany(), db.category.deleteMany()]);
  await writeMenu(db, buildSeedPlan(fixtureMenu));
  return {
    db,
    url,
    cleanup: async () => {
      await db.$disconnect();
      const c = new pg.Client({ connectionString: adminUrl(TEST_DATABASE_URL) });
      await c.connect();
      await c.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await c.end();
    },
  };
}
