-- TASKME NTR — M1: private-project visibility, status guards, hierarchy, derived
-- fields and RPCs. Hand-written migration, tracked in the drizzle journal.
--
-- Visibility model (CLAUDE.md §2, ADR-004):
--   can_see_project       the project row as configuration (admins always, members if public or listed)
--   can_configure_project see + workspace admin/owner: edit project, statuses, project members
--   can_read_project      issues and everything hanging off them (unchanged: public or listed member)

-- ---------------------------------------------------------------------------
-- Visibility helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.can_see_project(p_project_id uuid)
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
        OR private.has_workspace_role(p.workspace_id, ARRAY['owner','admin']::public.workspace_role[])
        OR EXISTS (
          SELECT 1 FROM public.project_members pm
          WHERE pm.project_id = p.id AND pm.user_id = (SELECT auth.uid())
        )
      )
  )
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.can_configure_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT private.has_workspace_role(
    private.project_workspace(p_project_id),
    ARRAY['owner','admin']::public.workspace_role[])
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.is_member_of_workspace(p_workspace_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id AND wm.user_id = p_user_id
  )
$$;
--> statement-breakpoint

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO authenticated, service_role;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Policies: projects, project_members, statuses
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS projects_select ON public.projects;
--> statement-breakpoint
-- Inline on the row's columns (not can_see_project(id)) so INSERT ... RETURNING
-- works: the helper would re-read the table and miss the row being inserted.
CREATE POLICY projects_select ON public.projects FOR SELECT TO authenticated
  USING (
    private.is_workspace_member(workspace_id)
    AND (
      NOT is_private
      OR private.has_workspace_role(workspace_id, ARRAY['owner','admin']::public.workspace_role[])
      OR EXISTS (
        SELECT 1 FROM public.project_members pm
        WHERE pm.project_id = projects.id AND pm.user_id = (SELECT auth.uid())
      )
    )
  );
--> statement-breakpoint
DROP POLICY IF EXISTS projects_update ON public.projects;
--> statement-breakpoint
CREATE POLICY projects_update ON public.projects FOR UPDATE TO authenticated
  USING (private.can_configure_project(id))
  WITH CHECK (private.has_workspace_role(workspace_id, ARRAY['owner','admin']::public.workspace_role[]));
--> statement-breakpoint
DROP POLICY IF EXISTS projects_delete ON public.projects;
--> statement-breakpoint
CREATE POLICY projects_delete ON public.projects FOR DELETE TO authenticated
  USING (private.can_configure_project(id));
--> statement-breakpoint

DROP POLICY IF EXISTS project_members_select ON public.project_members;
--> statement-breakpoint
DROP POLICY IF EXISTS project_members_manage ON public.project_members;
--> statement-breakpoint
CREATE POLICY project_members_select ON public.project_members FOR SELECT TO authenticated
  USING (private.can_read_project(project_id) OR private.can_configure_project(project_id));
--> statement-breakpoint
CREATE POLICY project_members_insert ON public.project_members FOR INSERT TO authenticated
  WITH CHECK (
    private.can_configure_project(project_id)
    AND private.is_member_of_workspace(private.project_workspace(project_id), user_id)
  );
--> statement-breakpoint
CREATE POLICY project_members_delete ON public.project_members FOR DELETE TO authenticated
  USING (private.can_configure_project(project_id));
--> statement-breakpoint

DROP POLICY IF EXISTS statuses_select ON public.statuses;
--> statement-breakpoint
DROP POLICY IF EXISTS statuses_insert ON public.statuses;
--> statement-breakpoint
DROP POLICY IF EXISTS statuses_update ON public.statuses;
--> statement-breakpoint
DROP POLICY IF EXISTS statuses_delete ON public.statuses;
--> statement-breakpoint
CREATE POLICY statuses_select ON public.statuses FOR SELECT TO authenticated
  USING (private.can_see_project(project_id));
--> statement-breakpoint
CREATE POLICY statuses_insert ON public.statuses FOR INSERT TO authenticated
  WITH CHECK (private.can_configure_project(project_id));
--> statement-breakpoint
CREATE POLICY statuses_update ON public.statuses FOR UPDATE TO authenticated
  USING (private.can_configure_project(project_id))
  WITH CHECK (private.can_configure_project(project_id));
--> statement-breakpoint
CREATE POLICY statuses_delete ON public.statuses FOR DELETE TO authenticated
  USING (private.can_configure_project(project_id));
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Status guards (§3.2): at least one status per category; no delete with issues.
-- Skipped while the owning project is being deleted (cascade).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.statuses_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = OLD.project_id) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'DELETE' AND EXISTS (SELECT 1 FROM public.issues i WHERE i.status_id = OLD.id) THEN
    RAISE EXCEPTION 'status_has_issues: move the issues of status % before deleting it', OLD.name
      USING ERRCODE = '23503';
  END IF;

  IF (TG_OP = 'DELETE' OR NEW.category IS DISTINCT FROM OLD.category OR NEW.project_id IS DISTINCT FROM OLD.project_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.statuses s
       WHERE s.project_id = OLD.project_id AND s.category = OLD.category AND s.id <> OLD.id
     ) THEN
    RAISE EXCEPTION 'status_category_required: project must keep at least one % status', OLD.category
      USING ERRCODE = '23514';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS statuses_guard ON public.statuses;
--> statement-breakpoint
CREATE TRIGGER statuses_guard
BEFORE DELETE OR UPDATE OF category, project_id ON public.statuses
FOR EACH ROW EXECUTE FUNCTION private.statuses_guard();
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Issue integrity (replaces the M0 version): rigid epic → task → subtask.
--   epic: no parent; task: parent epic or none; subtask: parent task (required).
--   A subtask has no children, an epic has no parent, so cycles are impossible;
--   the self-parent check covers the only remaining case.
--   project_id is immutable (moving issues across projects is out of scope).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.issues_enforce_integrity()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_parent_type public.issue_type;
  v_parent_project uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.project_id IS DISTINCT FROM OLD.project_id THEN
    RAISE EXCEPTION 'issues cannot move to another project' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.statuses s WHERE s.id = NEW.status_id AND s.project_id = NEW.project_id) THEN
    RAISE EXCEPTION 'status % does not belong to project %', NEW.status_id, NEW.project_id USING ERRCODE = '23514';
  END IF;

  IF NEW.parent_id IS NULL THEN
    IF NEW.type = 'subtask' THEN
      RAISE EXCEPTION 'invalid hierarchy: subtask requires a parent task' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW.parent_id = NEW.id THEN
      RAISE EXCEPTION 'invalid hierarchy: an issue cannot be its own parent' USING ERRCODE = '23514';
    END IF;
    SELECT i.type, i.project_id INTO v_parent_type, v_parent_project FROM public.issues i WHERE i.id = NEW.parent_id;
    IF v_parent_project IS DISTINCT FROM NEW.project_id THEN
      RAISE EXCEPTION 'invalid hierarchy: parent must belong to the same project' USING ERRCODE = '23514';
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
      RAISE EXCEPTION 'invalid hierarchy: type change would invalidate children' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Derived fields
-- ---------------------------------------------------------------------------

-- Computed field (PostgREST: select=...,computed_progress). Epic progress is the
-- average of its non-archived direct children weighted by planned_days (children
-- with planned_days > 0); simple average when none has planned days; 0 without
-- children. Task/subtask progress is the manual column. Mirrors
-- src/features/issues/progress.ts.
CREATE OR REPLACE FUNCTION public.computed_progress(i public.issues)
RETURNS smallint
LANGUAGE sql STABLE SET search_path = ''
AS $$
  SELECT CASE
    WHEN i.type <> 'epic' THEN i.progress
    ELSE coalesce((
      SELECT CASE
        WHEN coalesce(sum(c.planned_days) FILTER (WHERE c.planned_days > 0), 0) > 0 THEN
          round(
            (sum(c.progress * c.planned_days) FILTER (WHERE c.planned_days > 0))::numeric
            / sum(c.planned_days) FILTER (WHERE c.planned_days > 0))
        ELSE round(avg(c.progress))
      END
      FROM public.issues c
      WHERE c.parent_id = i.id AND c.archived_at IS NULL
    ), 0)
  END::smallint
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- RPCs (SECURITY INVOKER unless stated: RLS applies to the caller)
-- ---------------------------------------------------------------------------

-- Atomic creation: number allocation, default status, insert, 'created' activity.
CREATE OR REPLACE FUNCTION public.create_issue(
  p_project_id uuid,
  p_type public.issue_type,
  p_title text,
  p_parent_id uuid DEFAULT NULL,
  p_status_id uuid DEFAULT NULL,
  p_rank text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path = ''
AS $$
DECLARE
  v_status uuid := p_status_id;
  v_number integer;
  v_id uuid;
  v_key text;
BEGIN
  IF v_status IS NULL THEN
    SELECT s.id INTO v_status
    FROM public.statuses s
    WHERE s.project_id = p_project_id
    ORDER BY (s.category <> 'todo'), s.position
    LIMIT 1;
  END IF;

  v_number := public.next_issue_number(p_project_id);

  INSERT INTO public.issues (project_id, number, type, parent_id, title, status_id, rank, created_by)
  VALUES (p_project_id, v_number, p_type, p_parent_id, p_title, v_status, p_rank, (SELECT auth.uid()))
  RETURNING id INTO v_id;

  SELECT p.key INTO v_key FROM public.projects p WHERE p.id = p_project_id;

  INSERT INTO public.activity_log (issue_id, actor_id, action, new_value)
  VALUES (v_id, (SELECT auth.uid()), 'created',
          jsonb_build_object('key', v_key || '-' || v_number, 'type', p_type, 'title', p_title));

  RETURN jsonb_build_object('id', v_id, 'number', v_number, 'key', v_key || '-' || v_number);
END
$$;
--> statement-breakpoint

-- Global search (§5.1): exact key, title substring, Italian full-text on
-- description and comments. Results limited to what the caller can read.
CREATE OR REPLACE FUNCTION public.search_issues(p_query text, p_limit integer DEFAULT 20)
RETURNS TABLE (
  issue_id uuid,
  project_key text,
  issue_number integer,
  title text,
  issue_type public.issue_type,
  is_archived boolean,
  score real
)
LANGUAGE sql STABLE SET search_path = ''
AS $$
  WITH q AS (
    SELECT
      websearch_to_tsquery('italian'::regconfig, p_query) AS tsq,
      upper(btrim(p_query)) AS key_query,
      '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%' AS pattern
  )
  SELECT
    i.id,
    p.key,
    i.number,
    i.title,
    i.type,
    i.archived_at IS NOT NULL,
    (
      CASE WHEN p.key || '-' || i.number = q.key_query THEN 10 ELSE 0 END
      + CASE WHEN i.title ILIKE q.pattern THEN 2 ELSE 0 END
      + ts_rank(i.search_vector, q.tsq)
    )::real AS score
  FROM public.issues i
  JOIN public.projects p ON p.id = i.project_id
  CROSS JOIN q
  WHERE btrim(p_query) <> ''
    AND (
      p.key || '-' || i.number = q.key_query
      OR i.title ILIKE q.pattern
      OR i.search_vector @@ q.tsq
      OR EXISTS (
        SELECT 1 FROM public.comments c
        WHERE c.issue_id = i.id AND c.archived_at IS NULL AND c.search_vector @@ q.tsq
      )
    )
  ORDER BY score DESC, i.archived_at NULLS FIRST, i.updated_at DESC
  LIMIT least(greatest(p_limit, 1), 50)
$$;
--> statement-breakpoint

-- Deletes a status, first moving its issues to p_target_status_id (same project).
CREATE OR REPLACE FUNCTION public.delete_status(p_status_id uuid, p_target_status_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql VOLATILE SET search_path = ''
AS $$
DECLARE
  v_project uuid;
  v_moved integer := 0;
BEGIN
  SELECT s.project_id INTO v_project FROM public.statuses s WHERE s.id = p_status_id;
  IF v_project IS NULL THEN
    RAISE EXCEPTION 'status not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_target_status_id IS NOT NULL THEN
    IF p_target_status_id = p_status_id OR NOT EXISTS (
      SELECT 1 FROM public.statuses s WHERE s.id = p_target_status_id AND s.project_id = v_project
    ) THEN
      RAISE EXCEPTION 'target status must be another status of the same project' USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.activity_log (issue_id, actor_id, action, field, old_value, new_value)
    SELECT i.id, (SELECT auth.uid()), 'updated', 'status_id', to_jsonb(p_status_id), to_jsonb(p_target_status_id)
    FROM public.issues i
    WHERE i.status_id = p_status_id;

    UPDATE public.issues SET status_id = p_target_status_id WHERE status_id = p_status_id;
    GET DIAGNOSTICS v_moved = ROW_COUNT;
  END IF;

  DELETE FROM public.statuses WHERE id = p_status_id;
  RETURN v_moved;
END
$$;
--> statement-breakpoint

-- Label merge and usage counts: SECURITY DEFINER because label assignments on
-- private issues must move too, even when the admin cannot read those issues.
CREATE OR REPLACE FUNCTION public.merge_labels(p_source uuid, p_target uuid)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_ws uuid;
  v_moved integer;
BEGIN
  SELECT l.workspace_id INTO v_ws FROM public.labels l WHERE l.id = p_source;
  IF v_ws IS NULL
     OR p_source = p_target
     OR NOT EXISTS (SELECT 1 FROM public.labels l WHERE l.id = p_target AND l.workspace_id = v_ws) THEN
    RAISE EXCEPTION 'labels must be two different labels of the same workspace' USING ERRCODE = '23514';
  END IF;
  IF NOT private.has_workspace_role(v_ws, ARRAY['owner','admin']::public.workspace_role[]) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.issue_labels (issue_id, label_id)
  SELECT il.issue_id, p_target FROM public.issue_labels il WHERE il.label_id = p_source
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  DELETE FROM public.labels WHERE id = p_source;
  RETURN v_moved;
END
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.label_usage(p_workspace_id uuid)
RETURNS TABLE (label_id uuid, issue_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT l.id, count(il.issue_id)::integer
  FROM public.labels l
  LEFT JOIN public.issue_labels il ON il.label_id = l.id
  WHERE l.workspace_id = p_workspace_id
    AND private.is_workspace_member(p_workspace_id)
  GROUP BY l.id
$$;
--> statement-breakpoint

-- Distinct external collaborator names on readable issues (autocomplete).
CREATE OR REPLACE FUNCTION public.external_collaborator_names(p_workspace_id uuid)
RETURNS TABLE (name text)
LANGUAGE sql STABLE SET search_path = ''
AS $$
  SELECT DISTINCT n
  FROM public.issues i
  JOIN public.projects p ON p.id = i.project_id
  CROSS JOIN LATERAL unnest(i.external_collaborators) AS n
  WHERE p.workspace_id = p_workspace_id
  ORDER BY n
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.create_issue(uuid, public.issue_type, text, uuid, uuid, text) FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.create_issue(uuid, public.issue_type, text, uuid, uuid, text) TO authenticated, service_role;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.search_issues(text, integer) FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.search_issues(text, integer) TO authenticated, service_role;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.delete_status(uuid, uuid) FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.delete_status(uuid, uuid) TO authenticated, service_role;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.merge_labels(uuid, uuid) FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.merge_labels(uuid, uuid) TO authenticated, service_role;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.label_usage(uuid) FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.label_usage(uuid) TO authenticated, service_role;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.external_collaborator_names(uuid) FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.external_collaborator_names(uuid) TO authenticated, service_role;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.computed_progress(public.issues) FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.computed_progress(public.issues) TO authenticated, service_role;
