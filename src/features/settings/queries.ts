import "server-only";

import type { Role, StatusRow, UserRow } from "@/features/issues/model";
import { createClient } from "@/lib/supabase/server";

export type MemberWithRole = UserRow & { role: Role; joined_at: string };

export async function listMembers(workspaceId: string): Promise<MemberWithRole[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspace_members")
    .select("role, joined_at, users(id, display_name, email, avatar_url)")
    .eq("workspace_id", workspaceId);
  if (error) throw error;
  const order: Role[] = ["owner", "admin", "member", "viewer"];
  return (data as unknown as { role: Role; joined_at: string; users: UserRow | null }[])
    .filter((r) => r.users)
    .map((r) => ({ ...r.users!, role: r.role, joined_at: r.joined_at }))
    .sort(
      (a, b) => order.indexOf(a.role) - order.indexOf(b.role) || a.display_name.localeCompare(b.display_name, "it"),
    );
}

export type AllowedSignin = { id: string; kind: "domain" | "email"; value: string };

export async function listAllowedSignins(workspaceId: string): Promise<AllowedSignin[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("allowed_signins")
    .select("id, kind, value")
    .eq("workspace_id", workspaceId)
    .order("kind")
    .order("value");
  if (error) throw error;
  return data as AllowedSignin[];
}

export type LabelWithUsage = { id: string; name: string; color: string; issue_count: number };

export async function listLabelsWithUsage(workspaceId: string): Promise<LabelWithUsage[]> {
  const supabase = await createClient();
  const [labels, usage] = await Promise.all([
    supabase.from("labels").select("id, name, color").eq("workspace_id", workspaceId).order("name"),
    supabase.rpc("label_usage", { p_workspace_id: workspaceId }),
  ]);
  if (labels.error) throw labels.error;
  if (usage.error) throw usage.error;
  const counts = new Map(
    (usage.data as { label_id: string; issue_count: number }[]).map((u) => [u.label_id, u.issue_count]),
  );
  return (labels.data as Omit<LabelWithUsage, "issue_count">[]).map((l) => ({
    ...l,
    issue_count: counts.get(l.id) ?? 0,
  }));
}

export type ProjectConfig = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  color: string;
  is_private: boolean;
  archived_at: string | null;
  member_ids: string[];
};

const PROJECT_COLUMNS = "id, key, name, description, color, is_private, archived_at, project_members(user_id)";

type RawProject = Omit<ProjectConfig, "member_ids"> & { project_members: { user_id: string }[] };

const toConfig = ({ project_members, ...p }: RawProject): ProjectConfig => ({
  ...p,
  member_ids: project_members.map((m) => m.user_id),
});

/** Every project visible as configuration (admins see private ones too, ADR-004), archived included. */
export async function listProjectConfigs(workspaceId: string): Promise<ProjectConfig[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("archived_at", { nullsFirst: true })
    .order("key");
  if (error) throw error;
  return (data as unknown as RawProject[]).map(toConfig);
}

export async function getProjectConfig(
  workspaceId: string,
  key: string,
): Promise<{ project: ProjectConfig; statuses: StatusRow[]; issueCounts: Record<string, number> } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_COLUMNS)
    .eq("workspace_id", workspaceId)
    .eq("key", key.toUpperCase())
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const project = toConfig(data as unknown as RawProject);
  const [statuses, issues] = await Promise.all([
    supabase
      .from("statuses")
      .select("id, project_id, name, category, position, color")
      .eq("project_id", project.id)
      .order("position"),
    supabase.from("issues").select("status_id").eq("project_id", project.id),
  ]);
  if (statuses.error) throw statuses.error;
  const issueCounts: Record<string, number> = {};
  for (const r of (issues.data ?? []) as { status_id: string }[]) {
    issueCounts[r.status_id] = (issueCounts[r.status_id] ?? 0) + 1;
  }
  return { project, statuses: statuses.data as StatusRow[], issueCounts };
}
