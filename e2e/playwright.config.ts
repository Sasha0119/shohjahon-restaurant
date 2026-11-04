import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests: real browser → Next.js (production build) → API → PostgreSQL.
 *
 *   E2E_DATABASE_URL=postgresql://user:pass@localhost:5432/restaurant_e2e npm run test:e2e
 *
 * The database named in E2E_DATABASE_URL is DROPPED and re-created on every run,
 * so its name must end in "_e2e" (checked by e2e/prepare-db.ts).
 * Set PW_CHANNEL=chrome to use the installed Google Chrome instead of
 * Playwright's bundled Chromium (`npx playwright install chromium`).
 */
export const WEB_PORT = 3300;
export const API_PORT = 4300;
export const BASE_URL = `http://localhost:${WEB_PORT}`;

/** Test-only values (never used outside this suite). */
export const E2E_MANAGER = { email: "e2e-manager@example.test", password: "e2e-only-password-123" };
export const E2E_STAFF = { kitchen: { name: "Demo Kitchen", pin: "4321" }, waiter: { name: "Demo Waiter", pin: "1234" } };

const apiEnv = {
  NODE_ENV: "test",
  API_PORT: String(API_PORT),
  LOG_LEVEL: "warn",
  DATABASE_URL: process.env.E2E_DATABASE_URL ?? "",
  CORS_ORIGINS: BASE_URL,
  PUBLIC_WEB_URL: BASE_URL,
  QR_TOKEN_SECRET: "e2e-qr-secret-0123456789abcdef0123456789",
  COOKIE_SECRET: "e2e-cookie-secret-0123456789abcdef01234567",
  COOKIE_SECURE: "false",
  PAYMENT_PROVIDER: "mock",
  SEED_MANAGER_EMAIL: E2E_MANAGER.email,
  SEED_MANAGER_PASSWORD: E2E_MANAGER.password,
  SEED_DEMO_STAFF: "true",
  UPLOAD_DIR: "../../e2e/.uploads",
};

export default defineConfig({
  testDir: ".",
  outputDir: "./.results",
  fullyParallel: false,
  // Realtime flows span several browser contexts; one worker keeps them deterministic.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["github"], ["html", { open: "never", outputFolder: "./.report" }]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}),
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "chromium", use: { ...devices["Desktop Chrome"], ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}) }, dependencies: ["setup"], testMatch: /.*\.spec\.ts/ },
  ],
  webServer: [
    {
      name: "api",
      command: "npx tsx e2e/prepare-db.ts && npx tsx apps/api/src/server.ts",
      cwd: "..",
      url: `http://localhost:${API_PORT}/api/health`,
      env: apiEnv,
      timeout: 180_000,
      reuseExistingServer: false,
      stdout: "pipe",
    },
    {
      name: "web",
      // Production build, so the strict production CSP is what gets tested.
      command: `npm run build -w @app/web && npm run start -w @app/web -- -p ${WEB_PORT}`,
      cwd: "..",
      url: BASE_URL,
      env: { API_INTERNAL_URL: `http://127.0.0.1:${API_PORT}`, NEXT_TELEMETRY_DISABLED: "1" },
      timeout: 600_000,
      reuseExistingServer: false,
    },
  ],
});
