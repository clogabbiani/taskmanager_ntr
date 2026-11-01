"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { it } from "@/i18n/it";
import { useSupabase } from "@/lib/supabase/use-supabase";
import { useDebounced } from "@/lib/use-debounced";
import { linkIssues, unlinkIssues } from "../actions";
import { invalidateIssues, toastError, unwrap } from "../hooks";
import type { IssueRow } from "../model";
import { queryKeys, searchIssues, type IssueLink } from "../queries";
import { IssueTypeIcon, StatusBadge } from "./bits";

type UiKind = "relates" | "blocks" | "blocked_by";

const uiKind = (l: IssueLink): UiKind =>
  l.kind === "relates" ? "relates" : l.direction === "outgoing" ? "blocks" : "blocked_by";

function AddLink({ issue, onDone }: { issue: IssueRow; onDone: () => void }) {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const [kind, setKind] = useState<UiKind>("relates");
  const [query, setQuery] = useState("");
  const q = useDebounced(query.trim(), 200);
  const { data: results = [] } = useQuery({
    queryKey: queryKeys.search(q),
    queryFn: () => searchIssues(supabase, q, 10),
    enabled: q.length >= 2,
  });

  const add = useMutation({
    mutationFn: (otherId: string) =>
      unwrap(
        kind === "blocked_by"
          ? linkIssues({ from_issue_id: otherId, to_issue_id: issue.id, kind: "blocks" })
          : linkIssues({ from_issue_id: issue.id, to_issue_id: otherId, kind }),
      ),
    onSuccess: onDone,
    onError: toastError,
    onSettled: () => invalidateIssues(qc),
  });

  return (
    <div className="flex flex-col gap-2 p-2">
      <Select value={kind} onValueChange={(v) => setKind(v as UiKind)}>
        <SelectTrigger size="sm" className="w-full" aria-label={it.issue.links.title}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(["relates", "blocks", "blocked_by"] as const).map((k) => (
            <SelectItem key={k} value={k}>
              {it.issue.links.kinds[k]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Command shouldFilter={false} className="rounded-md border">
        <CommandInput placeholder={it.issue.links.search} value={query} onValueChange={setQuery} />
        <CommandList>
          {q.length >= 2 ? <CommandEmpty>{it.issue.noResults}</CommandEmpty> : null}
          <CommandGroup>
            {results
              .filter((r) => r.issue_id !== issue.id)
              .map((r) => (
                <CommandItem key={r.issue_id} value={r.issue_id} onSelect={() => add.mutate(r.issue_id)}>
                  <IssueTypeIcon type={r.issue_type} />
                  <span className="text-muted-foreground font-mono text-xs">
                    {r.project_key}-{r.issue_number}
                  </span>
                  <span className="truncate">{r.title}</span>
                </CommandItem>
              ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  );
}

export function IssueLinks({ issue, links, canEdit }: { issue: IssueRow; links: IssueLink[]; canEdit: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const remove = useMutation({
    mutationFn: (id: string) => unwrap(unlinkIssues(id)),
    onError: toastError,
    onSettled: () => invalidateIssues(qc),
  });

  const groups = (["blocked_by", "blocks", "relates"] as const)
    .map((k) => ({ kind: k, items: links.filter((l) => uiKind(l) === k) }))
    .filter((g) => g.items.length > 0);

  return (
    <section className="flex flex-col gap-2" aria-labelledby={`links-${issue.id}`}>
      <div className="flex items-center justify-between">
        <h3 id={`links-${issue.id}`} className="text-sm font-semibold">
          {it.issue.links.title}
        </h3>
        {canEdit ? (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm">
                <Plus />
                {it.issue.links.add}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
              <AddLink issue={issue} onDone={() => setOpen(false)} />
            </PopoverContent>
          </Popover>
        ) : null}
      </div>
      {groups.length === 0 ? (
        <p className="text-muted-foreground text-sm">{it.issue.links.empty}</p>
      ) : (
        groups.map((g) => (
          <div key={g.kind} className="flex flex-col gap-1">
            <p className="text-muted-foreground text-xs font-medium">{it.issue.links.kinds[g.kind]}</p>
            <ul className="flex flex-col gap-1">
              {g.items.map((l) => {
                const key = `${l.other.project_key}-${l.other.number}`;
                return (
                  <li key={l.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
                    <Link
                      href={`/p/${l.other.project_key}/issues/${key}`}
                      className="focus-visible:ring-ring flex min-w-0 flex-1 items-center gap-2 rounded outline-none hover:underline focus-visible:ring-2"
                    >
                      <span className="text-muted-foreground font-mono text-xs">{key}</span>
                      <span className="truncate">{l.other.title}</span>
                    </Link>
                    <StatusBadge status={{ name: l.other.status_name, color: l.other.status_color }} />
                    {canEdit ? (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`${it.issue.links.remove}: ${key}`}
                        onClick={() => remove.mutate(l.id)}
                      >
                        <X />
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
