import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = fileURLToPath(new URL("../prisma/migrations", import.meta.url));
const migrations = readdirSync(dir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => ({ name: d.name, sql: readFileSync(join(dir, d.name, "migration.sql"), "utf8") }));

describe("migrations", () => {
  it("exist", () => {
    expect(migrations.length).toBeGreaterThan(0);
  });

  it("are pure ASCII (they must apply on any server encoding)", () => {
    for (const m of migrations) {
      const bad = m.sql.match(/[^\x00-\x7F]/g);
      expect(bad, m.name).toBeNull();
    }
  });

  it("include the hand-written integrity rules", () => {
    const all = migrations.map((m) => m.sql).join("\n");
    expect(all).toContain('WHERE "status" = \'OPEN\'');
    expect(all).toContain("staff_credentials_by_role");
    expect(all).toContain("reviews_rating_range");
    expect(all).toContain("payments_amounts_nonneg");
  });
});
