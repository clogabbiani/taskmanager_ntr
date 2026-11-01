"use server";

/** Project, project member and status administration (admin/owner, CLAUDE.md §4, §5.5). */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canAdmin } from "@/features/auth/permissions";
import { requireMember } from "@/features/auth/session";
import { STATUS_CATEGORIES } from "@/features/issues/model";
import { dbErrorCode, fail, ok, type ActionResult } from "@/lib/action";
import { createClient } from "@/lib/supabase/server";

const idSchema = z.uuid();
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const projectSchema = z.object({
  name: z.string().trim().min(1).max(100),
  key: z
    .string()
    .trim()
    .transform((k) => k.toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{2,6}$/)),
  description: z.string().trim().max(2000).nullable().default(null),
  color: color.default("#64748b"),
  is_private: z.boolean().default(false),
});

async function adminContext() {
  const member = await requireMember();
  if (!canAdmin(member.role)) return null;
  return { member, supabase: await createClient() };
}

function refresh() {
  revalidatePath("/", "layout");
}

export async function createProject(
  input: z.input<typeof projectSchema>,
): Promise<ActionResult<{ id: string; key: string }>> {
  const ctx = await adminContext();
  if (!ctx) return fail("forbidden");
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");

  const { data, error } = await ctx.supabase
    .from("projects")
    .insert({ ...parsed.data, workspace_id: ctx.member.workspaceId })
    .select("id, key")
    .single<{ id: string; key: string }>();
  if (error) return fail(dbErrorCode(error));

  // The creator of a private project is listed as member so they can read its issues.
  if (parsed.data.is_private) {
    await ctx.supabase.from("project_members").insert({ project_id: data.id, user_id: ctx.member.id });
  }
  refresh();
  return ok(data);
}

const projectPatchSchema = projectSchema.omit({ key: true }).partial().strict();

export async function updateProject(id: string, patch: z.input<typeof projectPatchSchema>): Promise<ActionResult> {
  const ctx = await adminContext();
  if (!ctx) return fail("forbidden");
  const parsed = projectPatchSchema.safeParse(patch);
  if (!idSchema.safeParse(id).success || !parsed.success) return fail("invalid");
  const { error } = await ctx.supabase.from("projects").update(parsed.data).eq("id", id);
  if (error) return fail(dbErrorCode(error));
  refresh();
  return ok(undefined);
}

export async function setProjectArchived(id: string, archived: boolean): Promise<ActionResult> {
  const ctx = await adminContext();
  if (!ctx) return fail("forbidden");
  if (!idSchema.safeParse(id).success) return fail("invalid");
  const { error } = await ctx.supabase
    .from("projects")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return fail(dbErrorCode(error));
  refresh();
  return ok(undefined);
}

export async function addProjectMember(projectId: string, userId: string): Promise<ActionResult> {
  const ctx = await adminContext();
  if (!ctx) return fail("forbidden");
  if (!idSchema.safeParse(projectId).success || !idSchema.safeParse(userId).success) return fail("invalid");
  const { error } = await ctx.supabase.from("project_members").insert({ project_id: projectId, user_id: userId });
  if (error) return fail(dbErrorCode(error));
  refresh();
  return ok(undefined);
}

export async function removeProjectMember(projectId: string, userId: string): Promise<ActionResult> {
  const ctx = await adminContext();
  if (!ctx) return fail("forbidden");
  if (!idSchema.safeParse(projectId).success || !idSchema.safeParse(userId).success) return fail("invalid");
  const { error } = await ctx.supabase
    .from("project_members")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", userId);
  if (error) return fail(dbErrorCode(error));
  refresh();
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Statuses
// ---------------------------------------------------------------------------

const statusSchema = z.object({
  name: z.string().trim().min(1).max(50),
  category: z.enum(STATUS_CATEGORIES),
  color: color,
});

export async function createStatus(
  projectId: string,
  input: z.input<typeof statusSchema>,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await adminContext();
  if (!ctx) return fail("forbidden");
  const parsed = statusSchema.safeParse(input);
  if (!idSchema.safeParse(projectId).success || !parsed.success) return fail("invalid");

  const { data: last } = await ctx.supabase
    .from("statuses")
    .select("position")
    .eq("project_id", projectId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle<{ position: number }>();
  const { data, error } = await ctx.supabase
    .from("statuses")
    .insert({ ...parsed.data, project_id: projectId, position: (last?.position ?? -1) + 1 })
    .select("id")
    .single<{ id: string }>();
  if (error) return fail(dbErrorCode(error));
  refresh();
  return ok(data);
}

export async function updateStatus(id: string, patch: Partial<z.input<typeof statusSchema>>): Promise<ActionResult> {
  const ctx = await adminContext();
  if (!ctx) return fail("forbidden");
  const parsed = statusSchema.partial().strict().safeParse(patch);
  if (!idSchema.safeParse(id).success || !parsed.success) return fail("invalid");
  const { error } = await ctx.supabase.from("statuses").update(parsed.data).eq("id", id);
  if (error) return fail(dbErrorCode(error));
  refresh();
  return ok(undefined);
}

/** Rewrites positions to match the given order of status ids. */
export async function reorderStatuses(projectId: string, orderedIds: string[]): Promise<ActionResult> {
  const ctx = await adminContext();
  if (!ctx) return fail("forbidden");
  if (!idSchema.safeParse(projectId).success || !z.array(idSchema).min(1).safeParse(orderedIds).success) {
    return fail("invalid");
  }
  for (const [position, id] of orderedIds.entries()) {
    const { error } = await ctx.supabase.from("statuses").update({ position }).eq("id", id).eq("project_id", projectId);
    if (error) return fail(dbErrorCode(error));
  }
  refresh();
  return ok(undefined);
}

/** Deletes a status, moving its issues to `targetId` first (required when it has issues). */
export async function deleteStatus(id: string, targetId: string | null): Promise<ActionResult<{ moved: number }>> {
  const ctx = await adminContext();
  if (!ctx) return fail("forbidden");
  if (!idSchema.safeParse(id).success || (targetId !== null && !idSchema.safeParse(targetId).success)) {
    return fail("invalid");
  }
  const { data, error } = await ctx.supabase.rpc("delete_status", { p_status_id: id, p_target_status_id: targetId });
  if (error) return fail(dbErrorCode(error));
  refresh();
  return ok({ moved: data as number });
}
