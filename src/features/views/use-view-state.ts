"use client";

/**
 * View state (ADR-003): filters, sort and grouping live in the URL; column
 * visibility/order/sizes are per-user display preferences kept in
 * localStorage per project. A saved view carries both.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  parseFilters,
  parseGroup,
  parseSort,
  serializeView,
  type Filters,
  type GroupBy,
  type SortItem,
  type ViewConfig,
} from "./filters";

export const COLUMN_IDS = [
  "key",
  "title",
  "status",
  "assignees",
  "type",
  "priority",
  "labels",
  "start_date",
  "due_date",
  "planned_days",
  "progress",
  "risk",
  "external_collaborators",
] as const;

export type ColumnId = (typeof COLUMN_IDS)[number];

export type ColumnState = { visible: ColumnId[]; order: ColumnId[]; sizes: Partial<Record<ColumnId, number>> };

export const DEFAULT_COLUMNS: ColumnState = {
  visible: COLUMN_IDS.filter((c) => c !== "external_collaborators"),
  order: [...COLUMN_IDS],
  sizes: {},
};

const isColumn = (c: string): c is ColumnId => (COLUMN_IDS as readonly string[]).includes(c);

/** Sanitises a stored/saved column state; unknown ids are dropped, new columns appended. */
export function normaliseColumns(raw: ViewConfig["columns"] | null | undefined): ColumnState {
  if (!raw) return DEFAULT_COLUMNS;
  const order = raw.order.filter(isColumn);
  for (const c of COLUMN_IDS) if (!order.includes(c)) order.push(c);
  const sizes: ColumnState["sizes"] = {};
  for (const [k, v] of Object.entries(raw.sizes ?? {})) if (isColumn(k)) sizes[k] = v;
  return { visible: raw.visible.filter(isColumn), order, sizes };
}

const storageKey = (projectId: string) => `taskme:columns:${projectId}`;

function readColumns(projectId: string): ColumnState {
  try {
    const raw = window.localStorage.getItem(storageKey(projectId));
    return raw ? normaliseColumns(JSON.parse(raw) as ViewConfig["columns"]) : DEFAULT_COLUMNS;
  } catch {
    return DEFAULT_COLUMNS;
  }
}

/**
 * `basePath` is the view's own URL (e.g. /p/NBI). While the issue side panel is
 * open the URL is /p/NBI/issues/NBI-3 without query: the last params seen on
 * the base path are kept so the table underneath does not lose its filters.
 */
export function useViewState(projectId: string, basePath: string) {
  const router = useRouter();
  const pathname = usePathname();
  const liveParams = useSearchParams();
  const stable = useRef(liveParams);
  if (pathname === basePath) stable.current = liveParams;
  const params = pathname === basePath ? liveParams : stable.current;

  const filters = useMemo(() => parseFilters(params), [params]);
  const sort = useMemo(() => parseSort(params), [params]);
  const group = useMemo(() => parseGroup(params), [params]);
  const viewId = params.get("view");

  const navigate = useCallback(
    (f: Filters, s: SortItem[], g: GroupBy, view: string | null = viewId) => {
      const qs = serializeView(f, s, g);
      if (view) qs.set("view", view);
      const str = qs.toString();
      router.replace(str ? `${basePath}?${str}` : basePath, { scroll: false });
    },
    [router, basePath, viewId],
  );

  const [columns, setColumnsState] = useState<ColumnState>(DEFAULT_COLUMNS);
  useEffect(() => setColumnsState(readColumns(projectId)), [projectId]);

  const setColumns = useCallback(
    (next: ColumnState) => {
      setColumnsState(next);
      try {
        window.localStorage.setItem(storageKey(projectId), JSON.stringify(next));
      } catch {
        // Storage unavailable (private mode): keep the in-memory state.
      }
    },
    [projectId],
  );

  /** Applies a saved view: its query string becomes the URL, its columns the display. */
  const applyView = useCallback(
    (id: string | null, config?: ViewConfig) => {
      const qs = new URLSearchParams(config?.query ?? "");
      if (id) qs.set("view", id);
      const str = qs.toString();
      router.replace(str ? `${basePath}?${str}` : basePath, { scroll: false });
      if (config?.columns) setColumns(normaliseColumns(config.columns));
    },
    [router, basePath, setColumns],
  );

  const currentConfig = useCallback(
    (): ViewConfig => ({
      query: serializeView(filters, sort, group).toString(),
      columns: { visible: columns.visible, order: columns.order, sizes: columns.sizes as Record<string, number> },
    }),
    [filters, sort, group, columns],
  );

  return {
    filters,
    sort,
    group,
    viewId,
    columns,
    setFilters: (f: Filters) => navigate(f, sort, group),
    setSort: (s: SortItem[]) => navigate(filters, s, group),
    setGroup: (g: GroupBy) => navigate(filters, sort, g),
    setColumns,
    applyView,
    currentConfig,
  };
}

export type ViewState = ReturnType<typeof useViewState>;
