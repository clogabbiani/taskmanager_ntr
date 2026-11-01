import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

/** Signed-in browser state saved by `pnpm test:e2e:login` (Google login cannot be scripted). */
export const AUTH_FILE = "e2e/.auth/user.json";
const hasAuth = existsSync(AUTH_FILE);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL, trace: "retain-on-failure", locale: "it-IT", timezoneId: "Europe/Rome" },
  projects: [
    { name: "public", testMatch: /smoke\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    {
      name: "login",
      testMatch: /login\.setup\.ts/,
      use: { ...devices["Desktop Chrome"], channel: "chrome", headless: false },
      timeout: 300_000,
    },
    {
      name: "app",
      testMatch: /app[\\/].*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: hasAuth ? AUTH_FILE : undefined },
    },
  ],
  // With E2E_BASE_URL set (e.g. a Vercel preview) no local server is started.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm dev --port ${PORT}`,
        url: `${baseURL}/login`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        env: {
          NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://example.supabase.co",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "e2e-placeholder",
        },
      },
});
