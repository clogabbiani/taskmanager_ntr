/**
 * Issue filters shared by every view (table in M1; board, timeline, calendar in
 * M2). State lives in the URL query string so links are shareable (ADR-003):
 *
 *   ?status=<id>,<id>&type=task&assignee=me,<uuid>,none&label=<id>
 *   &priority=high,highest&risk=high&epic=<id>|none&start_from=2026-11-01
 *   &start_to=…&due_from=…&due_to=…&q=calibrazione&archived=1
 *   &sort=due_date:asc,priority:desc&group=epic&view=<saved view id>
 */
import { z } from "zod";
import {
  ISSUE_PRIORITIES,
  ISSUE_RISKS,
  ISSUE_TYPES,
  type IssuePriority,
  type IssueRisk,
  type IssueRow,
  type IssueType,
} from "@/features/issues/model";

export const ME = "me";
export const NONE = "none";

export type Filters = {
  status: string[];
  type: IssueType[];
  /** User ids, plus ME (current user) and NONE (unassigned). */
  assignee: string[];
  label: string[];
  priority: IssuePriority[];
  risk: IssueRisk[];
  /** Epic ids, plus NONE (issues outside any epic). */
  epic: string[];
  start_from: string | null;
  start_to: string | null;
  due_from: string | null;
  due_to: string | null;
  q: string;
  archived: boolean;
};

export type SortItem = { id: string; desc: boolean };
export type GroupBy = "none" | "epic";

export const EMPTY_FILTERS: Filters = {
  status: [],
  type: [],
  assignee: [],
  label: [],
  priority: [],
  risk: [],
  epic: [],
  start_from: null,
  start_to: null,
  due_from: null,
  due_to: null,
  q: "",
  archived: false,
};

const LIST_KEYS = ["status", "type", "assignee", "label", "priority", "risk", "epic"] as const;
const DATE_KEYS = ["start_from", "start_to", "due_from", "due_to"] as const;
type ListKey = (typeof LIST_KEYS)[number];

const ID = /^[0-9a-f-]{36}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const ALLOWED: Record<ListKey, (v: string) => boolean> = {
  status: (v) => ID.test(v),
  type: (v) => (ISSUE_TYPES as readonly string[]).includes(v),
  assignee: (v) => v === ME || v === NONE || ID.test(v),
  label: (v) => ID.test(v),
  priority: (v) => (ISSUE_PRIORITIES as readonly string[]).includes(v),
  risk: (v) => (ISSUE_RISKS as readonly string[]).includes(v),
  epic: (v) => v === NONE || ID.test(v),
};

type Params = { get(name: string): string | null };

function list(params: Params, key: ListKey): string[] {
  const raw = params.get(key);
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter((v) => v && ALLOWED[key](v)),
    ),
  ];
}

/** Reads filters from URL search params, ignoring anything malformed. */
export function parseFilters(params: Params): Filters {
  const f: Filters = { ...EMPTY_FILTERS };
  for (const key of LIST_KEYS) (f[key] as string[]) = list(params, key);
  for (const key of DATE_KEYS) {
    const v = params.get(key);
    f[key] = v && ISO.test(v) ? v : null;
  }
  f.q = (params.get("q") ?? "").slice(0, 200);
  f.archived = params.get("archived") === "1";
  return f;
}

export const SORTABLE = [
  "key",
  "title",
  "type",
  "status",
  "priority",
  "start_date",
  "due_date",
  "planned_days",
  "progress",
  "risk",
] as const;

export function parseSort(params: Params): SortItem[] {
  const raw = params.get("sort");
  if (!raw) return [];
  const out: SortItem[] = [];
  for (const part of raw.split(",")) {
    const [id, dir] = part.split(":");
    if (id && (SORTABLE as readonly string[]).includes(id) && !out.some((s) => s.id === id)) {
      out.push({ id, desc: dir === "desc" });
    }
  }
  return out;
}

export const parseGroup = (params: Params): GroupBy => (params.get("group") === "epic" ? "epic" : "none");

/** Writes filters, sort and grouping to a query string (only non-default values). */
export function serializeView(filters: Filters, sort: SortItem[] = [], group: GroupBy = "none"): URLSearchParams {
  const p = new URLSearchParams();
  for (const key of LIST_KEYS) if (filters[key].length) p.set(key, filters[key].join(","));
  for (const key of DATE_KEYS) if (filters[key]) p.set(key, filters[key]!);
  if (filters.q.trim()) p.set("q", filters.q.trim());
  if (filters.archived) p.set("archived", "1");
  if (sort.length) p.set("sort", sort.map((s) => `${s.id}:${s.desc ? "desc" : "asc"}`).join(","));
  if (group !== "none") p.set("group", group);
  return p;
}

export function activeFilterCount(f: Filters): number {
  return (
    LIST_KEYS.filter((k) => f[k].length > 0).length +
    DATE_KEYS.filter((k) => f[k]).length +
    (f.q.trim() ? 1 : 0) +
    (f.archived ? 1 : 0)
  );
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

type Matchable = Pick<
  IssueRow,
  | "id"
  | "number"
  | "type"
  | "parent_id"
  | "title"
  | "description_md"
  | "status_id"
  | "priority"
  | "risk"
  | "start_date"
  | "due_date"
  | "archived_at"
  | "assignee_ids"
  | "label_ids"
>;

/** Epic an issue belongs to: itself, its parent epic, or its grandparent through a task. */
export function epicOf<T extends Pick<IssueRow, "id" | "type" | "parent_id">>(
  issue: T,
  byId: ReadonlyMap<string, T>,
): string | null {
  if (issue.type === "epic") return issue.id;
  const parent = issue.parent_id ? byId.get(issue.parent_id) : undefined;
  if (!parent) return null;
  if (parent.type === "epic") return parent.id;
  const grand = parent.parent_id ? byId.get(parent.parent_id) : undefined;
  return grand?.type === "epic" ? grand.id : null;
}

const inRange = (value: string | null, from: string | null, to: string | null) => {
  if (!from && !to) return true;
  if (!value) return false;
  return (!from || value >= from) && (!to || value <= to);
};

export function matchesFilters<T extends Matchable>(
  issue: T,
  f: Filters,
  ctx: { me: string; projectKey: string; byId: ReadonlyMap<string, T> },
): boolean {
  if (!f.archived && issue.archived_at) return false;
  if (f.status.length && !f.status.includes(issue.status_id)) return false;
  if (f.type.length && !f.type.includes(issue.type)) return false;
  if (f.priority.length && !f.priority.includes(issue.priority)) return false;
  if (f.risk.length && !f.risk.includes(issue.risk)) return false;
  if (f.label.length && !issue.label_ids.some((l) => f.label.includes(l))) return false;
  if (f.assignee.length) {
    const wanted = f.assignee.map((a) => (a === ME ? ctx.me : a));
    const ok =
      (wanted.includes(NONE) && issue.assignee_ids.length === 0) || issue.assignee_ids.some((a) => wanted.includes(a));
    if (!ok) return false;
  }
  if (f.epic.length) {
    const epic = epicOf(issue, ctx.byId);
    if (!(epic ? f.epic.includes(epic) : f.epic.includes(NONE))) return false;
  }
  if (!inRange(issue.start_date, f.start_from, f.start_to)) return false;
  if (!inRange(issue.due_date, f.due_from, f.due_to)) return false;
  const q = f.q.trim().toLowerCase();
  if (q) {
    const key = `${ctx.projectKey}-${issue.number}`.toLowerCase();
    const haystack = `${key} ${issue.title} ${issue.description_md ?? ""}`.toLowerCase();
    if (!q.split(/\s+/).every((word) => haystack.includes(word))) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Saved view config (saved_views.config)
// ---------------------------------------------------------------------------

export const viewConfigSchema = z.object({
  /** Query string with filters, sort and grouping (same format as the URL). */
  query: z.string().max(4000).default(""),
  columns: z
    .object({
      visible: z.array(z.string()).max(50),
      order: z.array(z.string()).max(50),
      sizes: z.record(z.string(), z.number().int().min(40).max(1200)).default({}),
    })
    .optional(),
});

export type ViewConfig = z.infer<typeof viewConfigSchema>;
