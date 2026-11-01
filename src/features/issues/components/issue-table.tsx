"use client";

/**
 * Table view (CLAUDE.md §5.2, PROMPT_M1 §13): configurable columns, multi-sort,
 * inline editing, grouping by epic, multi-select with bulk actions, row
 * virtualisation (500+ issues). Clicking a row opens the detail side panel.
 */
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type SortingState,
  type Updater,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp } from "@/components/app-shell/app-context";
import { canWrite } from "@/features/auth/permissions";
import { epicOf, matchesFilters, type GroupBy } from "@/features/views/filters";
import { ColumnsMenu, COLUMN_LABEL } from "@/features/views/components/columns-menu";
import { FilterBar } from "@/features/views/components/filter-bar";
import { SavedViewsMenu } from "@/features/views/components/saved-views-menu";
import { useViewState, type ColumnId } from "@/features/views/use-view-state";
import { t } from "@/i18n/format";
import { it } from "@/i18n/it";
import { formatDate, isOverdue } from "@/lib/dates";
import { compareRanks } from "@/lib/rank";
import { useSupabase } from "@/lib/supabase/use-supabase";
import { cn } from "@/lib/utils";
import { archiveIssue, bulkUpdateIssues } from "../actions";
import { invalidateIssues, toastError, unwrap, useLabels, useMembers, useStatuses, useUpdateIssue } from "../hooks";
import { ISSUE_PRIORITIES, ISSUE_RISKS, ISSUE_TYPES, type IssueRow, type StatusRow } from "../model";
import { fetchProjectIssues, queryKeys } from "../queries";
import { IssueTypeIcon, LabelChip, ProgressBar, RiskDot, StatusBadge } from "./bits";
import { AssigneePicker, DateField, NumberField, PrioritySelect, StatusSelect } from "./fields";

const ROW_HEIGHT = 41;

const DEFAULT_SIZE: Record<ColumnId | "select", number> = {
  select: 40,
  key: 96,
  title: 340,
  status: 150,
  assignees: 120,
  type: 130,
  priority: 120,
  labels: 200,
  start_date: 150,
  due_date: 150,
  planned_days: 100,
  progress: 150,
  risk: 110,
  external_collaborators: 200,
};

type FlatItem =
  { kind: "group"; id: string; epic: IssueRow | null; count: number } | { kind: "row"; row: Row<IssueRow> };

/** Progress cell: bar, editable through a small popover for tasks and subtasks. */
function ProgressCell({
  issue,
  canEdit,
  onChange,
}: {
  issue: IssueRow;
  canEdit: boolean;
  onChange: (v: number) => void;
}) {
  if (!canEdit || issue.type === "epic") return <ProgressBar value={issue.computed_progress} />;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="focus-visible:ring-ring w-full rounded px-1 py-1 outline-none focus-visible:ring-2"
          aria-label={`${it.issue.fields.progress}: ${issue.computed_progress}%`}
        >
          <ProgressBar value={issue.computed_progress} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-40 p-2" align="start">
        <NumberField
          value={issue.progress}
          min={0}
          max={100}
          aria-label={it.issue.fields.progress}
          onChange={(v) => v !== null && onChange(v)}
          className="w-full"
        />
      </PopoverContent>
    </Popover>
  );
}

export function IssueTable({ projectId, projectKey }: { projectId: string; projectKey: string }) {
  const { member } = useApp();
  const router = useRouter();
  const supabase = useSupabase();
  const qc = useQueryClient();
  const state = useViewState(projectId, `/p/${projectKey}`);
  const canEdit = canWrite(member.role);

  const { data: issues = [], isLoading } = useQuery({
    queryKey: queryKeys.projectIssues(projectId, state.filters.archived),
    queryFn: () => fetchProjectIssues(supabase, projectId, { archived: state.filters.archived }),
  });
  const { data: statuses = [] } = useStatuses(projectId);
  const { data: members = [] } = useMembers();
  const { data: labels = [] } = useLabels();
  const update = useUpdateIssue();

  const byId = useMemo(() => new Map(issues.map((i) => [i.id, i])), [issues]);
  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses]);
  const epics = useMemo(
    () =>
      issues
        .filter((i) => i.type === "epic")
        .map((e) => ({ id: e.id, key: `${projectKey}-${e.number}`, title: e.title })),
    [issues, projectKey],
  );
  const filtered = useMemo(
    () => issues.filter((i) => matchesFilters(i, state.filters, { me: member.id, projectKey, byId })),
    [issues, state.filters, member.id, projectKey, byId],
  );

  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const save = (id: string, patch: Parameters<typeof update.mutate>[0]["patch"]) => update.mutate({ id, patch });

  const columns = useMemo<ColumnDef<IssueRow>[]>(() => {
    const idx =
      <T,>(list: readonly T[]) =>
      (v: T) =>
        list.indexOf(v);
    const status = (s: StatusRow | undefined) => s?.position ?? 0;
    return [
      {
        id: "select",
        size: DEFAULT_SIZE.select,
        enableSorting: false,
        enableResizing: false,
        header: ({ table }) => (
          <Checkbox
            aria-label={it.table.selectAll}
            checked={table.getIsAllRowsSelected() ? true : table.getIsSomeRowsSelected() ? "indeterminate" : false}
            onCheckedChange={(v) => table.toggleAllRowsSelected(v === true)}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={t(it.table.selectRow, { key: `${projectKey}-${row.original.number}` })}
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(v === true)}
          />
        ),
      },
      {
        id: "key",
        header: COLUMN_LABEL.key,
        accessorFn: (r) => r.number,
        cell: ({ row }) => (
          <span className="text-muted-foreground flex items-center gap-1.5 font-mono text-xs">
            <IssueTypeIcon type={row.original.type} />
            {projectKey}-{row.original.number}
          </span>
        ),
      },
      {
        id: "title",
        header: COLUMN_LABEL.title,
        accessorFn: (r) => r.title.toLocaleLowerCase("it"),
        cell: ({ row }) => (
          <span
            className={cn(
              "block truncate font-medium",
              row.original.archived_at && "text-muted-foreground line-through",
            )}
          >
            {row.original.title}
          </span>
        ),
      },
      {
        id: "status",
        header: COLUMN_LABEL.status,
        accessorFn: (r) => status(statusById.get(r.status_id)),
        cell: ({ row }) =>
          canEdit && !row.original.archived_at ? (
            <StatusSelect
              statuses={statuses}
              value={row.original.status_id}
              onChange={(status_id) => save(row.original.id, { status_id })}
            />
          ) : (
            <StatusBadge status={statusById.get(row.original.status_id)} />
          ),
      },
      {
        id: "assignees",
        header: COLUMN_LABEL.assignees,
        enableSorting: false,
        cell: ({ row }) => (
          <AssigneePicker
            members={members}
            value={row.original.assignee_ids}
            disabled={!canEdit || Boolean(row.original.archived_at)}
            onChange={(assignee_ids) => save(row.original.id, { assignee_ids })}
          />
        ),
      },
      {
        id: "type",
        header: COLUMN_LABEL.type,
        accessorFn: (r) => idx(ISSUE_TYPES)(r.type),
        cell: ({ row }) => (
          <span className="flex items-center gap-1.5 text-sm">
            <IssueTypeIcon type={row.original.type} />
            {it.issue.types[row.original.type]}
          </span>
        ),
      },
      {
        id: "priority",
        header: COLUMN_LABEL.priority,
        accessorFn: (r) => idx(ISSUE_PRIORITIES)(r.priority),
        cell: ({ row }) => (
          <PrioritySelect
            value={row.original.priority}
            disabled={!canEdit || Boolean(row.original.archived_at)}
            onChange={(priority) => save(row.original.id, { priority })}
          />
        ),
      },
      {
        id: "labels",
        header: COLUMN_LABEL.labels,
        enableSorting: false,
        cell: ({ row }) => (
          <span className="flex gap-1 overflow-hidden">
            {labels
              .filter((l) => row.original.label_ids.includes(l.id))
              .map((l) => (
                <LabelChip key={l.id} label={l} />
              ))}
          </span>
        ),
      },
      {
        id: "start_date",
        header: COLUMN_LABEL.start_date,
        accessorFn: (r) => r.start_date ?? undefined,
        sortUndefined: "last",
        cell: ({ row }) =>
          canEdit && !row.original.archived_at ? (
            <DateField
              value={row.original.start_date}
              max={row.original.due_date}
              aria-label={it.issue.fields.start_date}
              onChange={(start_date) => save(row.original.id, { start_date })}
            />
          ) : (
            <span className="text-sm">{formatDate(row.original.start_date)}</span>
          ),
      },
      {
        id: "due_date",
        header: COLUMN_LABEL.due_date,
        accessorFn: (r) => r.due_date ?? undefined,
        sortUndefined: "last",
        cell: ({ row }) => {
          const overdue =
            isOverdue(row.original.due_date) && statusById.get(row.original.status_id)?.category !== "done";
          return canEdit && !row.original.archived_at ? (
            <DateField
              value={row.original.due_date}
              min={row.original.start_date}
              aria-label={it.issue.fields.due_date}
              className={cn(overdue && "text-destructive [&_svg]:text-destructive")}
              onChange={(due_date) => save(row.original.id, { due_date })}
            />
          ) : (
            <span className={cn("text-sm", overdue && "text-destructive")}>{formatDate(row.original.due_date)}</span>
          );
        },
      },
      {
        id: "planned_days",
        header: COLUMN_LABEL.planned_days,
        accessorFn: (r) => r.planned_days ?? undefined,
        sortUndefined: "last",
        cell: ({ row }) => (
          <span className="block text-right text-sm tabular-nums">{row.original.planned_days ?? ""}</span>
        ),
      },
      {
        id: "progress",
        header: COLUMN_LABEL.progress,
        accessorFn: (r) => r.computed_progress,
        cell: ({ row }) => (
          <ProgressCell
            issue={row.original}
            canEdit={canEdit && !row.original.archived_at}
            onChange={(progress) => save(row.original.id, { progress })}
          />
        ),
      },
      {
        id: "risk",
        header: COLUMN_LABEL.risk,
        accessorFn: (r) => idx(ISSUE_RISKS)(r.risk),
        cell: ({ row }) => (
          <span className="flex items-center gap-1.5 text-sm">
            <RiskDot risk={row.original.risk} />
            {it.issue.risks[row.original.risk]}
          </span>
        ),
      },
      {
        id: "external_collaborators",
        header: COLUMN_LABEL.external_collaborators,
        enableSorting: false,
        cell: ({ row }) => (
          <span className="block truncate text-sm">{row.original.external_collaborators.join(", ")}</span>
        ),
      },
    ];
    // `save` is stable enough: it closes over the mutation object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectKey, statuses, statusById, members, labels, canEdit]);

  const sorting: SortingState = state.sort;
  const table = useReactTable({
    data: filtered,
    columns,
    getRowId: (r) => r.id,
    state: {
      sorting,
      rowSelection,
      columnVisibility: Object.fromEntries(
        (Object.keys(DEFAULT_SIZE) as (ColumnId | "select")[]).map((id) => [
          id,
          id === "select" ? canEdit : state.columns.visible.includes(id as ColumnId),
        ]),
      ),
      columnOrder: ["select", ...state.columns.order],
      columnSizing: Object.fromEntries(
        Object.entries(DEFAULT_SIZE).map(([id, size]) => [id, state.columns.sizes[id as ColumnId] ?? size]),
      ),
    },
    enableMultiSort: true,
    enableSortingRemoval: true,
    columnResizeMode: "onChange",
    onSortingChange: (updater: Updater<SortingState>) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      state.setSort(next.map((s) => ({ id: s.id, desc: s.desc })));
    },
    onRowSelectionChange: setRowSelection,
    onColumnSizingChange: (updater) => {
      const current = Object.fromEntries(
        Object.entries(DEFAULT_SIZE).map(([id, size]) => [id, state.columns.sizes[id as ColumnId] ?? size]),
      );
      const next = typeof updater === "function" ? updater(current) : updater;
      const sizes = Object.fromEntries(Object.entries(next).filter(([id]) => id !== "select"));
      state.setColumns({ ...state.columns, sizes });
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const rows = table.getRowModel().rows;
  const items = useMemo<FlatItem[]>(
    () => flatten(rows, state.group, byId, collapsed, sorting.length === 0),
    [rows, state.group, byId, collapsed, sorting.length],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const padTop = virtualItems[0]?.start ?? 0;
  const padBottom = virtualizer.getTotalSize() - (virtualItems.at(-1)?.end ?? 0);
  const visibleColumns = table.getVisibleLeafColumns();

  const open = (issue: IssueRow) =>
    router.push(`/p/${projectKey}/issues/${projectKey}-${issue.number}`, { scroll: false });

  const focusRow = (index: number) => {
    const target = Math.max(0, Math.min(items.length - 1, index));
    virtualizer.scrollToIndex(target);
    requestAnimationFrame(() => scrollRef.current?.querySelector<HTMLElement>(`[data-index="${target}"]`)?.focus());
  };

  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id] && byId.has(id));

  return (
    <div className="flex flex-col gap-3">
      <FilterBar filters={state.filters} onChange={state.setFilters} options={{ statuses, members, labels, epics }}>
        <Select value={state.group} onValueChange={(g) => state.setGroup(g as GroupBy)}>
          <SelectTrigger size="sm" aria-label={it.table.group}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{it.table.groupNone}</SelectItem>
            <SelectItem value="epic">{it.table.groupEpic}</SelectItem>
          </SelectContent>
        </Select>
        <ColumnsMenu columns={state.columns} onChange={state.setColumns} />
        <SavedViewsMenu projectId={projectId} state={state} />
      </FilterBar>

      {selectedIds.length > 0 ? (
        <BulkBar
          ids={selectedIds}
          statuses={statuses}
          onDone={() => {
            setRowSelection({});
            invalidateIssues(qc);
          }}
        />
      ) : null}

      <div
        ref={scrollRef}
        className="relative h-[calc(100dvh-15rem)] min-h-80 overflow-auto rounded-lg border"
        role="region"
        aria-label={t(it.table.caption, { key: projectKey })}
        tabIndex={-1}
      >
        <table className="text-sm" style={{ width: table.getTotalSize(), tableLayout: "fixed" }}>
          <caption className="sr-only">{t(it.table.caption, { key: projectKey })}</caption>
          <thead className="bg-muted/80 sticky top-0 z-10 backdrop-blur">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const sortIndex = header.column.getSortIndex();
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      style={{ width: header.getSize() }}
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                      className="relative h-9 border-b px-2 text-left font-medium"
                    >
                      {header.column.getCanSort() ? (
                        <button
                          type="button"
                          title={it.table.sortHint}
                          onClick={header.column.getToggleSortingHandler()}
                          className="focus-visible:ring-ring flex w-full items-center gap-1 truncate rounded outline-none focus-visible:ring-2"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === "asc" ? <ArrowUp className="size-3.5" /> : null}
                          {sorted === "desc" ? <ArrowDown className="size-3.5" /> : null}
                          {sorted && sorting.length > 1 ? (
                            <span className="text-muted-foreground text-[10px]">{sortIndex + 1}</span>
                          ) : null}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                      {header.column.getCanResize() ? (
                        <div
                          role="separator"
                          aria-orientation="vertical"
                          aria-label={t(it.table.resize, { name: String(header.column.columnDef.header) })}
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          onDoubleClick={() => header.column.resetSize()}
                          className={cn(
                            "hover:bg-primary/40 absolute top-0 right-0 h-full w-1.5 cursor-col-resize touch-none select-none",
                            header.column.getIsResizing() && "bg-primary",
                          )}
                        />
                      ) : null}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {padTop > 0 ? (
              <tr aria-hidden="true">
                <td style={{ height: padTop }} colSpan={visibleColumns.length} />
              </tr>
            ) : null}
            {virtualItems.map((vi) => {
              const item = items[vi.index]!;
              if (item.kind === "group") {
                const isCollapsed = collapsed.has(item.id);
                const name = item.epic ? `${projectKey}-${item.epic.number} ${item.epic.title}` : it.table.noEpic;
                return (
                  <tr key={`g-${item.id}`} data-index={vi.index} className="bg-muted/40" style={{ height: ROW_HEIGHT }}>
                    <td colSpan={visibleColumns.length} className="border-b px-2">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-expanded={!isCollapsed}
                          aria-label={t(isCollapsed ? it.table.expandGroup : it.table.collapseGroup, { name })}
                          onClick={() =>
                            setCollapsed((c) => {
                              const next = new Set(c);
                              if (next.has(item.id)) next.delete(item.id);
                              else next.add(item.id);
                              return next;
                            })
                          }
                        >
                          {isCollapsed ? <ChevronRight /> : <ChevronDown />}
                        </Button>
                        {item.epic ? (
                          <button
                            type="button"
                            className="flex min-w-0 items-center gap-2 font-medium hover:underline"
                            onClick={() => open(item.epic!)}
                          >
                            <IssueTypeIcon type="epic" />
                            <span className="text-muted-foreground font-mono text-xs">
                              {projectKey}-{item.epic.number}
                            </span>
                            <span className="truncate">{item.epic.title}</span>
                          </button>
                        ) : (
                          <span className="font-medium">{it.table.noEpic}</span>
                        )}
                        <span className="text-muted-foreground text-xs">({item.count})</span>
                        {item.epic ? (
                          <ProgressBar value={item.epic.computed_progress} className="ml-auto w-40" />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              }
              const row = item.row;
              return (
                <tr
                  key={row.id}
                  data-index={vi.index}
                  tabIndex={0}
                  aria-selected={row.getIsSelected()}
                  aria-label={t(it.table.open, { key: `${projectKey}-${row.original.number}` })}
                  style={{ height: ROW_HEIGHT }}
                  className={cn(
                    "hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:outline-ring cursor-pointer border-b outline-none focus-visible:outline-2 focus-visible:-outline-offset-2",
                    row.getIsSelected() && "bg-primary/5",
                  )}
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (!e.currentTarget.contains(target)) return; // portalled popovers
                    if (target.closest("button, a, input, label, [role=combobox], [role=checkbox], [role=slider]"))
                      return;
                    open(row.original);
                  }}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === "Enter") open(row.original);
                    else if (e.key === " " && canEdit) {
                      e.preventDefault();
                      row.toggleSelected();
                    } else if (e.key === "ArrowDown") {
                      e.preventDefault();
                      focusRow(vi.index + 1);
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      focusRow(vi.index - 1);
                    }
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="overflow-hidden px-2 py-0.5" style={{ width: cell.column.getSize() }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
            {padBottom > 0 ? (
              <tr aria-hidden="true">
                <td style={{ height: padBottom }} colSpan={visibleColumns.length} />
              </tr>
            ) : null}
          </tbody>
        </table>
        {!isLoading && items.length === 0 ? (
          <p className="text-muted-foreground p-10 text-center text-sm">
            {issues.length === 0 ? it.table.emptyProject : it.table.empty}
          </p>
        ) : null}
      </div>
      <p className="text-muted-foreground text-xs" aria-live="polite">
        {t(it.table.count, { shown: filtered.length, total: issues.length })}
      </p>
    </div>
  );
}

/** Rows in display order, with epic group headers when grouping by epic. */
function flatten(
  rows: Row<IssueRow>[],
  group: GroupBy,
  byId: ReadonlyMap<string, IssueRow>,
  collapsed: ReadonlySet<string>,
  manualOrder: boolean,
): FlatItem[] {
  const ordered = manualOrder
    ? [...rows].sort((a, b) => compareRanks(a.original.rank, b.original.rank) || a.original.number - b.original.number)
    : rows;
  if (group !== "epic") return ordered.map((row) => ({ kind: "row", row }));

  const groups = new Map<string, Row<IssueRow>[]>();
  for (const row of ordered) {
    if (row.original.type === "epic") {
      if (!groups.has(row.original.id)) groups.set(row.original.id, []);
      continue;
    }
    const epic = epicOf(row.original, byId) ?? "none";
    groups.set(epic, [...(groups.get(epic) ?? []), row]);
  }
  const epicIds = [...groups.keys()].filter((id) => id !== "none");
  epicIds.sort(
    (a, b) =>
      compareRanks(byId.get(a)?.rank ?? null, byId.get(b)?.rank ?? null) ||
      (byId.get(a)?.number ?? 0) - (byId.get(b)?.number ?? 0),
  );
  if (groups.has("none")) epicIds.push("none");

  const out: FlatItem[] = [];
  for (const id of epicIds) {
    const members = groups.get(id) ?? [];
    out.push({ kind: "group", id, epic: id === "none" ? null : (byId.get(id) ?? null), count: members.length });
    if (!collapsed.has(id)) for (const row of members) out.push({ kind: "row", row });
  }
  return out;
}

function BulkBar({ ids, statuses, onDone }: { ids: string[]; statuses: StatusRow[]; onDone: () => void }) {
  const { data: members = [] } = useMembers();
  const { data: labels = [] } = useLabels();
  const report = ({ updated, failed }: { updated: number; failed: number }) =>
    failed
      ? toast.warning(t(it.table.bulk.partial, { updated, failed }))
      : toast.success(t(it.table.bulk.done, { updated }));

  const run = useMutation({
    mutationFn: (patch: Parameters<typeof bulkUpdateIssues>[1]) => unwrap(bulkUpdateIssues(ids, patch)),
    onSuccess: (r) => {
      report(r);
      onDone();
    },
    onError: toastError,
  });
  const archive = useMutation({
    mutationFn: async () => {
      let updated = 0;
      let failed = 0;
      for (const id of ids) {
        const r = await archiveIssue(id);
        if (r.ok) updated++;
        else failed++;
      }
      return { updated, failed };
    },
    onSuccess: (r) => {
      report(r);
      onDone();
    },
  });

  const picker = (label: string, options: { value: string; label: string }[], apply: (v: string) => void) => (
    <Select value="" onValueChange={apply} disabled={run.isPending}>
      <SelectTrigger size="sm" aria-label={label} className="w-auto">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  const people = members.map((m) => ({ value: m.id, label: m.display_name }));
  const tags = labels.map((l) => ({ value: l.id, label: l.name }));

  return (
    <div
      role="toolbar"
      aria-label={t(it.table.bulk.selected, { n: ids.length })}
      className="bg-primary/5 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2"
    >
      <span className="text-sm font-medium">{t(it.table.bulk.selected, { n: ids.length })}</span>
      {picker(
        it.table.bulk.status,
        statuses.map((s) => ({ value: s.id, label: s.name })),
        (status_id) => run.mutate({ status_id }),
      )}
      {picker(it.table.bulk.addAssignee, people, (add_assignee) => run.mutate({ add_assignee }))}
      {picker(it.table.bulk.removeAssignee, people, (remove_assignee) => run.mutate({ remove_assignee }))}
      {picker(it.table.bulk.addLabel, tags, (add_label) => run.mutate({ add_label }))}
      {picker(it.table.bulk.removeLabel, tags, (remove_label) => run.mutate({ remove_label }))}
      <Button variant="outline" size="sm" disabled={archive.isPending} onClick={() => archive.mutate()}>
        {it.table.bulk.archive}
      </Button>
      <Button variant="ghost" size="sm" className="ml-auto" onClick={onDone}>
        {it.table.bulk.clear}
      </Button>
    </div>
  );
}
