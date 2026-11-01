import { describe, expect, it } from "vitest";
import { issuePriority, issueRisk, issueType, issueLinkKind, statusCategory, workspaceRole } from "@/db/schema";
import {
  ISSUE_PRIORITIES,
  ISSUE_RISKS,
  ISSUE_TYPES,
  LINK_KINDS,
  STATUS_CATEGORIES,
  WORKSPACE_ROLES,
  issuePatchSchema,
  parseIssueKey,
} from "./model";

describe("model enums mirror the database schema", () => {
  it.each([
    [ISSUE_TYPES, issueType.enumValues],
    [ISSUE_PRIORITIES, issuePriority.enumValues],
    [ISSUE_RISKS, issueRisk.enumValues],
    [STATUS_CATEGORIES, statusCategory.enumValues],
    [LINK_KINDS, issueLinkKind.enumValues],
    [WORKSPACE_ROLES, workspaceRole.enumValues],
  ])("%j", (local, db) => {
    expect([...local]).toEqual([...db]);
  });
});

describe("parseIssueKey", () => {
  it("parses keys case-insensitively", () => {
    expect(parseIssueKey("nbi-42")).toEqual({ projectKey: "NBI", number: 42 });
    expect(parseIssueKey(" PN-1 ")).toEqual({ projectKey: "PN", number: 1 });
    expect(parseIssueKey("NBI42")).toBeNull();
    expect(parseIssueKey("TOOLONGKEY-1")).toBeNull();
  });
});

describe("issuePatchSchema", () => {
  it("accepts partial patches and rejects unknown keys or bad values", () => {
    expect(issuePatchSchema.safeParse({ progress: 50 }).success).toBe(true);
    expect(issuePatchSchema.safeParse({ progress: 101 }).success).toBe(false);
    expect(issuePatchSchema.safeParse({ due_date: "30/11/2026" }).success).toBe(false);
    expect(issuePatchSchema.safeParse({ number: 3 }).success).toBe(false);
    expect(issuePatchSchema.safeParse({ title: "   " }).success).toBe(false);
  });
});
