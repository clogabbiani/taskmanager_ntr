import { expect, test } from "@playwright/test";
import { it } from "../../src/i18n/it";
import { PROJECT, quickCreate, requireAuth, unique } from "./helpers";

test.beforeEach(() => requireAuth());

test("save a filtered table view and reopen it", async ({ page }) => {
  const title = unique("E2E vista");
  await quickCreate(page, title);

  await page.goto(`/p/${PROJECT}`);
  await page.getByRole("textbox", { name: it.filters.fields.q }).fill(title);
  await expect(page).toHaveURL(/[?&]q=/);
  await expect(page.getByRole("row", { name: new RegExp(`${PROJECT}-\\d+`) })).toHaveCount(1);

  const viewName = unique("Vista E2E");
  await page.getByRole("button", { name: it.views.title }).click();
  await page.getByRole("menuitem", { name: it.views.save }).click();
  await page.getByLabel(it.views.name).fill(viewName);
  await page.getByRole("dialog").getByRole("button", { name: it.views.save }).click();
  await expect(page).toHaveURL(/[?&]view=/);

  // Leave and come back through the sidebar link (?view=<id> only).
  await page.goto(`/p/${PROJECT}`);
  await expect(page.getByRole("textbox", { name: it.filters.fields.q })).toHaveValue("");
  await page.getByRole("link", { name: viewName }).click();
  await expect(page.getByRole("textbox", { name: it.filters.fields.q })).toHaveValue(title);
  await expect(page.getByRole("row", { name: new RegExp(`${PROJECT}-\\d+`) })).toHaveCount(1);
});
