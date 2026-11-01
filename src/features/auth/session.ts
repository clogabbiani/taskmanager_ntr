import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import type { WorkspaceRole } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

export type CurrentMember = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: WorkspaceRole;
  workspaceId: string;
  workspaceName: string;
};

type MembershipRow = {
  role: WorkspaceRole;
  workspace_id: string;
  workspaces: { name: string } | null;
  users: { id: string; email: string; display_name: string; avatar_url: string | null } | null;
};

/**
 * Resolves the signed-in user and their workspace membership (Phase 1 has a
 * single workspace). Redirects to /login without a session and to /auth/reject
 * when the session has no membership.
 */
export const requireMember = cache(async (): Promise<CurrentMember> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("workspace_members")
    .select("role, workspace_id, workspaces(name), users(id, email, display_name, avatar_url)")
    .eq("user_id", user.id)
    .order("joined_at")
    .limit(1)
    .maybeSingle<MembershipRow>();

  if (!data?.users || !data.workspaces) redirect("/auth/reject");

  return {
    id: data.users.id,
    email: data.users.email,
    displayName: data.users.display_name,
    avatarUrl: data.users.avatar_url,
    role: data.role,
    workspaceId: data.workspace_id,
    workspaceName: data.workspaces.name,
  };
});

/** Workspace admin or owner; others are sent to their profile page (CLAUDE.md §4). */
export async function requireAdmin(): Promise<CurrentMember> {
  const member = await requireMember();
  if (member.role !== "owner" && member.role !== "admin") redirect("/settings/profile");
  return member;
}
