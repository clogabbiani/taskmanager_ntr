import type { SupabaseClient } from "@supabase/supabase-js";
import type { SavedViewKind } from "@/db/schema";
import { viewConfigSchema, type ViewConfig } from "./filters";

export type SavedView = {
  id: string;
  project_id: string | null;
  owner_id: string;
  name: string;
  kind: SavedViewKind;
  config: ViewConfig;
  is_shared: boolean;
};

export const savedViewsKey = (workspaceId: string) => ["saved-views", workspaceId] as const;

/** Views the user can see: their own plus shared ones (RLS). */
export async function fetchSavedViews(supabase: SupabaseClient, workspaceId: string): Promise<SavedView[]> {
  const { data, error } = await supabase
    .from("saved_views")
    .select("id, project_id, owner_id, name, kind, config, is_shared")
    .eq("workspace_id", workspaceId)
    .order("name");
  if (error) throw error;
  return (data as (Omit<SavedView, "config"> & { config: unknown })[]).map((v) => ({
    ...v,
    config: viewConfigSchema.catch({ query: "" }).parse(v.config),
  }));
}
