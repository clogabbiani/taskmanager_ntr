"use client";

/**
 * Issue detail (CLAUDE.md §5.1). Same component in the side sheet and on the
 * full page /p/[key]/issues/[KEY-n]. Every property is edited inline and
 * saved immediately with an optimistic update.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, ChevronRight, Expand, ExternalLink, Minimize2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/components/app-shell/app-context";
import { canAdmin, canWrite } from "@/features/auth/permissions";
import { createLabel } from "@/features/labels/actions";
import { it } from "@/i18n/it";
import { formatDateTime } from "@/lib/dates";
import { useSupabase } from "@/lib/supabase/use-supabase";
import { cn } from "@/lib/utils";
import {
  toastError,
  unwrap,
  useCollaboratorNames,
  useIssue,
  useLabels,
  useMembers,
  useStatuses,
  useUpdateIssue,
} from "../hooks";
import type { IssuePatch, IssueRow, IssueType } from "../model";
import { fetchLinks, isBlocked, queryKeys } from "../queries";
import { IssueTypeIcon, ProgressBar } from "./bits";
import { DescriptionEditor } from "./description-editor";
import {
  AssigneePicker,
  CollaboratorsInput,
  DateField,
  LabelPicker,
  NumberField,
  PrioritySelect,
  ProgressField,
  RiskSelect,
  StatusSelect,
  TypeSelect,
} from "./fields";
import { IssueActivity } from "./issue-activity";
import { IssueChildren } from "./issue-children";
import { IssueLinks } from "./issue-links";
import { IssueMenu } from "./issue-menu";
import { ParentPicker } from "./parent-picker";

type Mode = "sheet" | "page";

/** Types an issue may switch to without breaking the hierarchy. */
function allowedTypes(issue: IssueRow, hasChildren: boolean): IssueType[] {
  if (hasChildren || issue.parent_id) return [issue.type];
  return issue.type === "subtask" ? ["subtask"] : ["epic", "task"];
}

function TitleEditor({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const next = draft.trim();
    if (!next) return setDraft(value);
    if (next !== value) onChange(next);
  };
  return (
    <Textarea
      value={draft}
      disabled={disabled}
      rows={1}
      aria-label={it.issue.fields.title}
      className="hover:border-input focus-visible:border-input field-sizing-content min-h-0 resize-none border-transparent px-1 py-0.5 text-xl font-semibold shadow-none disabled:opacity-100 md:text-xl"
      onChange={(e) => setDraft(e.target.value.replace(/\n/g, " "))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          setDraft(value);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function Property({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground pt-1.5 text-sm">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

export function IssueDetail({
  projectKey,
  number,
  mode,
  expanded,
  onToggleExpand,
  onClose,
}: {
  projectKey: string;
  number: number;
  mode: Mode;
  expanded?: boolean;
  onToggleExpand?: () => void;
  onClose?: () => void;
}) {
  const { member } = useApp();
  const supabase = useSupabase();
  const qc = useQueryClient();
  const { data: issue, isLoading } = useIssue(projectKey, number);
  const { data: statuses = [] } = useStatuses(issue?.project_id);
  const { data: members = [] } = useMembers();
  const { data: labels = [] } = useLabels();
  const { data: collaborators = [] } = useCollaboratorNames();
  const { data: links = [] } = useQuery({
    queryKey: queryKeys.links(issue?.id ?? ""),
    queryFn: () => fetchLinks(supabase, issue!.id),
    enabled: Boolean(issue),
  });
  const { data: parent } = useQuery({
    queryKey: ["issue", "parent", issue?.parent_id ?? ""],
    queryFn: async () => {
      const { data } = await supabase
        .from("issues")
        .select("id, number, title, type")
        .eq("id", issue!.parent_id!)
        .single();
      return data as { id: string; number: number; title: string; type: IssueType } | null;
    },
    enabled: Boolean(issue?.parent_id),
  });
  const { data: childCount = 0 } = useQuery({
    queryKey: ["issues", "child-count", issue?.id ?? ""],
    queryFn: async () => {
      const { count } = await supabase
        .from("issues")
        .select("id", { count: "exact", head: true })
        .eq("parent_id", issue!.id);
      return count ?? 0;
    },
    enabled: Boolean(issue) && issue?.type !== "subtask",
  });
  const update = useUpdateIssue();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!issue) {
    return (
      <div className="flex flex-col items-start gap-4 p-6">
        <p className="text-muted-foreground">{it.issue.notFound}</p>
        {onClose ? (
          <Button variant="outline" onClick={onClose}>
            {it.issue.close}
          </Button>
        ) : null}
      </div>
    );
  }

  const issueKey = `${issue.project_key}-${issue.number}`;
  const canEdit = canWrite(member.role) && !issue.archived_at;
  const save = (patch: IssuePatch) => update.mutate({ id: issue.id, patch });
  const blocked = isBlocked(links);

  const onCreateLabel = canAdmin(member.role)
    ? async (name: string) => {
        try {
          const palette = ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#db2777"];
          const { id } = await unwrap(createLabel({ name, color: palette[labels.length % palette.length]! }));
          await qc.invalidateQueries({ queryKey: queryKeys.labels(member.workspaceId) });
          return id;
        } catch (e) {
          toastError(e);
          return null;
        }
      }
    : undefined;

  const properties = (
    <dl className="grid grid-cols-[minmax(7rem,9rem)_1fr] items-start gap-x-3 gap-y-1.5">
      <Property label={it.issue.fields.status}>
        <StatusSelect
          statuses={statuses}
          value={issue.status_id}
          disabled={!canEdit}
          onChange={(status_id) => save({ status_id })}
        />
      </Property>
      <Property label={it.issue.fields.assignees}>
        <AssigneePicker
          members={members}
          value={issue.assignee_ids}
          disabled={!canEdit}
          onChange={(assignee_ids) => save({ assignee_ids })}
        />
      </Property>
      <Property label={it.issue.fields.priority}>
        <PrioritySelect value={issue.priority} disabled={!canEdit} onChange={(priority) => save({ priority })} />
      </Property>
      <Property label={it.issue.fields.type}>
        <TypeSelect
          value={issue.type}
          allowed={allowedTypes(issue, childCount > 0)}
          disabled={!canEdit}
          onChange={(type) => save(type === "epic" ? { type, parent_id: null } : { type })}
        />
      </Property>
      {issue.type !== "epic" ? (
        <Property label={it.issue.fields.parent}>
          <ParentPicker
            projectId={issue.project_id}
            projectKey={issue.project_key}
            type={issue.type}
            value={issue.parent_id}
            excludeId={issue.id}
            disabled={!canEdit}
            onChange={(parent_id) => save({ parent_id })}
          />
        </Property>
      ) : null}
      <Property label={it.issue.fields.labels}>
        <LabelPicker
          labels={labels}
          value={issue.label_ids}
          disabled={!canEdit}
          onCreate={onCreateLabel}
          onChange={(label_ids) => save({ label_ids })}
        />
      </Property>
      <Property label={it.issue.fields.start_date}>
        <DateField
          value={issue.start_date}
          max={issue.due_date}
          disabled={!canEdit}
          aria-label={it.issue.fields.start_date}
          onChange={(start_date) => save({ start_date })}
        />
      </Property>
      <Property label={it.issue.fields.due_date}>
        <DateField
          value={issue.due_date}
          min={issue.start_date}
          disabled={!canEdit}
          aria-label={it.issue.fields.due_date}
          onChange={(due_date) => save({ due_date })}
        />
      </Property>
      <Property label={it.issue.fields.planned_days}>
        <NumberField
          value={issue.planned_days}
          disabled={!canEdit}
          aria-label={it.issue.fields.planned_days}
          onChange={(planned_days) => save({ planned_days })}
        />
      </Property>
      <Property label={it.issue.fields.progress}>
        {issue.type === "epic" ? (
          <div className="flex flex-col gap-0.5 pt-1.5">
            <ProgressBar value={issue.computed_progress} />
            <span className="text-muted-foreground text-xs">{it.issue.computedProgress}</span>
          </div>
        ) : (
          <ProgressField value={issue.progress} disabled={!canEdit} onChange={(progress) => save({ progress })} />
        )}
      </Property>
      <Property label={it.issue.fields.risk}>
        <RiskSelect value={issue.risk} disabled={!canEdit} onChange={(risk) => save({ risk })} />
      </Property>
      <Property label={it.issue.fields.external_collaborators}>
        <CollaboratorsInput
          value={issue.external_collaborators}
          suggestions={collaborators}
          disabled={!canEdit}
          onChange={(external_collaborators) => save({ external_collaborators })}
        />
      </Property>
    </dl>
  );

  return (
    <article className={cn("flex min-h-0 flex-1 flex-col", mode === "page" && "mx-auto w-full max-w-5xl")}>
      <header className="flex items-center gap-2 border-b px-4 py-2">
        <nav aria-label={it.issue.fields.parent} className="flex min-w-0 flex-1 items-center gap-1 text-sm">
          {parent ? (
            <>
              <Link
                href={`/p/${issue.project_key}/issues/${issue.project_key}-${parent.number}`}
                className="text-muted-foreground hover:text-foreground flex min-w-0 items-center gap-1 hover:underline"
              >
                <IssueTypeIcon type={parent.type} />
                <span className="font-mono text-xs">
                  {issue.project_key}-{parent.number}
                </span>
                <span className="hidden max-w-40 truncate sm:inline">{parent.title}</span>
              </Link>
              <ChevronRight className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
            </>
          ) : null}
          <IssueTypeIcon type={issue.type} />
          <span className="font-mono text-xs font-medium">{issueKey}</span>
        </nav>
        {mode === "sheet" ? (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              className="hidden md:inline-flex"
              aria-label={expanded ? it.issue.collapse : it.issue.expand}
              onClick={onToggleExpand}
            >
              {expanded ? <Minimize2 /> : <Expand />}
            </Button>
            <Button variant="ghost" size="icon-sm" asChild aria-label={it.issue.openFullPage}>
              <a href={`/p/${issue.project_key}/issues/${issueKey}`}>
                <ExternalLink />
              </a>
            </Button>
          </>
        ) : null}
        <IssueMenu issue={issue} issueKey={issueKey} projectKey={issue.project_key} />
        {onClose ? (
          <Button variant="ghost" size="icon-sm" aria-label={it.issue.close} onClick={onClose}>
            <X />
          </Button>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {issue.archived_at ? (
          <p className="bg-muted text-muted-foreground rounded-md px-3 py-2 text-sm">{it.issue.archivedBanner}</p>
        ) : null}
        {blocked ? (
          <Badge variant="destructive" className="w-fit">
            <Ban />
            {it.issue.blocked}
          </Badge>
        ) : null}

        <TitleEditor value={issue.title} disabled={!canEdit} onChange={(title) => save({ title })} />

        <Tabs defaultValue="details" className="gap-4">
          <TabsList>
            <TabsTrigger value="details">{it.issue.tabs.details}</TabsTrigger>
            <TabsTrigger value="activity">{it.issue.tabs.activity}</TabsTrigger>
          </TabsList>
          <TabsContent value="details">
            <div className={cn("grid gap-6", (mode === "page" || expanded) && "lg:grid-cols-[1fr_22rem]")}>
              <div className={cn("flex flex-col gap-6", (mode === "page" || expanded) && "lg:order-2")}>
                {properties}
              </div>
              <div className="flex min-w-0 flex-col gap-6">
                <section className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold">{it.issue.fields.description}</h3>
                  <DescriptionEditor
                    value={issue.description_md}
                    disabled={!canEdit}
                    onChange={(description_md) => save({ description_md })}
                  />
                </section>
                <IssueChildren issue={issue} projectKey={issue.project_key} statuses={statuses} canEdit={canEdit} />
                <IssueLinks issue={issue} links={links} canEdit={canEdit} />
                <p className="text-muted-foreground text-xs">
                  {it.issue.fields.created} {formatDateTime(issue.created_at)} · {it.issue.fields.updated}{" "}
                  {formatDateTime(issue.updated_at)}
                </p>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="activity">
            <IssueActivity issueId={issue.id} statuses={statuses} />
          </TabsContent>
        </Tabs>
      </div>
    </article>
  );
}
