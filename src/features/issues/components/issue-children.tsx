"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { it } from "@/i18n/it";
import { useSupabase } from "@/lib/supabase/use-supabase";
import { cn } from "@/lib/utils";
import { createIssue, reorderIssue } from "../actions";
import { invalidateIssues, toastError, unwrap, useMembers } from "../hooks";
import { CHILD_TYPE, type IssueRow, type StatusRow } from "../model";
import { computeEpicProgress } from "../progress";
import { fetchChildren, queryKeys } from "../queries";
import { AvatarStack, IssueTypeIcon, ProgressBar, StatusBadge } from "./bits";

function ChildRow({
  child,
  projectKey,
  status,
  canReorder,
}: {
  child: IssueRow;
  projectKey: string;
  status: StatusRow | undefined;
  canReorder: boolean;
}) {
  const { data: members = [] } = useMembers();
  const sortable = useSortable({ id: child.id, disabled: !canReorder });
  const style = { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition };
  const assignees = members.filter((m) => child.assignee_ids.includes(m.id));
  const key = `${projectKey}-${child.number}`;

  return (
    <li
      ref={sortable.setNodeRef}
      style={style}
      className={cn(
        "bg-background grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-md border px-2 py-1.5 text-sm sm:grid-cols-[auto_1fr_auto_auto_7rem]",
        sortable.isDragging && "z-10 shadow-md",
        child.archived_at && "opacity-60",
      )}
    >
      {canReorder ? (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring cursor-grab touch-none rounded outline-none focus-visible:ring-2"
          aria-label={`${it.issue.children.reorder}: ${key}`}
          {...sortable.attributes}
          {...sortable.listeners}
        >
          <GripVertical className="size-4" />
        </button>
      ) : (
        <IssueTypeIcon type={child.type} />
      )}
      <Link
        href={`/p/${projectKey}/issues/${key}`}
        className="focus-visible:ring-ring flex min-w-0 items-center gap-2 rounded outline-none hover:underline focus-visible:ring-2"
      >
        <span className="text-muted-foreground font-mono text-xs">{key}</span>
        <span className={cn("truncate", child.archived_at && "line-through")}>{child.title}</span>
      </Link>
      <StatusBadge status={status} />
      <span className="hidden sm:block">
        <AvatarStack users={assignees} max={2} />
      </span>
      <ProgressBar value={child.computed_progress} className="hidden sm:flex" />
    </li>
  );
}

export function IssueChildren({
  issue,
  projectKey,
  statuses,
  canEdit,
}: {
  issue: IssueRow;
  projectKey: string;
  statuses: StatusRow[];
  canEdit: boolean;
}) {
  const childType = CHILD_TYPE[issue.type];
  const supabase = useSupabase();
  const qc = useQueryClient();
  const { data: children = [] } = useQuery({
    queryKey: queryKeys.children(issue.id),
    queryFn: () => fetchChildren(supabase, issue.id),
    enabled: childType !== null,
  });
  const [order, setOrder] = useState<IssueRow[]>([]);
  useEffect(() => setOrder(children), [children]);
  const [title, setTitle] = useState("");

  const create = useMutation({
    mutationFn: (t: string) =>
      unwrap(createIssue({ project_id: issue.project_id, type: childType!, title: t, parent_id: issue.id })),
    onSuccess: () => setTitle(""),
    onError: toastError,
    onSettled: () => invalidateIssues(qc),
  });

  const reorder = useMutation({
    mutationFn: (v: { id: string; before: string | null; after: string | null }) =>
      unwrap(reorderIssue(v.id, v.before, v.after)),
    onError: (e) => {
      setOrder(children);
      toastError(e);
    },
    onSettled: () => invalidateIssues(qc),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!childType) return null;

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = order.findIndex((c) => c.id === active.id);
    const to = order.findIndex((c) => c.id === over.id);
    const next = arrayMove(order, from, to);
    setOrder(next);
    reorder.mutate({ id: String(active.id), before: next[to - 1]?.id ?? null, after: next[to + 1]?.id ?? null });
  };

  const statusById = new Map(statuses.map((s) => [s.id, s]));
  const aggregate = issue.type === "epic" ? issue.computed_progress : computeEpicProgress(children);

  return (
    <section className="flex flex-col gap-2" aria-labelledby={`children-${issue.id}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 id={`children-${issue.id}`} className="text-sm font-semibold">
          {it.issue.children[issue.type === "epic" ? "epic" : "task"]}{" "}
          <span className="text-muted-foreground font-normal">({children.length})</span>
        </h3>
        {children.length > 0 ? (
          <span className="flex w-48 items-center gap-2 text-xs">
            <span className="text-muted-foreground sr-only">{it.issue.children.aggregate}</span>
            <ProgressBar value={aggregate} className="flex-1" />
          </span>
        ) : null}
      </div>

      {order.length === 0 ? (
        <p className="text-muted-foreground text-sm">{it.issue.children.empty}</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={order.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col gap-1">
              {order.map((c) => (
                <ChildRow
                  key={c.id}
                  child={c}
                  projectKey={projectKey}
                  status={statusById.get(c.status_id)}
                  canReorder={canEdit}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {canEdit ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim()) create.mutate(title.trim());
          }}
        >
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={it.issue.children.placeholder}
            aria-label={`${it.issue.children.add}: ${it.issue.types[childType]}`}
            className="h-8"
            disabled={create.isPending}
          />
          <Button type="submit" size="sm" variant="outline" disabled={!title.trim() || create.isPending}>
            <Plus />
            {it.issue.children.add}
          </Button>
        </form>
      ) : null}
    </section>
  );
}
