import { expect, test } from "@playwright/test";
import { it } from "../../src/i18n/it";
import { quickCreate, requireAuth, unique } from "./helpers";

test.beforeEach(() => requireAuth());

test("epic progress is computed from its tasks weighted by planned days", async ({ page }) => {
  const epicPath = await quickCreate(page, unique("E2E epic"), "Epic");

  const addChild = async (title: string) => {
    await page.getByLabel(`${it.issue.children.add}: ${it.issue.types.task}`).fill(title);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible();
  };
  await addChild("Task A");
  await addChild("Task B");

  // Task A: 3 days at 100%; Task B: 1 day at 0% → epic at 75%.
  for (const [title, days, progress] of [
    ["Task A", "3", "100"],
    ["Task B", "1", "0"],
  ] as const) {
    await page.goto(epicPath);
    await page.getByRole("link", { name: new RegExp(title) }).click();
    const daysInput = page.getByRole("spinbutton", { name: it.issue.fields.planned_days });
    await daysInput.fill(days);
    await daysInput.press("Enter");
    const progressInput = page.getByRole("spinbutton", { name: it.issue.fields.progress });
    await progressInput.fill(progress);
    await progressInput.press("Enter");
    await expect(progressInput).toHaveValue(progress);
  }

  await page.goto(epicPath);
  await expect(page.getByText(it.issue.computedProgress)).toBeVisible();
  await expect(page.getByRole("progressbar").first()).toHaveAttribute("aria-valuenow", "75");
});
