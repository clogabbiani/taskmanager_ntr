import { expect, test } from "@playwright/test";
import { it } from "../src/i18n/it";

test("anonymous visitors are sent to the Google login page", async ({ page }) => {
  await page.goto("/p/NBI");
  await expect(page).toHaveURL(/\/login\?next=%2Fp%2FNBI$/);
  await expect(page.getByRole("heading", { name: it.auth.loginTitle })).toBeVisible();
  await expect(page.getByRole("button", { name: it.auth.loginWithGoogle })).toBeEnabled();
});
