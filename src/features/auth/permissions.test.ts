import { describe, expect, it } from "vitest";
import { canAdmin, canArchive, canChangeRole, canEditView, canWrite } from "./permissions";

describe("permissions", () => {
  it("follows the §4 role matrix", () => {
    expect([canWrite("viewer"), canWrite("member"), canWrite("admin"), canWrite("owner")]).toEqual([
      false,
      true,
      true,
      true,
    ]);
    expect([canAdmin("viewer"), canAdmin("member"), canAdmin("admin"), canAdmin("owner")]).toEqual([
      false,
      false,
      true,
      true,
    ]);
  });

  it("lets members archive only their own issues", () => {
    expect(canArchive("member", "u1", "u1")).toBe(true);
    expect(canArchive("member", "u1", "u2")).toBe(false);
    expect(canArchive("viewer", "u1", "u1")).toBe(false);
    expect(canArchive("admin", "u1", "u2")).toBe(true);
  });

  it("protects the owner role", () => {
    expect(canChangeRole("admin", "member", "admin")).toBe(true);
    expect(canChangeRole("admin", "owner", "admin")).toBe(false);
    expect(canChangeRole("admin", "member", "owner")).toBe(false);
    expect(canChangeRole("owner", "admin", "owner")).toBe(true);
    expect(canChangeRole("member", "viewer", "member")).toBe(false);
  });

  it("restricts shared view edits to author and admins", () => {
    expect(canEditView("member", "u1", { owner_id: "u1", is_shared: true })).toBe(true);
    expect(canEditView("member", "u1", { owner_id: "u2", is_shared: true })).toBe(false);
    expect(canEditView("admin", "u1", { owner_id: "u2", is_shared: true })).toBe(true);
    expect(canEditView("admin", "u1", { owner_id: "u2", is_shared: false })).toBe(false);
  });
});
