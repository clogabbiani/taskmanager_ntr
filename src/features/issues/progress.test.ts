import { describe, expect, it } from "vitest";
import { computeEpicProgress, effectiveProgress } from "./progress";

describe("computeEpicProgress", () => {
  it("is 0 without children", () => {
    expect(computeEpicProgress([])).toBe(0);
  });

  it("uses a simple average when no child has planned days", () => {
    expect(
      computeEpicProgress([
        { progress: 100, planned_days: null },
        { progress: 0, planned_days: 0 },
        { progress: 50, planned_days: null },
      ]),
    ).toBe(50);
  });

  it("weights by planned_days, ignoring children without planned days", () => {
    expect(
      computeEpicProgress([
        { progress: 100, planned_days: 3 },
        { progress: 0, planned_days: 1 },
        { progress: 0, planned_days: null },
      ]),
    ).toBe(75);
  });

  it("rounds to the nearest integer", () => {
    expect(
      computeEpicProgress([
        { progress: 10, planned_days: 1 },
        { progress: 20, planned_days: 2 },
      ]),
    ).toBe(17);
  });

  it("ignores archived children", () => {
    expect(
      computeEpicProgress([
        { progress: 100, planned_days: 5, archived_at: "2026-11-01T00:00:00Z" },
        { progress: 20, planned_days: 1 },
      ]),
    ).toBe(20);
  });

  it("returns the manual value for tasks and subtasks", () => {
    expect(effectiveProgress({ type: "task", progress: 40 }, [{ progress: 100, planned_days: 1 }])).toBe(40);
    expect(effectiveProgress({ type: "epic", progress: 40 }, [{ progress: 100, planned_days: 1 }])).toBe(100);
  });
});
