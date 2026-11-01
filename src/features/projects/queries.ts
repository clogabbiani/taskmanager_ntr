import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type ProjectSummary = {
  id: string;
  key: string;
  name: string;
  color: string;
  is_private: boolean;
};

const PROJECT_SUMMARY_COLUMNS = "id, key, name, color, is_private";

/** Projects visible to the current user (RLS hides private ones they are not in). */
export const listProjects = cache(async (workspaceId: string): Promise<ProjectSummary[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_SUMMARY_COLUMNS)
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .order("key")
    .returns<ProjectSummary[]>();
  if (error) throw error;
  return data ?? [];
});

export const getProjectByKey = cache(async (workspaceId: string, key: string): Promise<ProjectSummary | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_SUMMARY_COLUMNS)
    .eq("workspace_id", workspaceId)
    .eq("key", key.toUpperCase())
    .maybeSingle<ProjectSummary>();
  if (error) throw error;
  return data;
});
