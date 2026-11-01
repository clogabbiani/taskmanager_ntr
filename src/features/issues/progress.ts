/**
 * Epic progress (CLAUDE.md §3.3): derived, never stored. Mirrors the SQL
 * function public.computed_progress in drizzle/0003_m1_rls_and_functions.sql.
 *
 * Average of the non-archived direct children weighted by planned_days, over
 * the children with planned_days > 0; simple average when none has planned
 * days; 0 without children.
 */
export type ProgressChild = { progress: number; planned_days: number | null; archived_at?: string | null };

export function computeEpicProgress(children: readonly ProgressChild[]): number {
  const active = children.filter((c) => !c.archived_at);
  if (active.length === 0) return 0;

  const weighted = active.filter((c) => (c.planned_days ?? 0) > 0);
  if (weighted.length > 0) {
    const days = weighted.reduce((sum, c) => sum + c.planned_days!, 0);
    const done = weighted.reduce((sum, c) => sum + c.progress * c.planned_days!, 0);
    return Math.round(done / days);
  }
  return Math.round(active.reduce((sum, c) => sum + c.progress, 0) / active.length);
}

/** Effective progress of any issue given its children (epics) or its own value. */
export function effectiveProgress(
  issue: { type: string; progress: number },
  children: readonly ProgressChild[],
): number {
  return issue.type === "epic" ? computeEpicProgress(children) : issue.progress;
}
