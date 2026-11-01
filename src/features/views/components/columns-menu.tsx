"use client";

import { ArrowDown, ArrowUp, Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { it } from "@/i18n/it";
import { DEFAULT_COLUMNS, type ColumnId, type ColumnState } from "../use-view-state";

export const COLUMN_LABEL: Record<ColumnId, string> = {
  key: it.issue.fields.key,
  title: it.issue.fields.title,
  status: it.issue.fields.status,
  assignees: it.issue.fields.assignees,
  type: it.issue.fields.type,
  priority: it.issue.fields.priority,
  labels: it.issue.fields.labels,
  start_date: it.issue.fields.start_date,
  due_date: it.issue.fields.due_date,
  planned_days: it.issue.fields.planned_days,
  progress: it.issue.fields.progress,
  risk: it.issue.fields.risk,
  external_collaborators: it.issue.fields.external_collaborators,
};

/** Show/hide and reorder columns (sizes are changed by dragging the header edge). */
export function ColumnsMenu({ columns, onChange }: { columns: ColumnState; onChange: (c: ColumnState) => void }) {
  const move = (id: ColumnId, delta: -1 | 1) => {
    const order = [...columns.order];
    const i = order.indexOf(id);
    const j = i + delta;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j]!, order[i]!];
    onChange({ ...columns, order });
  };
  const toggle = (id: ColumnId, on: boolean) =>
    onChange({ ...columns, visible: on ? [...columns.visible, id] : columns.visible.filter((c) => c !== id) });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Columns3 />
          {it.table.columns}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <ul className="flex flex-col">
          {columns.order.map((id, i) => (
            <li key={id} className="flex items-center gap-2 rounded-md px-1 py-0.5">
              <Checkbox
                id={`col-${id}`}
                checked={columns.visible.includes(id)}
                disabled={id === "title"}
                onCheckedChange={(v) => toggle(id, v === true)}
              />
              <label htmlFor={`col-${id}`} className="flex-1 truncate text-sm">
                {COLUMN_LABEL[id]}
              </label>
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={i === 0}
                aria-label={`${it.table.moveUp}: ${COLUMN_LABEL[id]}`}
                onClick={() => move(id, -1)}
              >
                <ArrowUp />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={i === columns.order.length - 1}
                aria-label={`${it.table.moveDown}: ${COLUMN_LABEL[id]}`}
                onClick={() => move(id, 1)}
              >
                <ArrowDown />
              </Button>
            </li>
          ))}
        </ul>
        <Button variant="ghost" size="sm" className="mt-1 w-full" onClick={() => onChange(DEFAULT_COLUMNS)}>
          {it.table.resetColumns}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
