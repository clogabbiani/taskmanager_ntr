import { existsSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { it } from "../../src/i18n/it";
import { AUTH_FILE } from "../../playwright.config";

/**
 * Project used by the app specs. They create real issues: point it at a
 * scratch project (default key E2E, create it in Impostazioni → Progetti).
 */
export const PROJECT = process.env.E2E_PROJECT_KEY ?? "E2E";

export function requireAuth() {
  test.skip(!existsSync(AUTH_FILE), "No saved session: run `pnpm test:e2e:login` first.");
}

export const unique = (prefix: string) => `${prefix} ${Date.now().toString(36)}`;

/** Creates an issue with the quick-create dialog (shortcut C) and waits for its detail. */
export async function quickCreate(page: Page, title: string, type?: "Epic" | "Task") {
  await page.goto(`/p/${PROJECT}`);
  await page.keyboard.press("c");
  const dialog = page.getByRole("dialog", { name: it.quickCreate.title });
  await dialog.getByLabel(it.quickCreate.titleLabel).fill(title);
  if (type) {
    await dialog.getByRole("combobox", { name: it.quickCreate.type }).click();
    await page.getByRole("option", { name: type }).click();
  }
  await dialog.getByRole("button", { name: it.quickCreate.submit }).click();
  await expect(page).toHaveURL(new RegExp(`/p/${PROJECT}/issues/${PROJECT}-\\d+$`));
  await expect(page.getByRole("textbox", { name: it.issue.fields.title })).toHaveValue(title);
  return new URL(page.url()).pathname;
}
