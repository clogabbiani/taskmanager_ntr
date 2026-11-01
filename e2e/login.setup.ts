import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { AUTH_FILE } from "../playwright.config";

/**
 * One-off, interactive: `pnpm test:e2e:login` opens Chrome on /login; sign in
 * with Google by hand. The session is saved to e2e/.auth/user.json (git-ignored)
 * and reused by the e2e/app specs until it expires.
 */
test("save a signed-in session", async ({ page }) => {
  await page.goto("/login");
  await expect(page).not.toHaveURL(/\/login|accounts\.google\.com|\/auth\//, { timeout: 280_000 });
  mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  await page.context().storageState({ path: AUTH_FILE });
});
