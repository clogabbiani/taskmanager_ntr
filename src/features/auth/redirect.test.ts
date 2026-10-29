import { describe, expect, it } from "vitest";
import { isAllowListRejection, isPublicPath, loginRedirectPath, safeNextPath } from "./redirect";

describe("isPublicPath", () => {
  it.each([
    ["/login", true],
    ["/unauthorized", true],
    ["/auth/callback", true],
    ["/auth/signout", true],
    ["/", false],
    ["/p/NBI", false],
    ["/loginx", false],
    ["/authors", false],
  ])("%s → %s", (path, expected) => {
    expect(isPublicPath(path)).toBe(expected);
  });
});

describe("safeNextPath", () => {
  it("keeps same-origin paths", () => {
    expect(safeNextPath("/p/NBI/issues/NBI-42?tab=activity")).toBe("/p/NBI/issues/NBI-42?tab=activity");
  });

  it.each([null, undefined, "", "https://evil.com", "//evil.com", "/\\evil.com", "/login", "/auth/callback"])(
    "falls back for %s",
    (value) => {
      expect(safeNextPath(value)).toBe("/");
    },
  );
});

describe("loginRedirectPath", () => {
  it("omits the root path", () => {
    expect(loginRedirectPath("/")).toBeNull();
  });

  it("preserves deep links", () => {
    expect(loginRedirectPath("/p/NBI")).toBe("/p/NBI");
  });
});

describe("isAllowListRejection", () => {
  it("detects the hook marker", () => {
    expect(isAllowListRejection("Error running hook URI: signin_not_allowed")).toBe(true);
    expect(isAllowListRejection("access_denied")).toBe(false);
    expect(isAllowListRejection(null)).toBe(false);
  });
});
