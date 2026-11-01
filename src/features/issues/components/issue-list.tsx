"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { it } from "@/i18n/it";
import { useSupabase } from "@/lib/supabase/use-supabase";
import { useMembers, useStatuses } from "../hooks";
import { fetchProjectIssues, queryKeys } from "../queries";
import { AvatarStack, IssueTypeIcon, ProgressBar, StatusBadge } from "./bits";

/** Plain issue list for a project (interim view until the Table view lands). */
export function IssueList({ projectId, projectKey }: { projectId: string; projectKey: string }) {
  const supabase = useSupabase();
  const { data: issues = [], isLoading } = useQuery({
    queryKey: queryKeys.projectIssues(projectId, false),
    queryFn: () => fetchProjectIssues(supabase, projectId),
  });
  const { data: statuses = [] } = useStatuses(projectId);
  const { data: members = [] } = useMembers();

  if (isLoading) return <p className="text-muted-foreground text-sm">{it.issue.loading}</p>;
  if (issues.length === 0) return <p className="text-muted-foreground text-sm">{it.issue.children.empty}</p>;

  return (
    <ul className="divide-y rounded-lg border">
      {issues.map((issue) => {
        const key = `${projectKey}-${issue.number}`;
        return (
          <li key={issue.id}>
            <Link
              href={`/p/${projectKey}/issues/${key}`}
              className="hover:bg-muted/50 focus-visible:ring-ring grid grid-cols-[auto_auto_1fr_auto] items-center gap-3 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset sm:grid-cols-[auto_auto_1fr_auto_auto_8rem]"
            >
              <IssueTypeIcon type={issue.type} />
              <span className="text-muted-foreground font-mono text-xs">{key}</span>
              <span className="truncate">{issue.title}</span>
              <StatusBadge status={statuses.find((s) => s.id === issue.status_id)} />
              <span className="hidden sm:block">
                <AvatarStack users={members.filter((m) => issue.assignee_ids.includes(m.id))} max={2} />
              </span>
              <ProgressBar value={issue.computed_progress} className="hidden sm:flex" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
