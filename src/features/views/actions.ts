"use server";

/** Saved views (CLAUDE.md §5.2): personal or shared; shared ones edited by author and admins. */
import { z } from "zod";
import { canEditView, canWrite } from "@/features/auth/permissions";
import { requireMember } from "@/features/auth/session";
import { dbErrorCode, fail, ok, type ActionResult } from "@/lib/action";
import { createClient } from "@/lib/supabase/server";
import { viewConfigSchema, type ViewConfig } from "./filters";

const idSchema = z.uuid();
const createSchema = z.object({
  project_id: idSchema.nullable(),
  name: z.string().trim().min(1).max(80),
  kind: z.enum(["board", "table", "timeline", "calendar"]).default("table"),
  config: viewConfigSchema,
  is_shared: z.boolean().default(false),
});

export async function createView(input: z.input<typeof createSchema>): Promise<ActionResult<{ id: string }>> {
  const member = await requireMember();
  if (!canWrite(member.role) && input.is_shared) return fail("forbidden");
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("saved_views")
    .insert({ ...parsed.data, workspace_id: member.workspaceId, owner_id: member.id })
    .select("id")
    .single<{ id: string }>();
  if (error) return fail(dbErrorCode(error));
  return ok(data);
}

const patchSchema = z
  .object({ name: z.string().trim().min(1).max(80), config: viewConfigSchema, is_shared: z.boolean() })
  .partial()
  .strict();

async function loadEditable(id: string) {
  const member = await requireMember();
  if (!idSchema.safeParse(id).success) return { error: "invalid" as const };
  const supabase = await createClient();
  const { data } = await supabase
    .from("saved_views")
    .select("id, owner_id, is_shared")
    .eq("id", id)
    .maybeSingle<{ id: string; owner_id: string; is_shared: boolean }>();
  if (!data) return { error: "not_found" as const };
  if (!canEditView(member.role, member.id, data)) return { error: "forbidden" as const };
  return { supabase, member, view: data };
}

export async function updateView(
  id: string,
  patch: { name?: string; config?: ViewConfig; is_shared?: boolean },
): Promise<ActionResult> {
  const ctx = await loadEditable(id);
  if ("error" in ctx) return fail(ctx.error!);
  const parsed = patchSchema.safeParse(patch);
  if (!parsed.success) return fail("invalid");
  // Only the author decides whether their view is shared.
  if (parsed.data.is_shared !== undefined && ctx.view.owner_id !== ctx.member.id) return fail("forbidden");
  const { error } = await ctx.supabase.from("saved_views").update(parsed.data).eq("id", id);
  if (error) return fail(dbErrorCode(error));
  return ok(undefined);
}

export async function deleteView(id: string): Promise<ActionResult> {
  const ctx = await loadEditable(id);
  if ("error" in ctx) return fail(ctx.error!);
  const { error } = await ctx.supabase.from("saved_views").delete().eq("id", id);
  if (error) return fail(dbErrorCode(error));
  return ok(undefined);
}
