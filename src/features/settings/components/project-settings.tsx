"use client";

import { useEffect, useState } from "react";
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
import { toast } from "sonner";
import { Archive, ArchiveRestore, GripVertical, Plus, Trash2, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserAvatar } from "@/features/issues/components/bits";
import { STATUS_CATEGORIES, type StatusCategory, type StatusRow, type UserRow } from "@/features/issues/model";
import {
  addProjectMember,
  createStatus,
  deleteStatus,
  removeProjectMember,
  reorderStatuses,
  setProjectArchived,
  updateProject,
  updateStatus,
} from "@/features/projects/actions";
import { t } from "@/i18n/format";
import { it } from "@/i18n/it";
import type { ProjectConfig } from "../queries";
import { ProjectFields, type ProjectFormValue } from "./projects-settings";
import { useRunAction } from "./use-run-action";

function CategorySelect({
  value,
  onChange,
  label,
}: {
  value: StatusCategory;
  onChange: (v: StatusCategory) => void;
  label: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as StatusCategory)}>
      <SelectTrigger size="sm" className="w-36" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUS_CATEGORIES.map((c) => (
          <SelectItem key={c} value={c}>
            {it.issue.categories[c]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function StatusItem({ status, others, count }: { status: StatusRow; others: StatusRow[]; count: number }) {
  const { run, pending } = useRunAction();
  const sortable = useSortable({ id: status.id });
  const [name, setName] = useState(status.name);
  const [color, setColor] = useState(status.color);
  const [target, setTarget] = useState("");
  useEffect(() => setName(status.name), [status.name]);
  useEffect(() => setColor(status.color), [status.color]);

  return (
    <li
      ref={sortable.setNodeRef}
      style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }}
      className="bg-background flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5"
    >
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring cursor-grab touch-none rounded outline-none focus-visible:ring-2"
        aria-label={t(it.settings.projects.dragStatus, { name: status.name })}
        {...sortable.attributes}
        {...sortable.listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <input
        type="color"
        value={color}
        aria-label={`${it.settings.projects.statusColor}: ${status.name}`}
        className="h-7 w-9 cursor-pointer rounded border bg-transparent"
        onChange={(e) => setColor(e.target.value)}
        onBlur={() => color !== status.color && void run(updateStatus(status.id, { color }))}
      />
      <Input
        value={name}
        className="h-8 w-48"
        aria-label={`${it.settings.projects.statusName}: ${status.name}`}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          const next = name.trim();
          if (!next || next === status.name) return setName(status.name);
          void run(updateStatus(status.id, { name: next }));
        }}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      <CategorySelect
        value={status.category}
        label={`${it.settings.projects.statusCategory}: ${status.name}`}
        onChange={(category) => void run(updateStatus(status.id, { category }))}
      />
      <span className="text-muted-foreground ml-auto text-xs tabular-nums">
        {count} {it.settings.projects.issues}
      </span>
      <AlertDialog onOpenChange={() => setTarget("")}>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={pending}
            aria-label={`${it.settings.projects.deleteStatus}: ${status.name}`}
          >
            <Trash2 />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(it.settings.projects.deleteStatusTitle, { name: status.name })}</AlertDialogTitle>
            {count > 0 ? (
              <AlertDialogDescription>{it.settings.projects.deleteStatusBody}</AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>
          {count > 0 ? (
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger className="w-full" aria-label={it.settings.projects.moveTo}>
                <SelectValue placeholder={it.settings.projects.moveTo} />
              </SelectTrigger>
              <SelectContent>
                {others.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>{it.settings.cancel}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={count > 0 && !target}
              onClick={async () => {
                const r = await run(deleteStatus(status.id, count > 0 ? target : null));
                if (r) toast.success(t(it.settings.projects.statusDeleted, { n: r.moved }));
              }}
            >
              {it.settings.projects.deleteStatus}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

function StatusesManager({
  projectId,
  statuses,
  issueCounts,
}: {
  projectId: string;
  statuses: StatusRow[];
  issueCounts: Record<string, number>;
}) {
  const { run, pending } = useRunAction();
  const [order, setOrder] = useState(statuses);
  useEffect(() => setOrder(statuses), [statuses]);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<StatusCategory>("in_progress");
  const [color, setColor] = useState("#8b5cf6");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const next = arrayMove(
      order,
      order.findIndex((s) => s.id === active.id),
      order.findIndex((s) => s.id === over.id),
    );
    setOrder(next);
    void run(
      reorderStatuses(
        projectId,
        next.map((s) => s.id),
      ),
    );
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="statuses-title">
      <div>
        <h2 id="statuses-title" className="text-lg font-semibold">
          {it.settings.projects.statuses}
        </h2>
        <p className="text-muted-foreground text-sm">{it.settings.projects.statusesHint}</p>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-1.5">
            {order.map((s) => (
              <StatusItem
                key={s.id}
                status={s}
                others={order.filter((o) => o.id !== s.id)}
                count={issueCounts[s.id] ?? 0}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(createStatus(projectId, { name, category, color }))) setName("");
        }}
      >
        <input
          type="color"
          value={color}
          aria-label={it.settings.projects.statusColor}
          className="h-8 w-10 cursor-pointer rounded border bg-transparent"
          onChange={(e) => setColor(e.target.value)}
        />
        <Input
          value={name}
          maxLength={50}
          placeholder={it.settings.projects.statusName}
          aria-label={it.settings.projects.statusName}
          className="w-48"
          onChange={(e) => setName(e.target.value)}
        />
        <CategorySelect value={category} onChange={setCategory} label={it.settings.projects.statusCategory} />
        <Button type="submit" variant="outline" disabled={!name.trim() || pending}>
          <Plus />
          {it.settings.projects.addStatus}
        </Button>
      </form>
    </section>
  );
}

function MembersManager({ project, members }: { project: ProjectConfig; members: UserRow[] }) {
  const { run, pending } = useRunAction();
  const inProject = members.filter((m) => project.member_ids.includes(m.id));
  const others = members.filter((m) => !project.member_ids.includes(m.id));
  return (
    <section className="flex flex-col gap-3" aria-labelledby="project-members-title">
      <div>
        <h2 id="project-members-title" className="text-lg font-semibold">
          {it.settings.projects.members}
        </h2>
        <p className="text-muted-foreground text-sm">{it.settings.projects.membersHint}</p>
      </div>
      {inProject.length === 0 ? (
        <p className="text-muted-foreground text-sm">{it.settings.projects.noMembers}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {inProject.map((m) => (
            <li key={m.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <UserAvatar user={m} />
              <span className="flex-1">{m.display_name}</span>
              <span className="text-muted-foreground hidden sm:inline">{m.email}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={pending}
                aria-label={t(it.settings.projects.removeMember, { name: m.display_name })}
                onClick={() => void run(removeProjectMember(project.id, m.id))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 ? (
        <Select value="" onValueChange={(userId) => void run(addProjectMember(project.id, userId))}>
          <SelectTrigger className="w-64" aria-label={it.settings.projects.addMember}>
            <SelectValue placeholder={it.settings.projects.addMember} />
          </SelectTrigger>
          <SelectContent>
            {others.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </section>
  );
}

export function ProjectSettings({
  project,
  statuses,
  issueCounts,
  members,
}: {
  project: ProjectConfig;
  statuses: StatusRow[];
  issueCounts: Record<string, number>;
  members: UserRow[];
}) {
  const { run, pending } = useRunAction();
  const initial: ProjectFormValue = {
    name: project.name,
    description: project.description ?? "",
    color: project.color,
    is_private: project.is_private,
  };
  const [value, setValue] = useState(initial);
  useEffect(() => setValue(initial), [project]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(value) !== JSON.stringify(initial);

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4" aria-labelledby="project-details-title">
        <h2 id="project-details-title" className="text-lg font-semibold">
          {it.settings.projects.details}
        </h2>
        <form
          className="flex max-w-xl flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              updateProject(project.id, { ...value, description: value.description.trim() || null }),
              it.settings.projects.saved,
            );
          }}
        >
          <ProjectFields value={value} onChange={setValue} idPrefix="project" />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!dirty || !value.name.trim() || pending}>
              {it.settings.save}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => void run(setProjectArchived(project.id, !project.archived_at), it.settings.projects.saved)}
            >
              {project.archived_at ? <ArchiveRestore /> : <Archive />}
              {project.archived_at ? it.settings.projects.restore : it.settings.projects.archive}
            </Button>
          </div>
        </form>
      </section>

      <StatusesManager projectId={project.id} statuses={statuses} issueCounts={issueCounts} />

      {project.is_private ? <MembersManager project={project} members={members} /> : null}
    </div>
  );
}
