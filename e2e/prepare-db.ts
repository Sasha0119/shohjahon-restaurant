/**
 * Fresh database for an end-to-end run: DROP + CREATE the database named in
 * DATABASE_URL, apply migrations, seed. Refuses any database whose name does
 * not end in "_e2e", so it can never wipe real data.
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("E2E_DATABASE_URL is not set (e.g. postgresql://user:pass@localhost:5432/restaurant_e2e)");
  process.exit(1);
}
const u = new URL(url);
const name = decodeURIComponent(u.pathname.slice(1));
if (!/^[a-z0-9_]+_e2e$/.test(name)) {
  console.error(`Refusing to reset "${name}": the e2e database name must end in "_e2e".`);
  process.exit(1);
}

const admin = new URL(url);
admin.pathname = "/postgres";
admin.search = "";
const client = new pg.Client({ connectionString: admin.toString() });
await client.connect();
await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
await client.query(`CREATE DATABASE "${name}" ENCODING 'UTF8' TEMPLATE template0`);
await client.end();

const apiDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "apps", "api");
execSync("npx prisma migrate deploy", { cwd: apiDir, stdio: "inherit", env: process.env });
execSync("npx tsx prisma/seed.ts", { cwd: apiDir, stdio: "inherit", env: process.env });
console.log(`e2e database ${name} ready`);
