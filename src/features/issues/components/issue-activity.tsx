"use client";

import { useQuery } from "@tanstack/react-query";
import { it } from "@/i18n/it";
import { formatDateTime, formatRelative } from "@/lib/dates";
import { useSupabase } from "@/lib/supabase/use-supabase";
import { describeActivity, referencedIssueIds, type ActivityLookups } from "../activity-format";
import { useLabels, useMembers } from "../hooks";
import type { StatusRow } from "../model";
import { fetchActivity, queryKeys } from "../queries";
import { UserAvatar } from "./bits";

export function IssueActivity({ issueId, statuses }: { issueId: string; statuses: StatusRow[] }) {
  const supabase = useSupabase();
  const { data: members = [] } = useMembers();
  const { data: labels = [] } = useLabels();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: queryKeys.activity(issueId),
    queryFn: () => fetchActivity(supabase, issueId),
  });
  const refs = referencedIssueIds(rows);
  const { data: keys = new Map<string, string>() } = useQuery({
    queryKey: ["issue", "keys", refs.sort().join()],
    queryFn: async () => {
      const { data } = await supabase.from("issues").select("id, number, projects(key)").in("id", refs);
      return new Map(
        ((data ?? []) as unknown as { id: string; number: number; projects: { key: string } | null }[]).map((r) => [
          r.id,
          `${r.projects?.key ?? ""}-${r.number}`,
        ]),
      );
    },
    enabled: refs.length > 0,
  });

  if (isLoading) return <p className="text-muted-foreground text-sm">{it.issue.loading}</p>;
  if (rows.length === 0) return <p className="text-muted-foreground text-sm">{it.activity.empty}</p>;

  const userById = new Map(members.map((m) => [m.id, m]));
  const lookups: ActivityLookups = {
    user: (id) => userById.get(id)?.display_name,
    status: (id) => statuses.find((s) => s.id === id)?.name,
    label: (id) => labels.find((l) => l.id === id)?.name,
    issueKey: (id) => keys.get(id),
  };

  return (
    <ol className="flex flex-col gap-3">
      {rows.map((row) => {
        const actor = row.actor_id ? userById.get(row.actor_id) : undefined;
        return (
          <li key={row.id} className="flex items-start gap-2 text-sm">
            {actor ? <UserAvatar user={actor} className="mt-0.5 size-5" /> : <span className="size-5" />}
            <p className="min-w-0 flex-1">
              {describeActivity(row, lookups)}
              <span className="text-muted-foreground"> · </span>
              <time dateTime={row.created_at} title={formatDateTime(row.created_at)} className="text-muted-foreground">
                {formatRelative(row.created_at)}
              </time>
            </p>
          </li>
        );
      })}
    </ol>
  );
}
