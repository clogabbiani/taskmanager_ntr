"use server";

/** Workspace labels (admin/owner create and manage; members only pick, CLAUDE.md §5.1). */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canAdmin } from "@/features/auth/permissions";
import { requireMember } from "@/features/auth/session";
import { dbErrorCode, fail, ok, type ActionResult } from "@/lib/action";
import { createClient } from "@/lib/supabase/server";

const idSchema = z.uuid();
const labelSchema = z.object({
  name: z.string().trim().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

async function adminContext() {
  const member = await requireMember();
  if (!canAdmin(member.role)) return null;
  return { member, supabase: await createClient() };
}

export async function createLabel(input: z.input<typeof labelSchema>): Promise<ActionResult<{ id: string }>> {
  const ctx = await adminContext();
  if (!ctx) return fail("forbidden");
  const parsed = labelSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const { data, error } = await ctx.supabase
    .from("labels")
    .insert({ ...parsed.data, workspace_id: ctx.member.workspaceId })
    .select("id")
    .single<{ id: string }>();
  if (error) return fail(dbErrorCode(error));
  revalidatePath("/settings", "layout");
  return ok(data);
}

export async function updateLabel(id: string, patch: Partial<z.input<typeof labelSchema>>): Promise<ActionResult> {
  const ctx = await adminContext();
  if (!ctx) return fail("forbidden");
  const parsed = labelSchema.partial().strict().safeParse(patch);
  if (!idSchema.safeParse(id).success || !parsed.success) return fail("invalid");
  const { error } = await ctx.supabase.from("labels").update(parsed.data).eq("id", id);
  if (error) return fail(dbErrorCode(error));
  revalidatePath("/settings", "layout");
  return ok(undefined);
}

/** Moves every assignment of `sourceId` to `targetId`, then deletes the source label. */
export async function mergeLabels(sourceId: string, targetId: string): Promise<ActionResult<{ moved: number }>> {
  const ctx = await adminContext();
  if (!ctx) return fail("forbidden");
  if (!idSchema.safeParse(sourceId).success || !idSchema.safeParse(targetId).success || sourceId === targetId) {
    return fail("invalid");
  }
  const { data, error } = await ctx.supabase.rpc("merge_labels", { p_source: sourceId, p_target: targetId });
  if (error) return fail(dbErrorCode(error));
  revalidatePath("/settings", "layout");
  return ok({ moved: data as number });
}

export async function deleteLabel(id: string): Promise<ActionResult> {
  const ctx = await adminContext();
  if (!ctx) return fail("forbidden");
  if (!idSchema.safeParse(id).success) return fail("invalid");
  const { error } = await ctx.supabase.from("labels").delete().eq("id", id);
  if (error) return fail(dbErrorCode(error));
  revalidatePath("/settings", "layout");
  return ok(undefined);
}
