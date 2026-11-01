/**
 * TASKME NTR — database schema (CLAUDE.md §3).
 * Names and types of the data contract are binding; index details are free.
 *
 * Conventions:
 * - every id is uuid, every table has created_at / updated_at (timestamptz)
 * - users.id equals auth.users.id once the user has signed in (see ADR-001);
 *   every FK to users cascades on update so a seeded placeholder id can be
 *   re-keyed to the Supabase Auth id at first login.
 * - RLS policies, helper functions and triggers live in the hand-written
 *   migration `drizzle/0001_rls_and_functions.sql`.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const workspaceRole = pgEnum("workspace_role", ["owner", "admin", "member", "viewer"]);
export const signinKind = pgEnum("signin_kind", ["domain", "email"]);
export const statusCategory = pgEnum("status_category", ["todo", "in_progress", "done"]);
export const issueType = pgEnum("issue_type", ["epic", "task", "subtask"]);
export const issuePriority = pgEnum("issue_priority", ["lowest", "low", "medium", "high", "highest"]);
export const issueRisk = pgEnum("issue_risk", ["none", "low", "medium", "high"]);
export const issueLinkKind = pgEnum("issue_link_kind", ["relates", "blocks"]);
export const activityAction = pgEnum("activity_action", [
  "created",
  "updated",
  "commented",
  "attached",
  "archived",
  "restored",
  "moved",
]);
export const notificationKind = pgEnum("notification_kind", [
  "mention",
  "assigned",
  "comment",
  "status_changed",
  "due_soon",
]);
export const emailDigest = pgEnum("email_digest", ["off", "daily"]);
export const savedViewKind = pgEnum("saved_view_kind", ["board", "table", "timeline", "calendar"]);

// Full-text search vector, maintained by Postgres as a generated column.
const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

// ---------------------------------------------------------------------------
// Shared column helpers
// ---------------------------------------------------------------------------

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const timestamps = () => ({ created_at: createdAt(), updated_at: updatedAt() });
const archivedAt = () => timestamp("archived_at", { withTimezone: true });

const userRef = (name: string) => uuid(name).references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" });

// ---------------------------------------------------------------------------
// 3.1 Identity and permissions
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  display_name: text("display_name").notNull(),
  avatar_url: text("avatar_url"),
  ...timestamps(),
});

export const workspaces = pgTable("workspaces", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ...timestamps(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspace_id: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    user_id: userRef("user_id").notNull(),
    role: workspaceRole("role").notNull().default("member"),
    joined_at: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps(),
  },
  (t) => [primaryKey({ columns: [t.workspace_id, t.user_id] }), index("workspace_members_user_idx").on(t.user_id)],
);

export const allowedSignins = pgTable(
  "allowed_signins",
  {
    id: id(),
    workspace_id: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: signinKind("kind").notNull(),
    value: text("value").notNull(),
    ...timestamps(),
  },
  (t) => [uniqueIndex("allowed_signins_ws_kind_value_uq").on(t.workspace_id, t.kind, sql`lower(${t.value})`)],
);

// ---------------------------------------------------------------------------
// 3.2 Projects and configuration
// ---------------------------------------------------------------------------

export const projects = pgTable(
  "projects",
  {
    id: id(),
    workspace_id: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    color: text("color").notNull().default("#64748b"),
    is_private: boolean("is_private").notNull().default(false),
    issue_counter: integer("issue_counter").notNull().default(0),
    archived_at: archivedAt(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("projects_ws_key_uq").on(t.workspace_id, t.key),
    check("projects_key_format", sql`${t.key} ~ '^[A-Z]{2,6}$'`),
    check("projects_issue_counter_nonneg", sql`${t.issue_counter} >= 0`),
  ],
);

export const projectMembers = pgTable(
  "project_members",
  {
    project_id: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    user_id: userRef("user_id").notNull(),
    ...timestamps(),
  },
  (t) => [primaryKey({ columns: [t.project_id, t.user_id] }), index("project_members_user_idx").on(t.user_id)],
);

export const statuses = pgTable(
  "statuses",
  {
    id: id(),
    project_id: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: statusCategory("category").notNull(),
    position: integer("position").notNull(),
    color: text("color").notNull().default("#94a3b8"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("statuses_project_name_uq").on(t.project_id, sql`lower(${t.name})`),
    index("statuses_project_position_idx").on(t.project_id, t.position),
  ],
);

export const labels = pgTable(
  "labels",
  {
    id: id(),
    workspace_id: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("#64748b"),
    ...timestamps(),
  },
  (t) => [uniqueIndex("labels_ws_name_ci_uq").on(t.workspace_id, sql`lower(${t.name})`)],
);

// ---------------------------------------------------------------------------
// 3.3 Issues
// ---------------------------------------------------------------------------

export const issues = pgTable(
  "issues",
  {
    id: id(),
    project_id: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    type: issueType("type").notNull().default("task"),
    // Self-referencing FK declared in the table extras; hierarchy rules enforced by trigger.
    parent_id: uuid("parent_id"),
    title: text("title").notNull(),
    description_md: text("description_md"),
    description_text: text("description_text"),
    status_id: uuid("status_id")
      .notNull()
      // NO ACTION (checked at end of statement) so a project delete can cascade to
      // both issues and statuses; status deletion with issues is blocked by trigger.
      .references(() => statuses.id, { onDelete: "no action" }),
    priority: issuePriority("priority").notNull().default("medium"),
    start_date: date("start_date"),
    due_date: date("due_date"),
    planned_days: integer("planned_days"),
    progress: smallint("progress").notNull().default(0),
    risk: issueRisk("risk").notNull().default("none"),
    external_collaborators: text("external_collaborators")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    rank: text("rank"),
    created_by: uuid("created_by").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
    archived_at: archivedAt(),
    search_vector: tsvector("search_vector").generatedAlwaysAs(
      sql`to_tsvector('italian'::regconfig, coalesce(title, '') || ' ' || coalesce(description_text, ''))`,
    ),
    ...timestamps(),
  },
  (t) => [
    foreignKey({ name: "issues_parent_id_fk", columns: [t.parent_id], foreignColumns: [t.id] }).onDelete("set null"),
    uniqueIndex("issues_project_number_uq").on(t.project_id, t.number),
    index("issues_project_status_idx").on(t.project_id, t.status_id),
    index("issues_parent_idx").on(t.parent_id),
    index("issues_project_rank_idx").on(t.project_id, t.rank),
    index("issues_due_date_idx").on(t.due_date),
    index("issues_search_idx").using("gin", t.search_vector),
    check("issues_progress_range", sql`${t.progress} between 0 and 100`),
    check("issues_planned_days_nonneg", sql`${t.planned_days} is null or ${t.planned_days} >= 0`),
    check("issues_number_positive", sql`${t.number} > 0`),
    check(
      "issues_dates_order",
      sql`${t.start_date} is null or ${t.due_date} is null or ${t.start_date} <= ${t.due_date}`,
    ),
    check("issues_epic_no_parent", sql`${t.type} <> 'epic' or ${t.parent_id} is null`),
  ],
);

export const issueAssignees = pgTable(
  "issue_assignees",
  {
    issue_id: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    user_id: userRef("user_id").notNull(),
    ...timestamps(),
  },
  (t) => [primaryKey({ columns: [t.issue_id, t.user_id] }), index("issue_assignees_user_idx").on(t.user_id)],
);

export const issueLabels = pgTable(
  "issue_labels",
  {
    issue_id: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    label_id: uuid("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
    ...timestamps(),
  },
  (t) => [primaryKey({ columns: [t.issue_id, t.label_id] }), index("issue_labels_label_idx").on(t.label_id)],
);

export const issueLinks = pgTable(
  "issue_links",
  {
    id: id(),
    from_issue_id: uuid("from_issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    to_issue_id: uuid("to_issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    kind: issueLinkKind("kind").notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("issue_links_from_to_kind_uq").on(t.from_issue_id, t.to_issue_id, t.kind),
    index("issue_links_to_idx").on(t.to_issue_id),
    check("issue_links_no_self", sql`${t.from_issue_id} <> ${t.to_issue_id}`),
  ],
);

// ---------------------------------------------------------------------------
// 3.4 Collaboration
// ---------------------------------------------------------------------------

export const comments = pgTable(
  "comments",
  {
    id: id(),
    issue_id: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    author_id: userRef("author_id").notNull(),
    body_md: text("body_md").notNull(),
    body_text: text("body_text").notNull().default(""),
    edited_at: timestamp("edited_at", { withTimezone: true }),
    archived_at: archivedAt(),
    search_vector: tsvector("search_vector").generatedAlwaysAs(
      sql`to_tsvector('italian'::regconfig, coalesce(body_text, ''))`,
    ),
    ...timestamps(),
  },
  (t) => [
    index("comments_issue_idx").on(t.issue_id, t.created_at),
    index("comments_search_idx").using("gin", t.search_vector),
  ],
);

export const attachments = pgTable(
  "attachments",
  {
    id: id(),
    issue_id: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    comment_id: uuid("comment_id").references(() => comments.id, { onDelete: "cascade" }),
    uploaded_by: userRef("uploaded_by").notNull(),
    storage_path: text("storage_path").notNull().unique(),
    file_name: text("file_name").notNull(),
    mime_type: text("mime_type").notNull(),
    size_bytes: integer("size_bytes").notNull(),
    ...timestamps(),
  },
  (t) => [
    index("attachments_issue_idx").on(t.issue_id),
    index("attachments_comment_idx").on(t.comment_id),
    check("attachments_size_limit", sql`${t.size_bytes} between 0 and 26214400`),
  ],
);

export const activityLog = pgTable(
  "activity_log",
  {
    id: id(),
    issue_id: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    actor_id: uuid("actor_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
    action: activityAction("action").notNull(),
    field: text("field"),
    old_value: jsonb("old_value"),
    new_value: jsonb("new_value"),
    ...timestamps(),
  },
  (t) => [index("activity_log_issue_idx").on(t.issue_id, t.created_at)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    user_id: userRef("user_id").notNull(),
    kind: notificationKind("kind").notNull(),
    issue_id: uuid("issue_id").references(() => issues.id, { onDelete: "cascade" }),
    comment_id: uuid("comment_id").references(() => comments.id, { onDelete: "cascade" }),
    actor_id: uuid("actor_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
    read_at: timestamp("read_at", { withTimezone: true }),
    emailed_at: timestamp("emailed_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    index("notifications_user_unread_idx").on(t.user_id, t.read_at, t.created_at),
    index("notifications_email_queue_idx").on(t.emailed_at, t.created_at),
  ],
);

export const notificationPrefs = pgTable("notification_prefs", {
  user_id: userRef("user_id").primaryKey(),
  email_on_mention: boolean("email_on_mention").notNull().default(true),
  email_on_assign: boolean("email_on_assign").notNull().default(true),
  email_on_comment: boolean("email_on_comment").notNull().default(true),
  email_digest: emailDigest("email_digest").notNull().default("off"),
  ...timestamps(),
});

export const savedViews = pgTable(
  "saved_views",
  {
    id: id(),
    workspace_id: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    project_id: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    owner_id: userRef("owner_id").notNull(),
    name: text("name").notNull(),
    kind: savedViewKind("kind").notNull(),
    config: jsonb("config")
      .notNull()
      .default(sql`'{}'::jsonb`),
    is_shared: boolean("is_shared").notNull().default(false),
    ...timestamps(),
  },
  (t) => [
    index("saved_views_ws_project_idx").on(t.workspace_id, t.project_id),
    index("saved_views_owner_idx").on(t.owner_id),
  ],
);

export type User = typeof users.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Status = typeof statuses.$inferSelect;
export type Issue = typeof issues.$inferSelect;
export type WorkspaceRole = (typeof workspaceRole.enumValues)[number];
export type StatusCategory = (typeof statusCategory.enumValues)[number];
export type IssueType = (typeof issueType.enumValues)[number];
export type IssuePriority = (typeof issuePriority.enumValues)[number];
export type IssueRisk = (typeof issueRisk.enumValues)[number];
export type IssueLinkKind = (typeof issueLinkKind.enumValues)[number];
export type SavedViewKind = (typeof savedViewKind.enumValues)[number];
export type ActivityAction = (typeof activityAction.enumValues)[number];
