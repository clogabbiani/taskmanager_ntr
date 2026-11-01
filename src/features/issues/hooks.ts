"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useApp } from "@/components/app-shell/app-context";
import { it } from "@/i18n/it";
import type { ActionResult, ErrorCode } from "@/lib/action";
import { useSupabase } from "@/lib/supabase/use-supabase";
import { updateIssue } from "./actions";
import type { IssuePatch, IssueRow } from "./model";
import {
  fetchCollaboratorNames,
  fetchIssueByKey,
  fetchLabels,
  fetchMembers,
  fetchStatuses,
  queryKeys,
} from "./queries";

export class ActionError extends Error {
  constructor(public code: ErrorCode) {
    super(code);
  }
}

/** Unwraps an action result for TanStack Query (throws ActionError on failure). */
export async function unwrap<T>(result: Promise<ActionResult<T>>): Promise<T> {
  const r = await result;
  if (!r.ok) throw new ActionError(r.error);
  return r.data;
}

export function errorMessage(error: unknown): string {
  return error instanceof ActionError ? it.errors[error.code] : it.errors.generic;
}

export function toastError(error: unknown) {
  toast.error(errorMessage(error));
}

/** Refetches every issue-derived query (lists, details, children, links, activity). */
export function invalidateIssues(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: ["issues"] });
  void qc.invalidateQueries({ queryKey: ["issue"] });
  void qc.invalidateQueries({ queryKey: ["search"] });
}

function applyPatch(row: IssueRow, patch: IssuePatch): IssueRow {
  const next = { ...row, ...patch } as IssueRow;
  if (patch.progress !== undefined && row.type !== "epic") next.computed_progress = patch.progress;
  return next;
}

/** Applies a patch to every cached copy of an issue; returns a rollback. */
function patchCaches(qc: QueryClient, id: string, patch: IssuePatch) {
  const snapshots: [readonly unknown[], unknown][] = [];
  for (const [key, data] of qc.getQueriesData<unknown>({ queryKey: ["issues"] })) {
    if (!Array.isArray(data)) continue;
    snapshots.push([key, data]);
    qc.setQueryData(
      key,
      (data as IssueRow[]).map((r) => (r.id === id ? applyPatch(r, patch) : r)),
    );
  }
  for (const [key, data] of qc.getQueriesData<unknown>({ queryKey: ["issue"] })) {
    if (!data || Array.isArray(data) || (data as { id?: string }).id !== id) continue;
    snapshots.push([key, data]);
    qc.setQueryData(key, applyPatch(data as IssueRow, patch));
  }
  return () => snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
}

/** Inline edit with optimistic update and error toast. */
export function useUpdateIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: IssuePatch }) => unwrap(updateIssue(id, patch)),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: ["issues"] });
      await qc.cancelQueries({ queryKey: ["issue"] });
      return { rollback: patchCaches(qc, id, patch) };
    },
    onError: (error, _vars, context) => {
      context?.rollback();
      toastError(error);
    },
    onSettled: () => invalidateIssues(qc),
  });
}

export function useIssue(projectKey: string, number: number) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: queryKeys.issue(projectKey, number),
    queryFn: () => fetchIssueByKey(supabase, projectKey, number),
  });
}

export function useStatuses(projectId: string | undefined) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: queryKeys.statuses(projectId ?? ""),
    queryFn: () => fetchStatuses(supabase, projectId!),
    enabled: Boolean(projectId),
    staleTime: 5 * 60_000,
  });
}

export function useMembers() {
  const supabase = useSupabase();
  const { member } = useApp();
  return useQuery({
    queryKey: queryKeys.members(member.workspaceId),
    queryFn: () => fetchMembers(supabase, member.workspaceId),
    staleTime: 5 * 60_000,
  });
}

export function useLabels() {
  const supabase = useSupabase();
  const { member } = useApp();
  return useQuery({
    queryKey: queryKeys.labels(member.workspaceId),
    queryFn: () => fetchLabels(supabase, member.workspaceId),
    staleTime: 60_000,
  });
}

export function useCollaboratorNames() {
  const supabase = useSupabase();
  const { member } = useApp();
  return useQuery({
    queryKey: queryKeys.collaborators(member.workspaceId),
    queryFn: () => fetchCollaboratorNames(supabase, member.workspaceId),
    staleTime: 60_000,
  });
}
