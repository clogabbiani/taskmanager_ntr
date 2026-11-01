/**
 * Read queries for issues and their context. They take a Supabase client so the
 * same code runs in the browser (TanStack Query, user JWT → RLS) and on the
 * server. Mutations live in actions.ts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ActivityRow,
  IssueRow,
  IssueType,
  LabelRow,
  LinkKind,
  Role,
  StatusCategory,
  StatusRow,
  UserRow,
} from "./model";

export const ISSUE_COLUMNS =
  "id, project_id, number, type, parent_id, title, description_md, status_id, priority, start_date, due_date, planned_days, progress, computed_progress, risk, external_collaborators, rank, created_by, archived_at, created_at, updated_at, issue_assignees(user_id), issue_labels(label_id)";

type RawIssue = Omit<IssueRow, "assignee_ids" | "label_ids"> & {
  issue_assignees: { user_id: string }[] | null;
  issue_labels: { label_id: string }[] | null;
};

export function toIssueRow(raw: RawIssue): IssueRow {
  const { issue_assignees, issue_labels, ...rest } = raw;
  return {
    ...rest,
    external_collaborators: rest.external_collaborators ?? [],
    assignee_ids: (issue_assignees ?? []).map((a) => a.user_id),
    label_ids: (issue_labels ?? []).map((l) => l.label_id),
  };
}

/** Query keys. Mutations invalidate ["issues"] and ["issue"] wholesale. */
export const queryKeys = {
  projectIssues: (projectId: string, archived: boolean) => ["issues", "project", projectId, { archived }] as const,
  issue: (projectKey: string, number: number) => ["issue", projectKey, number] as const,
  children: (issueId: string) => ["issues", "children", issueId] as const,
  links: (issueId: string) => ["issue", "links", issueId] as const,
  activity: (issueId: string) => ["issue", "activity", issueId] as const,
  statuses: (projectId: string) => ["statuses", projectId] as const,
  members: (workspaceId: string) => ["members", workspaceId] as const,
  labels: (workspaceId: string) => ["labels", workspaceId] as const,
  collaborators: (workspaceId: string) => ["collaborators", workspaceId] as const,
  search: (q: string) => ["search", q] as const,
  parents: (projectId: string, type: IssueType) => ["issues", "parents", projectId, type] as const,
};

export async function fetchProjectIssues(
  supabase: SupabaseClient,
  projectId: string,
  { archived = false }: { archived?: boolean } = {},
): Promise<IssueRow[]> {
  let query = supabase.from("issues").select(ISSUE_COLUMNS).eq("project_id", projectId);
  if (!archived) query = query.is("archived_at", null);
  const { data, error } = await query.order("rank", { ascending: true, nullsFirst: false }).order("number");
  if (error) throw error;
  return (data as unknown as RawIssue[]).map(toIssueRow);
}

export async function fetchIssueByKey(
  supabase: SupabaseClient,
  projectKey: string,
  number: number,
): Promise<(IssueRow & { project_key: string }) | null> {
  const { data, error } = await supabase
    .from("issues")
    .select(`${ISSUE_COLUMNS}, projects!inner(key)`)
    .eq("projects.key", projectKey.toUpperCase())
    .eq("number", number)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const raw = data as unknown as RawIssue & { projects: { key: string } };
  return { ...toIssueRow(raw), project_key: raw.projects.key };
}

export async function fetchChildren(supabase: SupabaseClient, parentId: string): Promise<IssueRow[]> {
  const { data, error } = await supabase
    .from("issues")
    .select(ISSUE_COLUMNS)
    .eq("parent_id", parentId)
    .order("rank", { ascending: true, nullsFirst: false })
    .order("number");
  if (error) throw error;
  return (data as unknown as RawIssue[]).map(toIssueRow);
}

/** Candidate parents of the given type in a project (for the parent picker). */
export async function fetchParentCandidates(
  supabase: SupabaseClient,
  projectId: string,
  type: IssueType,
): Promise<Pick<IssueRow, "id" | "number" | "title" | "type">[]> {
  const { data, error } = await supabase
    .from("issues")
    .select("id, number, title, type")
    .eq("project_id", projectId)
    .eq("type", type)
    .is("archived_at", null)
    .order("number");
  if (error) throw error;
  return data as Pick<IssueRow, "id" | "number" | "title" | "type">[];
}

export type LinkedIssue = {
  id: string;
  number: number;
  title: string;
  project_key: string;
  status_name: string;
  status_category: StatusCategory;
  status_color: string;
};

export type IssueLink = { id: string; kind: LinkKind; direction: "outgoing" | "incoming"; other: LinkedIssue };

const LINKED_COLUMNS = "id, number, title, projects(key), statuses(name, category, color)";

type RawLinked = {
  id: string;
  number: number;
  title: string;
  projects: { key: string } | null;
  statuses: { name: string; category: StatusCategory; color: string } | null;
};

function toLinked(raw: RawLinked): LinkedIssue {
  return {
    id: raw.id,
    number: raw.number,
    title: raw.title,
    project_key: raw.projects?.key ?? "",
    status_name: raw.statuses?.name ?? "",
    status_category: raw.statuses?.category ?? "todo",
    status_color: raw.statuses?.color ?? "#94a3b8",
  };
}

export async function fetchLinks(supabase: SupabaseClient, issueId: string): Promise<IssueLink[]> {
  const [outgoing, incoming] = await Promise.all([
    supabase
      .from("issue_links")
      .select(`id, kind, other:issues!issue_links_to_issue_id_issues_id_fk(${LINKED_COLUMNS})`)
      .eq("from_issue_id", issueId),
    supabase
      .from("issue_links")
      .select(`id, kind, other:issues!issue_links_from_issue_id_issues_id_fk(${LINKED_COLUMNS})`)
      .eq("to_issue_id", issueId),
  ]);
  if (outgoing.error) throw outgoing.error;
  if (incoming.error) throw incoming.error;
  type Raw = { id: string; kind: LinkKind; other: RawLinked | null };
  const map = (rows: Raw[], direction: IssueLink["direction"]) =>
    rows.filter((r) => r.other).map((r) => ({ id: r.id, kind: r.kind, direction, other: toLinked(r.other!) }));
  return [...map(outgoing.data as unknown as Raw[], "outgoing"), ...map(incoming.data as unknown as Raw[], "incoming")];
}

/** An issue is blocked while an issue that blocks it is not in a "done" status. */
export const isBlocked = (links: readonly IssueLink[]) =>
  links.some((l) => l.kind === "blocks" && l.direction === "incoming" && l.other.status_category !== "done");

export async function fetchActivity(supabase: SupabaseClient, issueId: string): Promise<ActivityRow[]> {
  const { data, error } = await supabase
    .from("activity_log")
    .select("id, issue_id, actor_id, action, field, old_value, new_value, created_at")
    .eq("issue_id", issueId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data as ActivityRow[];
}

export async function fetchStatuses(supabase: SupabaseClient, projectId: string): Promise<StatusRow[]> {
  const { data, error } = await supabase
    .from("statuses")
    .select("id, project_id, name, category, position, color")
    .eq("project_id", projectId)
    .order("position");
  if (error) throw error;
  return data as StatusRow[];
}

export type MemberRow = UserRow & { role: Role };

export async function fetchMembers(supabase: SupabaseClient, workspaceId: string): Promise<MemberRow[]> {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("role, users(id, display_name, email, avatar_url)")
    .eq("workspace_id", workspaceId);
  if (error) throw error;
  return (data as unknown as { role: Role; users: UserRow | null }[])
    .filter((r) => r.users)
    .map((r) => ({ ...r.users!, role: r.role }))
    .sort((a, b) => a.display_name.localeCompare(b.display_name, "it"));
}

export async function fetchLabels(supabase: SupabaseClient, workspaceId: string): Promise<LabelRow[]> {
  const { data, error } = await supabase
    .from("labels")
    .select("id, name, color")
    .eq("workspace_id", workspaceId)
    .order("name");
  if (error) throw error;
  return data as LabelRow[];
}

export async function fetchCollaboratorNames(supabase: SupabaseClient, workspaceId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("external_collaborator_names", { p_workspace_id: workspaceId });
  if (error) throw error;
  return (data as { name: string }[]).map((r) => r.name);
}

export type SearchResult = {
  issue_id: string;
  project_key: string;
  issue_number: number;
  title: string;
  issue_type: IssueType;
  is_archived: boolean;
};

export async function searchIssues(supabase: SupabaseClient, q: string, limit = 20): Promise<SearchResult[]> {
  const { data, error } = await supabase.rpc("search_issues", { p_query: q, p_limit: limit });
  if (error) throw error;
  return data as SearchResult[];
}
