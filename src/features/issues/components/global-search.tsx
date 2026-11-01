"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { it } from "@/i18n/it";
import { useSupabase } from "@/lib/supabase/use-supabase";
import { useDebounced } from "@/lib/use-debounced";
import { queryKeys, searchIssues, type SearchResult } from "../queries";
import { IssueTypeIcon } from "./bits";

/** Ctrl/Cmd+K: key, title and Italian full-text search across readable issues (§5.1). */
export function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const supabase = useSupabase();
  const [query, setQuery] = useState("");
  const q = useDebounced(query.trim(), 200);
  const { data: results = [], isFetching } = useQuery({
    queryKey: queryKeys.search(q),
    queryFn: () => searchIssues(supabase, q, 30),
    enabled: open && q.length >= 2,
  });

  const groups = new Map<string, SearchResult[]>();
  for (const r of results) groups.set(r.project_key, [...(groups.get(r.project_key) ?? []), r]);

  const go = (r: SearchResult) => {
    onOpenChange(false);
    setQuery("");
    router.push(`/p/${r.project_key}/issues/${r.project_key}-${r.issue_number}`);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={it.search.title}
      description={it.search.description}
      className="sm:max-w-xl"
    >
      <Command shouldFilter={false}>
        <CommandInput placeholder={it.search.placeholder} value={query} onValueChange={setQuery} />
        <CommandList>
          {q.length < 2 ? (
            <p className="text-muted-foreground px-3 py-6 text-center text-sm">{it.search.hint}</p>
          ) : isFetching && results.length === 0 ? (
            <p className="text-muted-foreground px-3 py-6 text-center text-sm">{it.search.loading}</p>
          ) : (
            <CommandEmpty>{it.search.empty}</CommandEmpty>
          )}
          {[...groups].map(([projectKey, items]) => (
            <CommandGroup key={projectKey} heading={projectKey}>
              {items.map((r) => (
                <CommandItem key={r.issue_id} value={r.issue_id} onSelect={() => go(r)}>
                  <IssueTypeIcon type={r.issue_type} />
                  <span className="text-muted-foreground font-mono text-xs">
                    {r.project_key}-{r.issue_number}
                  </span>
                  <span className={r.is_archived ? "truncate line-through" : "truncate"}>{r.title}</span>
                  {r.is_archived ? (
                    <span className="text-muted-foreground ml-auto text-xs">{it.search.archived}</span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
