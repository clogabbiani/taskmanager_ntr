/**
 * Field-by-field diff for activity_log (CLAUDE.md §5.3). One row per changed
 * field, with old_value / new_value as JSON. Pure: unit tested, used by the
 * server actions before writing.
 */
import type { IssuePatch, IssueRow } from "./model";

/** activity_log.field names, in display order. */
export const ACTIVITY_FIELDS = [
  "title",
  "type",
  "parent",
  "status",
  "priority",
  "assignees",
  "labels",
  "start_date",
  "due_date",
  "planned_days",
  "progress",
  "risk",
  "external_collaborators",
  "description",
] as const;

export type ActivityField = (typeof ACTIVITY_FIELDS)[number];

type PatchKey = keyof IssuePatch;

const FIELD_OF: Record<PatchKey, ActivityField> = {
  title: "title",
  description_md: "description",
  type: "type",
  parent_id: "parent",
  status_id: "status",
  priority: "priority",
  start_date: "start_date",
  due_date: "due_date",
  planned_days: "planned_days",
  progress: "progress",
  risk: "risk",
  external_collaborators: "external_collaborators",
  assignee_ids: "assignees",
  label_ids: "labels",
};

/** Fields compared as sets (order is irrelevant, duplicates collapse). */
const SET_FIELDS = new Set<PatchKey>(["assignee_ids", "label_ids", "external_collaborators"]);

type Json = string | number | boolean | null | Json[];

export type ActivityChange = { field: ActivityField; old_value: Json; new_value: Json };

export type IssueSnapshot = Pick<IssueRow, Exclude<PatchKey, never> & keyof IssueRow>;

function normalise(key: PatchKey, value: unknown): Json {
  if (value === undefined || value === null) return null;
  if (SET_FIELDS.has(key)) return [...new Set(value as string[])].sort();
  if (key === "description_md" && typeof value === "string" && value.trim() === "") return null;
  return value as Json;
}

function equal(a: Json, b: Json): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => x === b[i]);
  return a === b;
}

/**
 * Changes that `patch` would apply to `current`. Keys with an unchanged value
 * are omitted, so the result is also the effective patch.
 */
export function diffIssue(current: IssueSnapshot, patch: IssuePatch): ActivityChange[] {
  const changes: ActivityChange[] = [];
  for (const key of Object.keys(patch) as PatchKey[]) {
    if (!(key in FIELD_OF)) continue;
    const before = normalise(key, current[key]);
    const after = normalise(key, patch[key]);
    if (!equal(before, after)) changes.push({ field: FIELD_OF[key], old_value: before, new_value: after });
  }
  return changes.sort((a, b) => ACTIVITY_FIELDS.indexOf(a.field) - ACTIVITY_FIELDS.indexOf(b.field));
}

/** Subset of `patch` whose values actually differ from `current`. */
export function effectivePatch(current: IssueSnapshot, patch: IssuePatch): IssuePatch {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(patch) as PatchKey[]) {
    if (!equal(normalise(key, current[key]), normalise(key, patch[key]))) out[key] = patch[key];
  }
  return out as IssuePatch;
}

/** Items added to and removed from a set-like field. */
export function setDelta(before: readonly string[], after: readonly string[]) {
  const a = new Set(before);
  const b = new Set(after);
  return { added: [...b].filter((x) => !a.has(x)), removed: [...a].filter((x) => !b.has(x)) };
}
