import { describe, expect, it } from "vitest";
import { diffIssue, effectivePatch, setDelta, type IssueSnapshot } from "./activity";

const base: IssueSnapshot = {
  title: "Calibrazione",
  description_md: null,
  type: "task",
  parent_id: null,
  status_id: "s-todo",
  priority: "medium",
  start_date: null,
  due_date: "2026-11-30",
  planned_days: 3,
  progress: 0,
  risk: "none",
  external_collaborators: ["ICAPE"],
  assignee_ids: ["u1", "u2"],
  label_ids: [],
};

describe("diffIssue", () => {
  it("returns one change per modified field, in display order", () => {
    expect(diffIssue(base, { progress: 40, status_id: "s-doing", title: "Calibrazione lotto 3" })).toEqual([
      { field: "title", old_value: "Calibrazione", new_value: "Calibrazione lotto 3" },
      { field: "status", old_value: "s-todo", new_value: "s-doing" },
      { field: "progress", old_value: 0, new_value: 40 },
    ]);
  });

  it("ignores unchanged values", () => {
    expect(diffIssue(base, { title: "Calibrazione", due_date: "2026-11-30", planned_days: 3 })).toEqual([]);
  });

  it("compares assignees, labels and collaborators as sets", () => {
    expect(diffIssue(base, { assignee_ids: ["u2", "u1"], external_collaborators: ["ICAPE", "ICAPE"] })).toEqual([]);
    expect(diffIssue(base, { assignee_ids: ["u3", "u1"] })).toEqual([
      { field: "assignees", old_value: ["u1", "u2"], new_value: ["u1", "u3"] },
    ]);
  });

  it("records clearing a value as null", () => {
    expect(diffIssue(base, { due_date: null, planned_days: null })).toEqual([
      { field: "due_date", old_value: "2026-11-30", new_value: null },
      { field: "planned_days", old_value: 3, new_value: null },
    ]);
  });

  it("treats an empty description as no description", () => {
    expect(diffIssue(base, { description_md: "  " })).toEqual([]);
    expect(diffIssue(base, { description_md: "**ok**" })).toEqual([
      { field: "description", old_value: null, new_value: "**ok**" },
    ]);
  });
});

describe("effectivePatch", () => {
  it("drops keys whose value does not change", () => {
    expect(effectivePatch(base, { title: "Calibrazione", risk: "high", label_ids: [] })).toEqual({ risk: "high" });
  });
});

describe("setDelta", () => {
  it("computes added and removed items", () => {
    expect(setDelta(["a", "b"], ["b", "c"])).toEqual({ added: ["c"], removed: ["a"] });
  });
});
