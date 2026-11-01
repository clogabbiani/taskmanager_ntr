"use server";

/**
 * Issue mutations (CLAUDE.md §5.1). Every action checks the role server-side
 * on top of RLS and writes activity_log field by field.
 */
import { z } from "zod";
import { canAdmin, canArchive, canWrite } from "@/features/auth/permissions";
import { requireMember } from "@/features/auth/session";
import { dbErrorCode, fail, ok, type ActionResult } from "@/lib/action";
import { markdownToPlainText } from "@/lib/markdown";
import { after, between } from "@/lib/rank";
import { createClient } from "@/lib/supabase/server";
import { diffIssue, effectivePatch, setDelta, type ActivityChange, type IssueSnapshot } from "./activity";
import { createIssueSchema, issuePatchSchema, LINK_KINDS, type CreateIssueInput, type IssuePatch } from "./model";

const SNAPSHOT_COLUMNS =
  "id, project_id, number, type, parent_id, title, description_md, status_id, priority, start_date, due_date, planned_days, progress, risk, external_collaborators, rank, created_by, archived_at, issue_assignees(user_id), issue_labels(label_id)";

type SnapshotRow = Omit<IssueSnapshot, "assignee_ids" | "label_ids"> & {
  id: string;
  project_id: string;
  number: number;
  rank: string | null;
  created_by: string | null;
  archived_at: string | null;
  issue_assignees: { user_id: string }[];
  issue_labels: { label_id: string }[];
};

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function loadSnapshot(supabase: Supabase, id: string) {
  const { data, error } = await supabase.from("issues").select(SNAPSHOT_COLUMNS).eq("id", id).maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as SnapshotRow;
  return {
    ...row,
    assignee_ids: row.issue_assignees.map((a) => a.user_id),
    label_ids: row.issue_labels.map((l) => l.label_id),
  };
}

async function logActivity(
  supabase: Supabase,
  issueId: string,
  actorId: string,
  rows: { action: string; field?: string | null; old_value?: unknown; new_value?: unknown }[],
) {
  if (rows.length === 0) return;
  await supabase.from("activity_log").insert(
    rows.map((r) => ({
      issue_id: issueId,
      actor_id: actorId,
      action: r.action,
      field: r.field ?? null,
      old_value: r.old_value ?? null,
      new_value: r.new_value ?? null,
    })),
  );
}

const idSchema = z.uuid();

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createIssue(
  input: CreateIssueInput,
): Promise<ActionResult<{ id: string; key: string; number: number }>> {
  const member = await requireMember();
  if (!canWrite(member.role)) return fail("forbidden");
  const parsed = createIssueSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const { project_id, type, title, parent_id, status_id } = parsed.data;

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("issues")
    .select("rank")
    .eq("project_id", project_id)
    .not("rank", "is", null)
    .order("rank", { ascending: false })
    .limit(1)
    .maybeSingle<{ rank: string }>();

  const { data, error } = await supabase.rpc("create_issue", {
    p_project_id: project_id,
    p_type: type,
    p_title: title,
    p_parent_id: parent_id,
    p_status_id: status_id,
    p_rank: after(last?.rank ?? null),
  });
  if (error) return fail(dbErrorCode(error));
  return ok(data as { id: string; key: string; number: number });
}

// ---------------------------------------------------------------------------
// Update (any subset of fields, including assignees and labels)
// ---------------------------------------------------------------------------

export async function updateIssue(id: string, patch: IssuePatch): Promise<ActionResult<{ changed: number }>> {
  const member = await requireMember();
  if (!canWrite(member.role)) return fail("forbidden");
  if (!idSchema.safeParse(id).success) return fail("invalid");
  const parsed = issuePatchSchema.safeParse(patch);
  if (!parsed.success) return fail("invalid");

  const supabase = await createClient();
  const current = await loadSnapshot(supabase, id);
  if (!current) return fail("not_found");

  const nextType = parsed.data.type ?? current.type;
  if (parsed.data.progress !== undefined && nextType === "epic") return fail("epic_progress");

  const eff = effectivePatch(current, parsed.data);
  const changes: ActivityChange[] = diffIssue(current, eff);
  if (changes.length === 0) return ok({ changed: 0 });

  const start = eff.start_date !== undefined ? eff.start_date : current.start_date;
  const due = eff.due_date !== undefined ? eff.due_date : current.due_date;
  if (start && due && start > due) return fail("dates");

  if (eff.assignee_ids?.length) {
    const { count } = await supabase
      .from("workspace_members")
      .select("user_id", { count: "exact", head: true })
      .eq("workspace_id", member.workspaceId)
      .in("user_id", eff.assignee_ids);
    if (count !== new Set(eff.assignee_ids).size) return fail("invalid");
  }
  if (eff.label_ids?.length) {
    const { count } = await supabase
      .from("labels")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", member.workspaceId)
      .in("id", eff.label_ids);
    if (count !== new Set(eff.label_ids).size) return fail("invalid");
  }

  const { assignee_ids, label_ids, ...columns } = eff;
  const row: Record<string, unknown> = { ...columns };
  if (columns.description_md !== undefined) {
    row.description_md = columns.description_md?.trim() ? columns.description_md : null;
    row.description_text = markdownToPlainText(columns.description_md);
  }
  if (columns.external_collaborators) {
    row.external_collaborators = [...new Set(columns.external_collaborators.map((c) => c.trim()))];
  }

  if (Object.keys(row).length > 0) {
    const { error } = await supabase.from("issues").update(row).eq("id", id);
    if (error) return fail(dbErrorCode(error));
  }

  if (assignee_ids) {
    const { added, removed } = setDelta(current.assignee_ids, assignee_ids);
    if (removed.length) {
      const { error } = await supabase.from("issue_assignees").delete().eq("issue_id", id).in("user_id", removed);
      if (error) return fail(dbErrorCode(error));
    }
    if (added.length) {
      const { error } = await supabase
        .from("issue_assignees")
        .insert(added.map((user_id) => ({ issue_id: id, user_id })));
      if (error) return fail(dbErrorCode(error));
    }
  }
  if (label_ids) {
    const { added, removed } = setDelta(current.label_ids, label_ids);
    if (removed.length) {
      const { error } = await supabase.from("issue_labels").delete().eq("issue_id", id).in("label_id", removed);
      if (error) return fail(dbErrorCode(error));
    }
    if (added.length) {
      const { error } = await supabase
        .from("issue_labels")
        .insert(added.map((label_id) => ({ issue_id: id, label_id })));
      if (error) return fail(dbErrorCode(error));
    }
  }

  await logActivity(
    supabase,
    id,
    member.id,
    changes.map((c) => ({ action: "updated", ...c })),
  );
  return ok({ changed: changes.length });
}

/** Applies the same patch to several issues (table bulk actions). */
export async function bulkUpdateIssues(
  ids: string[],
  patch: IssuePatch | { add_assignee?: string; remove_assignee?: string; add_label?: string; remove_label?: string },
): Promise<ActionResult<{ updated: number; failed: number }>> {
  const member = await requireMember();
  if (!canWrite(member.role)) return fail("forbidden");
  if (!z.array(idSchema).max(1000).safeParse(ids).success) return fail("invalid");

  const supabase = await createClient();
  let updated = 0;
  let failed = 0;
  for (const id of ids) {
    let issuePatch: IssuePatch = patch as IssuePatch;
    if ("add_assignee" in patch || "remove_assignee" in patch || "add_label" in patch || "remove_label" in patch) {
      const current = await loadSnapshot(supabase, id);
      if (!current) {
        failed++;
        continue;
      }
      const p = patch as { add_assignee?: string; remove_assignee?: string; add_label?: string; remove_label?: string };
      issuePatch = {};
      if (p.add_assignee) issuePatch.assignee_ids = [...current.assignee_ids, p.add_assignee];
      if (p.remove_assignee) issuePatch.assignee_ids = current.assignee_ids.filter((u) => u !== p.remove_assignee);
      if (p.add_label) issuePatch.label_ids = [...current.label_ids, p.add_label];
      if (p.remove_label) issuePatch.label_ids = current.label_ids.filter((l) => l !== p.remove_label);
    }
    const result = await updateIssue(id, issuePatch);
    if (result.ok) updated++;
    else failed++;
  }
  return ok({ updated, failed });
}

// ---------------------------------------------------------------------------
// Archive / restore / delete
// ---------------------------------------------------------------------------

async function setArchived(id: string, archived: boolean): Promise<ActionResult> {
  const member = await requireMember();
  if (!idSchema.safeParse(id).success) return fail("invalid");
  const supabase = await createClient();
  const current = await loadSnapshot(supabase, id);
  if (!current) return fail("not_found");
  if (!canArchive(member.role, member.id, current.created_by)) return fail("forbidden");
  if (Boolean(current.archived_at) === archived) return ok(undefined);

  const { error } = await supabase
    .from("issues")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return fail(dbErrorCode(error));
  await logActivity(supabase, id, member.id, [{ action: archived ? "archived" : "restored" }]);
  return ok(undefined);
}

export async function archiveIssue(id: string) {
  return setArchived(id, true);
}

export async function restoreIssue(id: string) {
  return setArchived(id, false);
}

/** Hard delete (admin only). `confirmKey` must equal the issue key, e.g. "NBI-42". */
export async function deleteIssue(id: string, confirmKey: string): Promise<ActionResult> {
  const member = await requireMember();
  if (!canAdmin(member.role)) return fail("forbidden");
  if (!idSchema.safeParse(id).success) return fail("invalid");

  const supabase = await createClient();
  const { data } = await supabase
    .from("issues")
    .select("id, type, number, projects(key)")
    .eq("id", id)
    .maybeSingle<{ id: string; type: string; number: number; projects: { key: string } | null }>();
  if (!data?.projects) return fail("not_found");
  if (confirmKey.trim().toUpperCase() !== `${data.projects.key}-${data.number}`) return fail("confirm_mismatch");

  // Subtasks cannot exist without their task: delete them with it. Tasks of a
  // deleted epic stay, without parent (FK ON DELETE SET NULL).
  if (data.type === "task") {
    const { error } = await supabase.from("issues").delete().eq("parent_id", id).eq("type", "subtask");
    if (error) return fail(dbErrorCode(error));
  }
  const { error } = await supabase.from("issues").delete().eq("id", id);
  if (error) return fail(dbErrorCode(error));
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

const linkSchema = z.object({ from_issue_id: idSchema, to_issue_id: idSchema, kind: z.enum(LINK_KINDS) });

export async function linkIssues(input: z.input<typeof linkSchema>): Promise<ActionResult<{ id: string }>> {
  const member = await requireMember();
  if (!canWrite(member.role)) return fail("forbidden");
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success || parsed.data.from_issue_id === parsed.data.to_issue_id) return fail("invalid");

  const supabase = await createClient();
  const { data, error } = await supabase.from("issue_links").insert(parsed.data).select("id").single<{ id: string }>();
  if (error) return fail(dbErrorCode(error));
  await logActivity(supabase, parsed.data.from_issue_id, member.id, [
    {
      action: "updated",
      field: "links",
      old_value: null,
      new_value: { kind: parsed.data.kind, to: parsed.data.to_issue_id },
    },
  ]);
  return ok({ id: data.id });
}

export async function unlinkIssues(linkId: string): Promise<ActionResult> {
  const member = await requireMember();
  if (!canWrite(member.role)) return fail("forbidden");
  if (!idSchema.safeParse(linkId).success) return fail("invalid");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("issue_links")
    .delete()
    .eq("id", linkId)
    .select("from_issue_id, to_issue_id, kind")
    .maybeSingle<{ from_issue_id: string; to_issue_id: string; kind: string }>();
  if (error) return fail(dbErrorCode(error));
  if (!data) return fail("not_found");
  await logActivity(supabase, data.from_issue_id, member.id, [
    { action: "updated", field: "links", old_value: { kind: data.kind, to: data.to_issue_id }, new_value: null },
  ]);
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Manual ordering
// ---------------------------------------------------------------------------

/**
 * Moves an issue between two neighbours (ids of the items that will precede and
 * follow it; null at the ends). Ranks are computed server-side.
 */
export async function reorderIssue(
  id: string,
  beforeId: string | null,
  afterId: string | null,
): Promise<ActionResult<{ rank: string }>> {
  const member = await requireMember();
  if (!canWrite(member.role)) return fail("forbidden");
  const ids = [id, beforeId, afterId].filter((x): x is string => x !== null);
  if (!z.array(idSchema).safeParse(ids).success) return fail("invalid");

  const supabase = await createClient();
  const { data, error } = await supabase.from("issues").select("id, rank").in("id", ids);
  if (error) return fail(dbErrorCode(error));
  const rankOf = new Map((data as { id: string; rank: string | null }[]).map((r) => [r.id, r.rank]));
  const lo = beforeId ? (rankOf.get(beforeId) ?? null) : null;
  const hi = afterId ? (rankOf.get(afterId) ?? null) : null;

  let rank: string;
  try {
    rank = lo !== null && hi !== null && lo >= hi ? after(lo) : between(lo, hi);
  } catch {
    return fail("invalid");
  }
  const { error: updateError } = await supabase.from("issues").update({ rank }).eq("id", id);
  if (updateError) return fail(dbErrorCode(updateError));
  return ok({ rank });
}
