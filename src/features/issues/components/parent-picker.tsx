"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { it } from "@/i18n/it";
import { useSupabase } from "@/lib/supabase/use-supabase";
import { cn } from "@/lib/utils";
import { PARENT_TYPE, type IssueType } from "../model";
import { fetchParentCandidates, queryKeys } from "../queries";
import { IssueTypeIcon } from "./bits";

/** Picks the parent of an issue of `type` among the project's epics (tasks) or tasks (subtasks). */
export function ParentPicker({
  projectId,
  projectKey,
  type,
  value,
  excludeId,
  onChange,
  disabled,
  className,
}: {
  projectId: string;
  projectKey: string;
  type: IssueType;
  value: string | null;
  excludeId?: string;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const supabase = useSupabase();
  const parentType = PARENT_TYPE[type];
  const { data: candidates = [] } = useQuery({
    queryKey: queryKeys.parents(projectId, parentType ?? "epic"),
    queryFn: () => fetchParentCandidates(supabase, projectId, parentType!),
    enabled: Boolean(parentType),
  });
  if (!parentType) return <span className="text-muted-foreground px-2 text-sm">{it.issue.none}</span>;

  const current = candidates.find((c) => c.id === value);
  const options = candidates.filter((c) => c.id !== excludeId);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          className={cn("h-8 w-full justify-start gap-2 px-2 font-normal", className)}
          aria-label={it.issue.fields.parent}
        >
          {current ? (
            <>
              <IssueTypeIcon type={current.type} />
              <span className="text-muted-foreground font-mono text-xs">
                {projectKey}-{current.number}
              </span>
              <span className="truncate">{current.title}</span>
            </>
          ) : (
            <span className="text-muted-foreground">{it.issue.parentPicker.none}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command>
          <CommandInput placeholder={it.issue.parentPicker.search} />
          <CommandList>
            <CommandEmpty>{it.issue.noResults}</CommandEmpty>
            <CommandGroup>
              {type === "task" ? (
                <CommandItem
                  value="__none__"
                  onSelect={() => {
                    setOpen(false);
                    if (value !== null) onChange(null);
                  }}
                >
                  <span className="text-muted-foreground">{it.issue.parentPicker.none}</span>
                  <Check className={cn("ml-auto", value === null ? "opacity-100" : "opacity-0")} />
                </CommandItem>
              ) : null}
              {options.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${projectKey}-${c.number} ${c.title}`}
                  onSelect={() => {
                    setOpen(false);
                    if (c.id !== value) onChange(c.id);
                  }}
                >
                  <IssueTypeIcon type={c.type} />
                  <span className="text-muted-foreground font-mono text-xs">
                    {projectKey}-{c.number}
                  </span>
                  <span className="truncate">{c.title}</span>
                  <Check className={cn("ml-auto", c.id === value ? "opacity-100" : "opacity-0")} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
