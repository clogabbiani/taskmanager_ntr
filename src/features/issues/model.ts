/**
 * Issue domain model shared by server and client code. Enum values mirror
 * src/db/schema.ts (kept in sync by model.test.ts) without importing Drizzle
 * into client bundles.
 */
import { z } from "zod";

export const ISSUE_TYPES = ["epic", "task", "subtask"] as const;
export const ISSUE_PRIORITIES = ["lowest", "low", "medium", "high", "highest"] as const;
export const ISSUE_RISKS = ["none", "low", "medium", "high"] as const;
export const STATUS_CATEGORIES = ["todo", "in_progress", "done"] as const;
export const LINK_KINDS = ["relates", "blocks"] as const;
export const WORKSPACE_ROLES = ["owner", "admin", "member", "viewer"] as const;

export type IssueType = (typeof ISSUE_TYPES)[number];
export type IssuePriority = (typeof ISSUE_PRIORITIES)[number];
export type IssueRisk = (typeof ISSUE_RISKS)[number];
export type StatusCategory = (typeof STATUS_CATEGORIES)[number];
export type LinkKind = (typeof LINK_KINDS)[number];
export type Role = (typeof WORKSPACE_ROLES)[number];

/** Allowed parent type for each issue type (rigid hierarchy, CLAUDE.md §3.3). */
export const PARENT_TYPE: Record<IssueType, IssueType | null> = { epic: null, task: "epic", subtask: "task" };
export const CHILD_TYPE: Record<IssueType, IssueType | null> = { epic: "task", task: "subtask", subtask: null };

/** Issue as loaded by the app (assignees and labels flattened to id lists). */
export type IssueRow = {
  id: string;
  project_id: string;
  number: number;
  type: IssueType;
  parent_id: string | null;
  title: string;
  description_md: string | null;
  status_id: string;
  priority: IssuePriority;
  start_date: string | null;
  due_date: string | null;
  planned_days: number | null;
  progress: number;
  /** Derived: epics aggregate their children (see progress.ts), others equal `progress`. */
  computed_progress: number;
  risk: IssueRisk;
  external_collaborators: string[];
  rank: string | null;
  created_by: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  assignee_ids: string[];
  label_ids: string[];
};

export type StatusRow = {
  id: string;
  project_id: string;
  name: string;
  category: StatusCategory;
  position: number;
  color: string;
};

export type LabelRow = { id: string; name: string; color: string };

export type UserRow = { id: string; display_name: string; email: string; avatar_url: string | null };

export type LinkRow = { id: string; from_issue_id: string; to_issue_id: string; kind: LinkKind };

export type ActivityRow = {
  id: string;
  issue_id: string;
  actor_id: string | null;
  action: "created" | "updated" | "commented" | "attached" | "archived" | "restored" | "moved";
  field: string | null;
  old_value: unknown;
  new_value: unknown;
  created_at: string;
};

export const issueKey = (projectKey: string, number: number) => `${projectKey}-${number}`;

/** Parses "NBI-42" (case-insensitive) into its parts. */
export function parseIssueKey(key: string): { projectKey: string; number: number } | null {
  const m = /^([A-Za-z]{2,6})-(\d+)$/.exec(key.trim());
  if (!m) return null;
  return { projectKey: m[1]!.toUpperCase(), number: Number(m[2]) };
}

// ---------------------------------------------------------------------------
// Validation (server actions)
// ---------------------------------------------------------------------------

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const uuid = z.uuid();

export const issuePatchSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    description_md: z.string().max(100_000).nullable(),
    type: z.enum(ISSUE_TYPES),
    parent_id: uuid.nullable(),
    status_id: uuid,
    priority: z.enum(ISSUE_PRIORITIES),
    start_date: isoDate.nullable(),
    due_date: isoDate.nullable(),
    planned_days: z.number().int().min(0).max(10_000).nullable(),
    progress: z.number().int().min(0).max(100),
    risk: z.enum(ISSUE_RISKS),
    external_collaborators: z.array(z.string().trim().min(1).max(100)).max(50),
    assignee_ids: z.array(uuid).max(50),
    label_ids: z.array(uuid).max(100),
  })
  .partial()
  .strict();

export type IssuePatch = z.infer<typeof issuePatchSchema>;

export const createIssueSchema = z.object({
  project_id: uuid,
  type: z.enum(ISSUE_TYPES).default("task"),
  title: z.string().trim().min(1).max(500),
  parent_id: uuid.nullable().default(null),
  status_id: uuid.nullable().default(null),
});

export type CreateIssueInput = z.input<typeof createIssueSchema>;
