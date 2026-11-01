import { describe, expect, it } from "vitest";
import { dbErrorCode } from "./action";

describe("dbErrorCode", () => {
  it.each([
    [{ code: "42501", message: "not allowed" }, "forbidden"],
    [{ code: "42501", message: 'new row violates row-level security policy for table "labels"' }, "forbidden"],
    [{ code: "23505", message: "duplicate key" }, "duplicate"],
    [{ code: "23514", message: "invalid hierarchy: task cannot be child of task" }, "hierarchy"],
    [{ code: "23514", message: "status_category_required: project must keep" }, "status_category_required"],
    [{ code: "23503", message: "status_has_issues: move the issues" }, "status_has_issues"],
    [{ code: "23514", message: 'violates check constraint "issues_dates_order"' }, "dates"],
    [{ code: "PGRST116", message: "no rows" }, "not_found"],
    [{ code: "XX000", message: "boom" }, "generic"],
    [null, "generic"],
  ] as const)("%j → %s", (error, code) => {
    expect(dbErrorCode(error)).toBe(code);
  });
});

describe("error messages", () => {
  it("has an Italian message for every error code", async () => {
    const { ERROR_CODES } = await import("./action");
    const { it: messages } = await import("@/i18n/it");
    for (const code of ERROR_CODES) expect(messages.errors[code]).toBeTruthy();
  });
});
