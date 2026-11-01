import { expect, test } from "@playwright/test";
import { it } from "../../src/i18n/it";
import { quickCreate, requireAuth, unique } from "./helpers";

test.beforeEach(() => requireAuth());

test("create an issue, change status and assignee, see both in Activity", async ({ page }) => {
  await quickCreate(page, unique("E2E flusso"));

  const status = page.getByRole("combobox", { name: it.issue.fields.status });
  await status.click();
  await page.getByRole("option", { name: "In Progress" }).click();
  await expect(status).toContainText("In Progress");

  await page.getByRole("button", { name: it.issue.fields.assignees }).click();
  await page.getByRole("option").first().click();
  await page.keyboard.press("Escape");

  await page.getByRole("tab", { name: it.issue.tabs.activity }).click();
  await expect(page.getByText(/ha cambiato Stato da To Do a In Progress/)).toBeVisible();
  await expect(page.getByText(/ha aggiunto .* a Assegnatari/)).toBeVisible();
  await expect(page.getByText(/ha creato l'issue/)).toBeVisible();
});
