"use server";

/** Workspace members, roles and allow-list (admin/owner, CLAUDE.md §4). */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canAdmin, canChangeRole } from "@/features/auth/permissions";
import { requireMember } from "@/features/auth/session";
import { WORKSPACE_ROLES, type Role } from "@/features/issues/model";
import { dbErrorCode, fail, ok, type ActionResult } from "@/lib/action";
import { createClient } from "@/lib/supabase/server";

const idSchema = z.uuid();

async function currentRole(supabase: Awaited<ReturnType<typeof createClient>>, workspaceId: string, userId: string) {
  const { data } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle<{ role: Role }>();
  return data?.role ?? null;
}

export async function changeMemberRole(userId: string, role: Role): Promise<ActionResult> {
  const member = await requireMember();
  if (!idSchema.safeParse(userId).success || !z.enum(WORKSPACE_ROLES).safeParse(role).success) return fail("invalid");
  if (userId === member.id) return fail("forbidden");
  const supabase = await createClient();
  const target = await currentRole(supabase, member.workspaceId, userId);
  if (!target) return fail("not_found");
  if (!canChangeRole(member.role, target, role)) return fail(target === "owner" ? "owner_protected" : "forbidden");

  const { error } = await supabase
    .from("workspace_members")
    .update({ role })
    .eq("workspace_id", member.workspaceId)
    .eq("user_id", userId);
  if (error) return fail(dbErrorCode(error));
  revalidatePath("/settings", "layout");
  return ok(undefined);
}

export async function removeMember(userId: string): Promise<ActionResult> {
  const member = await requireMember();
  if (!canAdmin(member.role)) return fail("forbidden");
  if (!idSchema.safeParse(userId).success) return fail("invalid");
  if (userId === member.id) return fail("forbidden");
  const supabase = await createClient();
  const target = await currentRole(supabase, member.workspaceId, userId);
  if (!target) return fail("not_found");
  if (target === "owner") return fail("owner_protected");

  const { error } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", member.workspaceId)
    .eq("user_id", userId);
  if (error) return fail(dbErrorCode(error));
  revalidatePath("/settings", "layout");
  return ok(undefined);
}

const signinSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("domain"),
    value: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/),
  }),
  z.object({ kind: z.literal("email"), value: z.string().trim().toLowerCase().pipe(z.email()) }),
]);

export async function addAllowedSignin(input: z.input<typeof signinSchema>): Promise<ActionResult<{ id: string }>> {
  const member = await requireMember();
  if (!canAdmin(member.role)) return fail("forbidden");
  const parsed = signinSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("allowed_signins")
    .insert({ ...parsed.data, workspace_id: member.workspaceId })
    .select("id")
    .single<{ id: string }>();
  if (error) return fail(dbErrorCode(error));
  revalidatePath("/settings", "layout");
  return ok(data);
}

export async function removeAllowedSignin(id: string): Promise<ActionResult> {
  const member = await requireMember();
  if (!canAdmin(member.role)) return fail("forbidden");
  if (!idSchema.safeParse(id).success) return fail("invalid");
  const supabase = await createClient();
  const { error } = await supabase.from("allowed_signins").delete().eq("id", id);
  if (error) return fail(dbErrorCode(error));
  revalidatePath("/settings", "layout");
  return ok(undefined);
}

export async function updateProfile(input: { display_name: string }): Promise<ActionResult> {
  const member = await requireMember();
  const parsed = z.object({ display_name: z.string().trim().min(1).max(100) }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const supabase = await createClient();
  const { error } = await supabase.from("users").update(parsed.data).eq("id", member.id);
  if (error) return fail(dbErrorCode(error));
  revalidatePath("/", "layout");
  return ok(undefined);
}
