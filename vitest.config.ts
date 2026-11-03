import { defineConfig } from "vitest/config";

// One test runner for the whole monorepo. Each workspace is a Vitest project.
export default defineConfig({
  test: {
    projects: ["config", "packages/shared", "apps/web", "apps/api"],
  },
});
