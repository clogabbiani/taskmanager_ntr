/**
 * Italian sentences for activity_log rows ("Claudio ha cambiato Stato da To Do
 * a In Progress"). Pure: ids are resolved through the lookups passed in.
 */
import { t } from "@/i18n/format";
import { it } from "@/i18n/it";
import { formatDate } from "@/lib/dates";
import type { ActivityField } from "./activity";
import type { ActivityRow, IssuePriority, IssueRisk, IssueType } from "./model";

export type ActivityLookups = {
  user: (id: string) => string | undefined;
  status: (id: string) => string | undefined;
  label: (id: string) => string | undefined;
  issueKey: (id: string) => string | undefined;
};

const FIELD_LABEL: Record<ActivityField | "links", string> = {
  title: it.issue.fields.title,
  type: it.issue.fields.type,
  parent: it.issue.fields.parent,
  status: it.issue.fields.status,
  priority: it.issue.fields.priority,
  assignees: it.issue.fields.assignees,
  labels: it.issue.fields.labels,
  start_date: it.issue.fields.start_date,
  due_date: it.issue.fields.due_date,
  planned_days: it.issue.fields.planned_days,
  progress: it.issue.fields.progress,
  risk: it.issue.fields.risk,
  external_collaborators: it.issue.fields.external_collaborators,
  description: it.issue.fields.description,
  links: it.issue.fields.links,
};

const deleted = it.activity.deleted;

function scalar(field: string, value: unknown, l: ActivityLookups): string {
  if (value === null || value === undefined || value === "") return it.issue.none;
  const v = String(value);
  switch (field) {
    case "status":
      return l.status(v) ?? deleted;
    case "parent":
      return l.issueKey(v) ?? deleted;
    case "priority":
      return it.issue.priorities[v as IssuePriority] ?? v;
    case "risk":
      return it.issue.risks[v as IssueRisk] ?? v;
    case "type":
      return it.issue.types[v as IssueType] ?? v;
    case "start_date":
    case "due_date":
      return formatDate(v) || v;
    case "progress":
      return `${v}%`;
    case "title":
      return `«${v}»`;
    default:
      return v;
  }
}

function listItem(field: string, id: string, l: ActivityLookups): string {
  if (field === "assignees") return l.user(id) ?? deleted;
  if (field === "labels") return l.label(id) ?? deleted;
  return id;
}

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

export function describeActivity(row: ActivityRow, l: ActivityLookups): string {
  const actor = (row.actor_id && l.user(row.actor_id)) || it.activity.someone;

  switch (row.action) {
    case "created":
      return t(it.activity.created, { actor });
    case "archived":
      return t(it.activity.archived, { actor });
    case "restored":
      return t(it.activity.restored, { actor });
  }

  const field = row.field ?? "";
  const label = FIELD_LABEL[field as ActivityField] ?? field;

  if (field === "description") return t(it.activity.description, { actor });

  if (field === "links") {
    const value = (row.new_value ?? row.old_value) as { kind?: "relates" | "blocks"; to?: string } | null;
    const kind = value?.kind ? it.issue.links.kinds[value.kind] : "";
    const to = (value?.to && l.issueKey(value.to)) || deleted;
    return t(row.new_value ? it.activity.linked : it.activity.unlinked, { actor, kind, to });
  }

  if (field === "assignees" || field === "labels" || field === "external_collaborators") {
    const before = asList(row.old_value);
    const after = asList(row.new_value);
    const added = after.filter((x) => !before.includes(x)).map((x) => listItem(field, x, l));
    const removed = before.filter((x) => !after.includes(x)).map((x) => listItem(field, x, l));
    if (added.length && removed.length) {
      return t(it.activity.updatedAndRemoved, { actor, field: label, to: added.join(", "), from: removed.join(", ") });
    }
    if (added.length) return t(it.activity.added, { actor, field: label, to: added.join(", ") });
    return t(it.activity.removed, { actor, field: label, from: removed.join(", ") });
  }

  const from = scalar(field, row.old_value, l);
  const to = scalar(field, row.new_value, l);
  if (row.old_value === null || row.old_value === undefined) return t(it.activity.set, { actor, field: label, to });
  if (row.new_value === null || row.new_value === undefined)
    return t(it.activity.cleared, { actor, field: label, from });
  return t(it.activity.changed, { actor, field: label, from, to });
}

/** Ids referenced by activity rows that need resolving to issue keys. */
export function referencedIssueIds(rows: readonly ActivityRow[]): string[] {
  const ids = new Set<string>();
  for (const r of rows) {
    if (r.field === "parent") {
      if (typeof r.old_value === "string") ids.add(r.old_value);
      if (typeof r.new_value === "string") ids.add(r.new_value);
    }
    if (r.field === "links") {
      for (const v of [r.old_value, r.new_value] as ({ to?: string } | null)[]) if (v?.to) ids.add(v.to);
    }
  }
  return [...ids];
}
