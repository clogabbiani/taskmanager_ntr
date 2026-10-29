-- TASKME NTR — Row Level Security, helper functions and triggers (CLAUDE.md §3.5, §4).
-- Hand-written migration, tracked in the drizzle journal. Targets Supabase Postgres
-- (relies on auth.uid() / auth.jwt()).
--
-- Layout:
--   private.*  helper functions used by policies (schema not exposed by PostgREST)
--   public.next_issue_number(project_id)   transactional issue number allocation
--   public.claim_signin()                  allow-list check + first-login provisioning (ADR-001)
--   public.hook_before_user_created(event) optional Supabase Auth hook (ADR-001)

CREATE SCHEMA IF NOT EXISTS private;
--> statement-breakpoint
REVOKE ALL ON SCHEMA private FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA private TO authenticated, service_role;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER: they read membership tables bypassing RLS,
-- which avoids recursive policy evaluation).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.workspace_role_of(p_workspace_id uuid)
RETURNS public.workspace_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT wm.role
  FROM public.workspace_members wm
  WHERE wm.workspace_id = p_workspace_id
    AND wm.user_id = (SELECT auth.uid())
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.is_workspace_member(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT private.workspace_role_of(p_workspace_id) IS NOT NULL
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.has_workspace_role(p_workspace_id uuid, p_roles public.workspace_role[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT coalesce(private.workspace_role_of(p_workspace_id) = ANY (p_roles), false)
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.project_workspace(p_project_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT p.workspace_id FROM public.projects p WHERE p.id = p_project_id
$$;
--> statement-breakpoint

-- Workspace member AND (project is public OR caller is listed in project_members).
CREATE OR REPLACE FUNCTION private.can_read_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = p_project_id
      AND private.is_workspace_member(p.workspace_id)
      AND (
        NOT p.is_private
        OR EXISTS (
          SELECT 1 FROM public.project_members pm
          WHERE pm.project_id = p.id AND pm.user_id = (SELECT auth.uid())
        )
      )
  )
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.can_write_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT private.can_read_project(p_project_id)
     AND private.has_workspace_role(
           private.project_workspace(p_project_id),
           ARRAY['owner','admin','member']::public.workspace_role[])
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.can_admin_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT private.can_read_project(p_project_id)
     AND private.has_workspace_role(
           private.project_workspace(p_project_id),
           ARRAY['owner','admin']::public.workspace_role[])
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.issue_project(p_issue_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT i.project_id FROM public.issues i WHERE i.id = p_issue_id
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.can_read_issue(p_issue_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT private.can_read_project(private.issue_project(p_issue_id))
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.can_write_issue(p_issue_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT private.can_write_project(private.issue_project(p_issue_id))
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.can_admin_issue(p_issue_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT private.can_admin_project(private.issue_project(p_issue_id))
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.shares_workspace(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members mine
    JOIN public.workspace_members theirs ON theirs.workspace_id = mine.workspace_id
    WHERE mine.user_id = (SELECT auth.uid()) AND theirs.user_id = p_user_id
  )
$$;
--> statement-breakpoint

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO authenticated, service_role;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- updated_at maintenance on every public table that has the column.
CREATE OR REPLACE FUNCTION private.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;
--> statement-breakpoint

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.column_name = 'updated_at'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.set_updated_at()', t);
  END LOOP;
END
$$;
--> statement-breakpoint

-- Default statuses on project creation [VINCOLANTE §3.2].
CREATE OR REPLACE FUNCTION private.create_default_statuses()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.statuses (project_id, name, category, position, color) VALUES
    (NEW.id, 'To Do',       'todo',        0, '#94a3b8'),
    (NEW.id, 'In Progress', 'in_progress', 1, '#3b82f6'),
    (NEW.id, 'Review',      'in_progress', 2, '#f59e0b'),
    (NEW.id, 'Done',        'done',        3, '#22c55e');
  RETURN NEW;
END
$$;
--> statement-breakpoint

CREATE TRIGGER projects_default_statuses
AFTER INSERT ON public.projects
FOR EACH ROW EXECUTE FUNCTION private.create_default_statuses();
--> statement-breakpoint

-- Issue integrity: rigid epic → task → subtask hierarchy, same-project parent and status.
CREATE OR REPLACE FUNCTION private.issues_enforce_integrity()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_parent_type public.issue_type;
  v_parent_project uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.statuses s WHERE s.id = NEW.status_id AND s.project_id = NEW.project_id) THEN
    RAISE EXCEPTION 'status % does not belong to project %', NEW.status_id, NEW.project_id USING ERRCODE = '23514';
  END IF;

  IF NEW.parent_id IS NOT NULL THEN
    IF NEW.parent_id = NEW.id THEN
      RAISE EXCEPTION 'an issue cannot be its own parent' USING ERRCODE = '23514';
    END IF;
    SELECT i.type, i.project_id INTO v_parent_type, v_parent_project FROM public.issues i WHERE i.id = NEW.parent_id;
    IF v_parent_project IS DISTINCT FROM NEW.project_id THEN
      RAISE EXCEPTION 'parent must belong to the same project' USING ERRCODE = '23514';
    END IF;
    IF NOT ((NEW.type = 'task' AND v_parent_type = 'epic') OR (NEW.type = 'subtask' AND v_parent_type = 'task')) THEN
      RAISE EXCEPTION 'invalid hierarchy: % cannot be child of %', NEW.type, v_parent_type USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.type IS DISTINCT FROM OLD.type THEN
    IF EXISTS (
      SELECT 1 FROM public.issues c
      WHERE c.parent_id = NEW.id
        AND NOT ((NEW.type = 'epic' AND c.type = 'task') OR (NEW.type = 'task' AND c.type = 'subtask'))
    ) THEN
      RAISE EXCEPTION 'type change would invalidate children hierarchy' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END
$$;
--> statement-breakpoint

CREATE TRIGGER issues_enforce_integrity
BEFORE INSERT OR UPDATE OF parent_id, type, project_id, status_id ON public.issues
FOR EACH ROW EXECUTE FUNCTION private.issues_enforce_integrity();
--> statement-breakpoint

-- Members may archive/restore only issues they created (§4 permission matrix).
-- Calls without a JWT (service role, scripts) are not restricted.
CREATE OR REPLACE FUNCTION private.issues_enforce_archive_permission()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NEW.archived_at IS DISTINCT FROM OLD.archived_at
     AND (SELECT auth.uid()) IS NOT NULL
     AND NOT private.can_admin_project(NEW.project_id)
     AND NEW.created_by IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'members can archive only their own issues' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint

CREATE TRIGGER issues_enforce_archive_permission
BEFORE UPDATE OF archived_at ON public.issues
FOR EACH ROW EXECUTE FUNCTION private.issues_enforce_archive_permission();
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Public RPCs
-- ---------------------------------------------------------------------------

-- Allocates the next KEY-n number. The UPDATE takes a row lock on the project,
-- so concurrent callers are serialised within their transactions.
CREATE OR REPLACE FUNCTION public.next_issue_number(p_project_id uuid)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_next integer;
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL AND NOT private.can_write_project(p_project_id) THEN
    RAISE EXCEPTION 'not allowed to create issues in project %', p_project_id USING ERRCODE = '42501';
  END IF;

  UPDATE public.projects
     SET issue_counter = issue_counter + 1
   WHERE id = p_project_id
  RETURNING issue_counter INTO v_next;

  IF v_next IS NULL THEN
    RAISE EXCEPTION 'project % not found', p_project_id USING ERRCODE = 'P0002';
  END IF;
  RETURN v_next;
END
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.next_issue_number(uuid) FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.next_issue_number(uuid) TO authenticated, service_role;
--> statement-breakpoint

-- Called from the OAuth callback with the user's own session (ADR-001).
-- Returns true when the JWT email matches allowed_signins; on first authorised
-- sign-in creates the users row (or re-keys a seeded placeholder to auth.uid())
-- and a workspace_members row with role 'member'. Existing roles are preserved.
CREATE OR REPLACE FUNCTION public.claim_signin()
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_email text := lower((SELECT auth.jwt()) ->> 'email');
  v_meta jsonb := coalesce((SELECT auth.jwt()) -> 'user_metadata', '{}'::jsonb);
  v_ws uuid;
  v_existing uuid;
  v_name text;
  v_avatar text;
BEGIN
  IF v_uid IS NULL OR v_email IS NULL OR position('@' in v_email) = 0 THEN
    RETURN false;
  END IF;

  SELECT a.workspace_id INTO v_ws
  FROM public.allowed_signins a
  WHERE (a.kind = 'email' AND lower(a.value) = v_email)
     OR (a.kind = 'domain' AND lower(a.value) = split_part(v_email, '@', 2))
  ORDER BY a.created_at
  LIMIT 1;

  IF v_ws IS NULL THEN
    RETURN false;
  END IF;

  v_name := coalesce(nullif(v_meta ->> 'full_name', ''), nullif(v_meta ->> 'name', ''), v_email);
  v_avatar := coalesce(nullif(v_meta ->> 'avatar_url', ''), nullif(v_meta ->> 'picture', ''));

  SELECT u.id INTO v_existing FROM public.users u WHERE lower(u.email) = v_email;

  IF v_existing IS NULL THEN
    INSERT INTO public.users (id, email, display_name, avatar_url)
    VALUES (v_uid, v_email, v_name, v_avatar);
  ELSIF v_existing <> v_uid THEN
    -- Seeded placeholder: adopt the Supabase Auth id. FKs cascade on update.
    UPDATE public.users
       SET id = v_uid, avatar_url = coalesce(v_avatar, avatar_url)
     WHERE id = v_existing;
  ELSE
    UPDATE public.users SET avatar_url = coalesce(v_avatar, avatar_url) WHERE id = v_uid;
  END IF;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_ws, v_uid, 'member')
  ON CONFLICT (workspace_id, user_id) DO NOTHING;

  INSERT INTO public.notification_prefs (user_id)
  VALUES (v_uid)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN true;
END
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.claim_signin() FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.claim_signin() TO authenticated;
--> statement-breakpoint

-- Optional hardening (ADR-001): Supabase "Before User Created" Auth Hook.
-- When enabled in the dashboard it prevents auth.users rows for emails outside
-- the allow-list, so a rejected Google account leaves no trace at all.
CREATE OR REPLACE FUNCTION public.hook_before_user_created(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_email text := lower(event -> 'user' ->> 'email');
BEGIN
  IF v_email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.allowed_signins a
    WHERE (a.kind = 'email' AND lower(a.value) = v_email)
       OR (a.kind = 'domain' AND lower(a.value) = split_part(v_email, '@', 2))
  ) THEN
    RETURN '{}'::jsonb;
  END IF;
  RETURN jsonb_build_object(
    'error', jsonb_build_object('http_code', 403, 'message', 'signin_not_allowed'));
END
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.hook_before_user_created(jsonb) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
    GRANT EXECUTE ON FUNCTION public.hook_before_user_created(jsonb) TO supabase_auth_admin;
  END IF;
END
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Row Level Security: enabled on every table [VINCOLANTE §3.5]
-- ---------------------------------------------------------------------------

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END
$$;
--> statement-breakpoint

-- workspaces
CREATE POLICY workspaces_select ON public.workspaces FOR SELECT TO authenticated
  USING (private.is_workspace_member(id));
--> statement-breakpoint
CREATE POLICY workspaces_update ON public.workspaces FOR UPDATE TO authenticated
  USING (private.has_workspace_role(id, ARRAY['owner','admin']::public.workspace_role[]))
  WITH CHECK (private.has_workspace_role(id, ARRAY['owner','admin']::public.workspace_role[]));
--> statement-breakpoint
CREATE POLICY workspaces_delete ON public.workspaces FOR DELETE TO authenticated
  USING (private.has_workspace_role(id, ARRAY['owner']::public.workspace_role[]));
--> statement-breakpoint

-- users
CREATE POLICY users_select ON public.users FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) OR private.shares_workspace(id));
--> statement-breakpoint
CREATE POLICY users_update_self ON public.users FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));
--> statement-breakpoint

-- workspace_members: admins manage; only the owner may touch owner rows or grant 'owner'.
CREATE POLICY workspace_members_select ON public.workspace_members FOR SELECT TO authenticated
  USING (private.is_workspace_member(workspace_id));
--> statement-breakpoint
CREATE POLICY workspace_members_insert ON public.workspace_members FOR INSERT TO authenticated
  WITH CHECK (
    private.has_workspace_role(workspace_id, ARRAY['owner','admin']::public.workspace_role[])
    AND (role <> 'owner' OR private.has_workspace_role(workspace_id, ARRAY['owner']::public.workspace_role[]))
  );
--> statement-breakpoint
CREATE POLICY workspace_members_update ON public.workspace_members FOR UPDATE TO authenticated
  USING (
    private.has_workspace_role(workspace_id, ARRAY['owner','admin']::public.workspace_role[])
    AND (role <> 'owner' OR private.has_workspace_role(workspace_id, ARRAY['owner']::public.workspace_role[]))
  )
  WITH CHECK (
    private.has_workspace_role(workspace_id, ARRAY['owner','admin']::public.workspace_role[])
    AND (role <> 'owner' OR private.has_workspace_role(workspace_id, ARRAY['owner']::public.workspace_role[]))
  );
--> statement-breakpoint
CREATE POLICY workspace_members_delete ON public.workspace_members FOR DELETE TO authenticated
  USING (
    private.has_workspace_role(workspace_id, ARRAY['owner','admin']::public.workspace_role[])
    AND (role <> 'owner' OR private.has_workspace_role(workspace_id, ARRAY['owner']::public.workspace_role[]))
  );
--> statement-breakpoint

-- allowed_signins: admin only
CREATE POLICY allowed_signins_admin ON public.allowed_signins FOR ALL TO authenticated
  USING (private.has_workspace_role(workspace_id, ARRAY['owner','admin']::public.workspace_role[]))
  WITH CHECK (private.has_workspace_role(workspace_id, ARRAY['owner','admin']::public.workspace_role[]));
--> statement-breakpoint

-- projects
CREATE POLICY projects_select ON public.projects FOR SELECT TO authenticated
  USING (private.can_read_project(id));
--> statement-breakpoint
CREATE POLICY projects_insert ON public.projects FOR INSERT TO authenticated
  WITH CHECK (private.has_workspace_role(workspace_id, ARRAY['owner','admin']::public.workspace_role[]));
--> statement-breakpoint
CREATE POLICY projects_update ON public.projects FOR UPDATE TO authenticated
  USING (private.can_admin_project(id))
  WITH CHECK (private.has_workspace_role(workspace_id, ARRAY['owner','admin']::public.workspace_role[]));
--> statement-breakpoint
CREATE POLICY projects_delete ON public.projects FOR DELETE TO authenticated
  USING (private.can_admin_project(id));
--> statement-breakpoint

-- project_members: readable by whoever can read the project; managed by workspace admins
CREATE POLICY project_members_select ON public.project_members FOR SELECT TO authenticated
  USING (private.can_read_project(project_id));
--> statement-breakpoint
CREATE POLICY project_members_manage ON public.project_members FOR ALL TO authenticated
  USING (private.has_workspace_role(private.project_workspace(project_id), ARRAY['owner','admin']::public.workspace_role[]))
  WITH CHECK (private.has_workspace_role(private.project_workspace(project_id), ARRAY['owner','admin']::public.workspace_role[]));
--> statement-breakpoint

-- statuses
CREATE POLICY statuses_select ON public.statuses FOR SELECT TO authenticated
  USING (private.can_read_project(project_id));
--> statement-breakpoint
CREATE POLICY statuses_insert ON public.statuses FOR INSERT TO authenticated
  WITH CHECK (private.can_admin_project(project_id));
--> statement-breakpoint
CREATE POLICY statuses_update ON public.statuses FOR UPDATE TO authenticated
  USING (private.can_admin_project(project_id))
  WITH CHECK (private.can_admin_project(project_id));
--> statement-breakpoint
CREATE POLICY statuses_delete ON public.statuses FOR DELETE TO authenticated
  USING (private.can_admin_project(project_id));
--> statement-breakpoint

-- labels
CREATE POLICY labels_select ON public.labels FOR SELECT TO authenticated
  USING (private.is_workspace_member(workspace_id));
--> statement-breakpoint
CREATE POLICY labels_insert ON public.labels FOR INSERT TO authenticated
  WITH CHECK (private.has_workspace_role(workspace_id, ARRAY['owner','admin']::public.workspace_role[]));
--> statement-breakpoint
CREATE POLICY labels_update ON public.labels FOR UPDATE TO authenticated
  USING (private.has_workspace_role(workspace_id, ARRAY['owner','admin']::public.workspace_role[]))
  WITH CHECK (private.has_workspace_role(workspace_id, ARRAY['owner','admin']::public.workspace_role[]));
--> statement-breakpoint
CREATE POLICY labels_delete ON public.labels FOR DELETE TO authenticated
  USING (private.has_workspace_role(workspace_id, ARRAY['owner','admin']::public.workspace_role[]));
--> statement-breakpoint

-- issues
CREATE POLICY issues_select ON public.issues FOR SELECT TO authenticated
  USING (private.can_read_project(project_id));
--> statement-breakpoint
CREATE POLICY issues_insert ON public.issues FOR INSERT TO authenticated
  WITH CHECK (private.can_write_project(project_id) AND created_by = (SELECT auth.uid()));
--> statement-breakpoint
CREATE POLICY issues_update ON public.issues FOR UPDATE TO authenticated
  USING (private.can_write_project(project_id))
  WITH CHECK (private.can_write_project(project_id));
--> statement-breakpoint
CREATE POLICY issues_delete ON public.issues FOR DELETE TO authenticated
  USING (private.can_admin_project(project_id));
--> statement-breakpoint

-- issue_assignees / issue_labels
CREATE POLICY issue_assignees_select ON public.issue_assignees FOR SELECT TO authenticated
  USING (private.can_read_issue(issue_id));
--> statement-breakpoint
CREATE POLICY issue_assignees_write ON public.issue_assignees FOR ALL TO authenticated
  USING (private.can_write_issue(issue_id))
  WITH CHECK (private.can_write_issue(issue_id));
--> statement-breakpoint
CREATE POLICY issue_labels_select ON public.issue_labels FOR SELECT TO authenticated
  USING (private.can_read_issue(issue_id));
--> statement-breakpoint
CREATE POLICY issue_labels_write ON public.issue_labels FOR ALL TO authenticated
  USING (private.can_write_issue(issue_id))
  WITH CHECK (private.can_write_issue(issue_id));
--> statement-breakpoint

-- issue_links
CREATE POLICY issue_links_select ON public.issue_links FOR SELECT TO authenticated
  USING (private.can_read_issue(from_issue_id) AND private.can_read_issue(to_issue_id));
--> statement-breakpoint
CREATE POLICY issue_links_write ON public.issue_links FOR ALL TO authenticated
  USING (private.can_write_issue(from_issue_id))
  WITH CHECK (private.can_write_issue(from_issue_id) AND private.can_read_issue(to_issue_id));
--> statement-breakpoint

-- comments: own edits/deletes; admins on everything
CREATE POLICY comments_select ON public.comments FOR SELECT TO authenticated
  USING (private.can_read_issue(issue_id));
--> statement-breakpoint
CREATE POLICY comments_insert ON public.comments FOR INSERT TO authenticated
  WITH CHECK (private.can_write_issue(issue_id) AND author_id = (SELECT auth.uid()));
--> statement-breakpoint
CREATE POLICY comments_update ON public.comments FOR UPDATE TO authenticated
  USING (
    private.can_write_issue(issue_id)
    AND (author_id = (SELECT auth.uid()) OR private.can_admin_issue(issue_id))
  )
  WITH CHECK (private.can_write_issue(issue_id));
--> statement-breakpoint
CREATE POLICY comments_delete ON public.comments FOR DELETE TO authenticated
  USING (author_id = (SELECT auth.uid()) OR private.can_admin_issue(issue_id));
--> statement-breakpoint

-- attachments
CREATE POLICY attachments_select ON public.attachments FOR SELECT TO authenticated
  USING (private.can_read_issue(issue_id));
--> statement-breakpoint
CREATE POLICY attachments_insert ON public.attachments FOR INSERT TO authenticated
  WITH CHECK (private.can_write_issue(issue_id) AND uploaded_by = (SELECT auth.uid()));
--> statement-breakpoint
CREATE POLICY attachments_delete ON public.attachments FOR DELETE TO authenticated
  USING (uploaded_by = (SELECT auth.uid()) OR private.can_admin_issue(issue_id));
--> statement-breakpoint

-- activity_log: append-only from the client side
CREATE POLICY activity_log_select ON public.activity_log FOR SELECT TO authenticated
  USING (private.can_read_issue(issue_id));
--> statement-breakpoint
CREATE POLICY activity_log_insert ON public.activity_log FOR INSERT TO authenticated
  WITH CHECK (private.can_write_issue(issue_id) AND actor_id = (SELECT auth.uid()));
--> statement-breakpoint

-- notifications: recipients read/mark/delete their own; actors create them for colleagues
CREATE POLICY notifications_select ON public.notifications FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
--> statement-breakpoint
CREATE POLICY notifications_update ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
--> statement-breakpoint
CREATE POLICY notifications_delete ON public.notifications FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));
--> statement-breakpoint
CREATE POLICY notifications_insert ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    actor_id = (SELECT auth.uid())
    AND private.shares_workspace(user_id)
    AND (issue_id IS NULL OR private.can_read_issue(issue_id))
  );
--> statement-breakpoint

-- notification_prefs: self only
CREATE POLICY notification_prefs_self ON public.notification_prefs FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
--> statement-breakpoint

-- saved_views: personal or shared; shared ones editable by author and admins
CREATE POLICY saved_views_select ON public.saved_views FOR SELECT TO authenticated
  USING (
    owner_id = (SELECT auth.uid())
    OR (
      is_shared
      AND private.is_workspace_member(workspace_id)
      AND (project_id IS NULL OR private.can_read_project(project_id))
    )
  );
--> statement-breakpoint
CREATE POLICY saved_views_insert ON public.saved_views FOR INSERT TO authenticated
  WITH CHECK (owner_id = (SELECT auth.uid()) AND private.is_workspace_member(workspace_id));
--> statement-breakpoint
CREATE POLICY saved_views_update ON public.saved_views FOR UPDATE TO authenticated
  USING (
    owner_id = (SELECT auth.uid())
    OR (is_shared AND private.has_workspace_role(workspace_id, ARRAY['owner','admin']::public.workspace_role[]))
  )
  WITH CHECK (private.is_workspace_member(workspace_id));
--> statement-breakpoint
CREATE POLICY saved_views_delete ON public.saved_views FOR DELETE TO authenticated
  USING (
    owner_id = (SELECT auth.uid())
    OR (is_shared AND private.has_workspace_role(workspace_id, ARRAY['owner','admin']::public.workspace_role[]))
  );
