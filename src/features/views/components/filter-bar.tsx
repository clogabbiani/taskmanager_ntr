"use client";

/**
 * Composable filter bar (§5.2), shared by every view. Reads and writes the
 * URL through useViewState, so filtered links are shareable.
 */
import { useEffect, useState } from "react";
import { CalendarRange, ListFilter, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { IssueTypeIcon, PriorityIcon, RiskDot, StatusDot } from "@/features/issues/components/bits";
import {
  ISSUE_PRIORITIES,
  ISSUE_RISKS,
  ISSUE_TYPES,
  type LabelRow,
  type StatusRow,
  type UserRow,
} from "@/features/issues/model";
import { t } from "@/i18n/format";
import { it } from "@/i18n/it";
import { formatDate } from "@/lib/dates";
import { useDebounced } from "@/lib/use-debounced";
import { activeFilterCount, EMPTY_FILTERS, ME, NONE, type Filters } from "../filters";

type ListField = "status" | "type" | "assignee" | "label" | "priority" | "risk" | "epic";
type Option = { value: string; label: string; icon?: React.ReactNode };

export type FilterOptions = {
  statuses: StatusRow[];
  members: UserRow[];
  labels: LabelRow[];
  epics: { id: string; key: string; title: string }[];
};

function optionsFor(field: ListField, o: FilterOptions): Option[] {
  switch (field) {
    case "status":
      return o.statuses.map((s) => ({ value: s.id, label: s.name, icon: <StatusDot color={s.color} /> }));
    case "type":
      return ISSUE_TYPES.map((v) => ({ value: v, label: it.issue.types[v], icon: <IssueTypeIcon type={v} /> }));
    case "assignee":
      return [
        { value: ME, label: it.filters.me },
        { value: NONE, label: it.filters.none },
        ...o.members.map((m) => ({ value: m.id, label: m.display_name })),
      ];
    case "label":
      return o.labels.map((l) => ({
        value: l.id,
        label: l.name,
        icon: <span aria-hidden="true" className="size-2.5 rounded-full" style={{ backgroundColor: l.color }} />,
      }));
    case "priority":
      return [...ISSUE_PRIORITIES]
        .reverse()
        .map((v) => ({ value: v, label: it.issue.priorities[v], icon: <PriorityIcon priority={v} /> }));
    case "risk":
      return ISSUE_RISKS.map((v) => ({ value: v, label: it.issue.risks[v], icon: <RiskDot risk={v} /> }));
    case "epic":
      return [
        { value: NONE, label: it.filters.noEpic },
        ...o.epics.map((e) => ({ value: e.id, label: `${e.key} ${e.title}` })),
      ];
  }
}

const LIST_FIELDS: ListField[] = ["status", "type", "assignee", "label", "priority", "risk", "epic"];

function DateRange({
  label,
  from,
  to,
  onChange,
}: {
  label: string;
  from: string | null;
  to: string | null;
  onChange: (from: string | null, to: string | null) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      <div className="grid grid-cols-2 gap-2">
        <Label className="flex flex-col items-start gap-1 text-xs">
          {it.filters.from}
          <Input
            type="date"
            value={from ?? ""}
            max={to ?? undefined}
            onChange={(e) => onChange(e.target.value || null, to)}
          />
        </Label>
        <Label className="flex flex-col items-start gap-1 text-xs">
          {it.filters.to}
          <Input
            type="date"
            value={to ?? ""}
            min={from ?? undefined}
            onChange={(e) => onChange(from, e.target.value || null)}
          />
        </Label>
      </div>
    </fieldset>
  );
}

function rangeLabel(from: string | null, to: string | null) {
  if (from && to) return `${formatDate(from)} – ${formatDate(to)}`;
  if (from) return `≥ ${formatDate(from)}`;
  return `≤ ${formatDate(to)}`;
}

export function FilterBar({
  filters,
  onChange,
  options,
  children,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  options: FilterOptions;
  /** Extra toolbar controls (grouping, columns, saved views). */
  children?: React.ReactNode;
}) {
  const [text, setText] = useState(filters.q);
  const debounced = useDebounced(text, 300);
  useEffect(() => setText(filters.q), [filters.q]);
  useEffect(() => {
    if (debounced !== filters.q) onChange({ ...filters, q: debounced });
    // Only the debounced text drives this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const toggle = (field: ListField, value: string) => {
    const current = filters[field] as string[];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    onChange({ ...filters, [field]: next });
  };

  const chips: { key: string; label: string; clear: () => void }[] = [];
  for (const field of LIST_FIELDS) {
    const values = filters[field] as string[];
    if (!values.length) continue;
    const opts = optionsFor(field, options);
    const names = values.map((v) => opts.find((o) => o.value === v)?.label ?? "?");
    chips.push({
      key: field,
      label: `${it.filters.fields[field]}: ${names.join(", ")}`,
      clear: () => onChange({ ...filters, [field]: [] }),
    });
  }
  if (filters.start_from || filters.start_to) {
    chips.push({
      key: "start",
      label: `${it.filters.fields.start}: ${rangeLabel(filters.start_from, filters.start_to)}`,
      clear: () => onChange({ ...filters, start_from: null, start_to: null }),
    });
  }
  if (filters.due_from || filters.due_to) {
    chips.push({
      key: "due",
      label: `${it.filters.fields.due}: ${rangeLabel(filters.due_from, filters.due_to)}`,
      clear: () => onChange({ ...filters, due_from: null, due_to: null }),
    });
  }

  return (
    <div className="flex flex-col gap-2" role="search" aria-label={it.filters.label}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search
            className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={it.filters.search}
            aria-label={it.filters.fields.q}
            className="h-8 pl-8"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <ListFilter />
              {it.filters.add}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {LIST_FIELDS.map((field) => (
              <DropdownMenuSub key={field}>
                <DropdownMenuSubTrigger>{it.filters.fields[field]}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
                  {optionsFor(field, options).map((o) => (
                    <DropdownMenuCheckboxItem
                      key={o.value}
                      checked={(filters[field] as string[]).includes(o.value)}
                      onCheckedChange={() => toggle(field, o.value)}
                      onSelect={(e) => e.preventDefault()}
                    >
                      {o.icon}
                      <span className="truncate">{o.label}</span>
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <CalendarRange />
              {it.filters.fields.start} / {it.filters.fields.due}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="flex w-80 flex-col gap-4">
            <DateRange
              label={it.filters.fields.start}
              from={filters.start_from}
              to={filters.start_to}
              onChange={(start_from, start_to) => onChange({ ...filters, start_from, start_to })}
            />
            <DateRange
              label={it.filters.fields.due}
              from={filters.due_from}
              to={filters.due_to}
              onChange={(due_from, due_to) => onChange({ ...filters, due_from, due_to })}
            />
          </PopoverContent>
        </Popover>

        <Label className="flex items-center gap-2 text-sm font-normal">
          <Switch checked={filters.archived} onCheckedChange={(archived) => onChange({ ...filters, archived })} />
          {it.filters.showArchived}
        </Label>

        <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
      </div>

      {chips.length > 0 || filters.q ? (
        <ul className="flex flex-wrap items-center gap-1.5" aria-label={it.filters.label}>
          {chips.map((c) => (
            <li key={c.key}>
              <span className="bg-muted inline-flex max-w-xs items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 text-xs">
                <span className="truncate">{c.label}</span>
                <button
                  type="button"
                  onClick={c.clear}
                  className="hover:bg-background focus-visible:ring-ring rounded-full p-0.5 outline-none focus-visible:ring-2"
                  aria-label={t(it.filters.remove, { name: c.label })}
                >
                  <X className="size-3" />
                </button>
              </span>
            </li>
          ))}
          {activeFilterCount(filters) > 0 ? (
            <li>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  setText("");
                  onChange({ ...EMPTY_FILTERS });
                }}
              >
                {it.filters.clearAll}
              </Button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
