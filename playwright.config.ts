import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
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
