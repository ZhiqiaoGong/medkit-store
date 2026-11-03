import { defineConfig, devices } from "@playwright/test";

// Ports deliberately differ from the dev defaults (3000 / 4000) so the suite
// can run while a normal dev stack is up.
const WEB_PORT = 3100;
const STUB_API_PORT = 4100;
const STUB_API_URL = `http://127.0.0.1:${STUB_API_PORT}`;

// Mirrors the `:compat` npm scripts, for machines where the native SWC binary
// will not load.
const WASM_FALLBACK_ENV = {
  NEXT_TEST_WASM: "1",
  NEXT_TEST_WASM_DIR: "node_modules/@next/swc-wasm-nodejs",
  NEXT_IGNORE_INCORRECT_LOCKFILE: "1",
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? ([["github"], ["list"], ["html", { open: "never" }]] as const)
    : [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: [
    {
      command: `node e2e/fixtures/stub-api.mjs`,
      url: `${STUB_API_URL}/api/products`,
      reuseExistingServer: !process.env.CI,
      env: { STUB_API_PORT: String(STUB_API_PORT) },
      stdout: "pipe",
    },
    {
      // Runs the production build on purpose: the dev overlay injects its own
      // focusable element, which would pollute the tab-order assertions.
      // build:compat is the wasm fallback this repo uses where the native SWC
      // binary will not load; CI runs on a platform where the native one works.
      command: `${process.env.CI ? "npm run build" : "npm run build:compat"} && npm run start -- --port ${WEB_PORT}`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        API_BASE_URL: STUB_API_URL,
        NEXT_PUBLIC_API_BASE_URL: STUB_API_URL,
        NEXT_TELEMETRY_DISABLED: "1",
        // `next start` loads next.config.ts, so it needs the same wasm
        // fallback the compat build scripts use.
        ...(process.env.CI ? {} : WASM_FALLBACK_ENV),
      },
      stdout: "pipe",
    },
  ],
});
