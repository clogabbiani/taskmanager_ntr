import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type ProjectSummary = {
  id: string;
  key: string;
  name: string;
  color: string;
  is_private: boolean;
  /** False for private projects the user sees only as configuration (admins, ADR-004). */
  can_read: boolean;
};

type ProjectRow = Omit<ProjectSummary, "can_read"> & { project_members: { user_id: string }[] };

const PROJECT_COLUMNS = "id, key, name, color, is_private, project_members(user_id)";

function toSummary(row: ProjectRow, userId: string): ProjectSummary {
  const { project_members, ...rest } = row;
  return { ...rest, can_read: !row.is_private || project_members.some((m) => m.user_id === userId) };
}

/**
 * Active projects whose issues the user can read (sidebar). Admins also see
 * private projects they are not members of through RLS: those are filtered
 * out here and shown only in Settings → Projects.
 */
export const listProjects = cache(async (workspaceId: string, userId: string): Promise<ProjectSummary[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_COLUMNS)
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .order("key")
    .returns<ProjectRow[]>();
  if (error) throw error;
  return (data ?? []).map((row) => toSummary(row, userId)).filter((p) => p.can_read);
});

export const getProjectByKey = cache(
  async (workspaceId: string, userId: string, key: string): Promise<ProjectSummary | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("projects")
      .select(PROJECT_COLUMNS)
      .eq("workspace_id", workspaceId)
      .eq("key", key.toUpperCase())
      .maybeSingle<ProjectRow>();
    if (error) throw error;
    return data ? toSummary(data, userId) : null;
  },
);
