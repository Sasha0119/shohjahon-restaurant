import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "api",
    environment: "node",
    include: ["test/**/*.test.ts"],
    // DB integration tests need a real PostgreSQL; they skip unless TEST_DATABASE_URL is set.
    testTimeout: 30_000,
  },
});
