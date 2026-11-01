"use client";

/**
 * Inline field editors shared by the issue detail panel and the table cells.
 * Each editor is controlled: it shows `value` and calls `onChange` with the new
 * value once the user commits (select, Enter, blur, slider release).
 */
import { useEffect, useState } from "react";
import { CalendarIcon, Check, Plus, X } from "lucide-react";
import { it as dayPickerIt } from "react-day-picker/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { t } from "@/i18n/format";
import { it } from "@/i18n/it";
import { formatDate, parseIsoDate, toIsoDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import {
  ISSUE_PRIORITIES,
  ISSUE_RISKS,
  type IssuePriority,
  type IssueRisk,
  type IssueType,
  type LabelRow,
  type StatusRow,
  type UserRow,
} from "../model";
import { AvatarStack, IssueTypeIcon, LabelChip, PriorityIcon, RiskDot, StatusDot, UserAvatar } from "./bits";

type Base = { disabled?: boolean; className?: string; "aria-label"?: string };

const triggerClass = "h-8 w-full justify-start gap-2 px-2 font-normal";

// ---------------------------------------------------------------------------
// Selects
// ---------------------------------------------------------------------------

export function StatusSelect({
  statuses,
  value,
  onChange,
  ...base
}: Base & { statuses: StatusRow[]; value: string; onChange: (id: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange} disabled={base.disabled}>
      <SelectTrigger
        size="sm"
        className={cn(triggerClass, base.className)}
        aria-label={base["aria-label"] ?? it.issue.fields.status}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {statuses.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            <StatusDot color={s.color} />
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function PrioritySelect({
  value,
  onChange,
  ...base
}: Base & { value: IssuePriority; onChange: (v: IssuePriority) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as IssuePriority)} disabled={base.disabled}>
      <SelectTrigger
        size="sm"
        className={cn(triggerClass, base.className)}
        aria-label={base["aria-label"] ?? it.issue.fields.priority}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {[...ISSUE_PRIORITIES].reverse().map((p) => (
          <SelectItem key={p} value={p}>
            <PriorityIcon priority={p} />
            {it.issue.priorities[p]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function RiskSelect({
  value,
  onChange,
  ...base
}: Base & { value: IssueRisk; onChange: (v: IssueRisk) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as IssueRisk)} disabled={base.disabled}>
      <SelectTrigger
        size="sm"
        className={cn(triggerClass, base.className)}
        aria-label={base["aria-label"] ?? it.issue.fields.risk}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ISSUE_RISKS.map((r) => (
          <SelectItem key={r} value={r}>
            <RiskDot risk={r} />
            {it.issue.risks[r]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function TypeSelect({
  value,
  allowed,
  onChange,
  ...base
}: Base & { value: IssueType; allowed: readonly IssueType[]; onChange: (v: IssueType) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as IssueType)} disabled={base.disabled}>
      <SelectTrigger
        size="sm"
        className={cn(triggerClass, base.className)}
        aria-label={base["aria-label"] ?? it.issue.fields.type}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allowed.map((type) => (
          <SelectItem key={type} value={type}>
            <IssueTypeIcon type={type} />
            {it.issue.types[type]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ---------------------------------------------------------------------------
// Multi pickers
// ---------------------------------------------------------------------------

function toggle(list: readonly string[], id: string) {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export function AssigneePicker({
  members,
  value,
  onChange,
  ...base
}: Base & { members: UserRow[]; value: string[]; onChange: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const selected = members.filter((m) => value.includes(m.id));

  // Changes are committed when the popover closes, so picking three people is one save.
  const onOpenChange = (next: boolean) => {
    if (next) setDraft(value);
    else if (draft.slice().sort().join() !== value.slice().sort().join()) onChange(draft);
    setOpen(next);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={base.disabled}
          className={cn(triggerClass, base.className)}
          aria-label={base["aria-label"] ?? it.issue.fields.assignees}
        >
          <AvatarStack users={selected} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder={it.issue.searchUsers} />
          <CommandList>
            <CommandEmpty>{it.issue.noResults}</CommandEmpty>
            <CommandGroup>
              {members.map((m) => (
                <CommandItem
                  key={m.id}
                  value={`${m.display_name} ${m.email}`}
                  onSelect={() => setDraft((d) => toggle(d, m.id))}
                >
                  <UserAvatar user={m} className="size-5" />
                  <span className="truncate">{m.display_name}</span>
                  <Check className={cn("ml-auto", draft.includes(m.id) ? "opacity-100" : "opacity-0")} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function LabelPicker({
  labels,
  value,
  onChange,
  onCreate,
  ...base
}: Base & {
  labels: LabelRow[];
  value: string[];
  onChange: (ids: string[]) => void;
  /** Present only for admins/owners: creates a label and returns its id. */
  onCreate?: (name: string) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [search, setSearch] = useState("");
  const selected = labels.filter((l) => value.includes(l.id));
  const exact = labels.some((l) => l.name.toLowerCase() === search.trim().toLowerCase());

  const onOpenChange = (next: boolean) => {
    if (next) setDraft(value);
    else if (draft.slice().sort().join() !== value.slice().sort().join()) onChange(draft);
    setOpen(next);
    setSearch("");
  };

  const create = async () => {
    const id = await onCreate?.(search.trim());
    if (id) setDraft((d) => [...d, id]);
    setSearch("");
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={base.disabled}
          className={cn("h-auto min-h-8 w-full flex-wrap justify-start gap-1 px-2 py-1 font-normal", base.className)}
          aria-label={base["aria-label"] ?? it.issue.fields.labels}
        >
          {selected.length === 0 ? (
            <span className="text-muted-foreground">{it.issue.noLabels}</span>
          ) : (
            selected.map((l) => <LabelChip key={l.id} label={l} />)
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder={it.issue.searchLabels} value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>{it.issue.noResults}</CommandEmpty>
            <CommandGroup>
              {labels.map((l) => (
                <CommandItem key={l.id} value={l.name} onSelect={() => setDraft((d) => toggle(d, l.id))}>
                  <span aria-hidden="true" className="size-2.5 rounded-full" style={{ backgroundColor: l.color }} />
                  <span className="truncate">{l.name}</span>
                  <Check className={cn("ml-auto", draft.includes(l.id) ? "opacity-100" : "opacity-0")} />
                </CommandItem>
              ))}
              {onCreate && search.trim() && !exact ? (
                <CommandItem value={`__create__${search}`} onSelect={() => void create()}>
                  <Plus />
                  {t(it.issue.createLabel, { name: search.trim() })}
                </CommandItem>
              ) : null}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Dates and numbers
// ---------------------------------------------------------------------------

export function DateField({
  value,
  onChange,
  min,
  max,
  ...base
}: Base & { value: string | null; onChange: (v: string | null) => void; min?: string | null; max?: string | null }) {
  const [open, setOpen] = useState(false);
  const date = parseIsoDate(value);
  const minDate = parseIsoDate(min);
  const maxDate = parseIsoDate(max);
  return (
    <div className={cn("flex items-center gap-1", base.className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={base.disabled}
            className={triggerClass}
            aria-label={base["aria-label"]}
          >
            <CalendarIcon className="text-muted-foreground" />
            {date ? formatDate(value) : <span className="text-muted-foreground">{it.issue.noDate}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            locale={dayPickerIt}
            selected={date ?? undefined}
            defaultMonth={date ?? minDate ?? undefined}
            disabled={[...(minDate ? [{ before: minDate }] : []), ...(maxDate ? [{ after: maxDate }] : [])]}
            onSelect={(d) => {
              setOpen(false);
              const next = d ? toIsoDate(d) : null;
              if (next !== value) onChange(next);
            }}
          />
        </PopoverContent>
      </Popover>
      {value && !base.disabled ? (
        <Button variant="ghost" size="icon-xs" onClick={() => onChange(null)} aria-label={it.issue.clear}>
          <X />
        </Button>
      ) : null}
    </div>
  );
}

export function NumberField({
  value,
  onChange,
  min = 0,
  max = 10_000,
  ...base
}: Base & { value: number | null; onChange: (v: number | null) => void; min?: number; max?: number }) {
  const [draft, setDraft] = useState(value?.toString() ?? "");
  useEffect(() => setDraft(value?.toString() ?? ""), [value]);

  const commit = () => {
    const trimmed = draft.trim();
    const next = trimmed === "" ? null : Math.min(max, Math.max(min, Math.round(Number(trimmed))));
    if (trimmed !== "" && Number.isNaN(next)) return setDraft(value?.toString() ?? "");
    setDraft(next?.toString() ?? "");
    if (next !== value) onChange(next);
  };

  return (
    <Input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={draft}
      disabled={base.disabled}
      aria-label={base["aria-label"]}
      className={cn("h-8 w-24", base.className)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setDraft(value?.toString() ?? "");
      }}
    />
  );
}

export function ProgressField({ value, onChange, ...base }: Base & { value: number; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div className={cn("flex items-center gap-3", base.className)}>
      <Slider
        value={[draft]}
        min={0}
        max={100}
        step={5}
        disabled={base.disabled}
        aria-label={base["aria-label"] ?? it.issue.fields.progress}
        onValueChange={([v]) => setDraft(v ?? 0)}
        onValueCommit={([v]) => v !== value && onChange(v ?? 0)}
        className="flex-1"
      />
      <NumberField
        value={draft}
        min={0}
        max={100}
        disabled={base.disabled}
        aria-label={it.issue.fields.progress}
        className="w-20"
        onChange={(v) => v !== null && v !== value && onChange(v)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// External collaborators (free-text chips with autocomplete)
// ---------------------------------------------------------------------------

export function CollaboratorsInput({
  value,
  suggestions,
  onChange,
  ...base
}: Base & { value: string[]; suggestions: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const lower = value.map((v) => v.toLowerCase());
  const matches = suggestions
    .filter((s) => !lower.includes(s.toLowerCase()) && s.toLowerCase().includes(draft.trim().toLowerCase()))
    .slice(0, 8);

  const add = (name: string) => {
    const clean = name.trim();
    setDraft("");
    if (!clean || lower.includes(clean.toLowerCase())) return;
    onChange([...value, clean]);
  };

  return (
    <div className={cn("relative", base.className)}>
      <div className="focus-within:ring-ring/50 flex min-h-8 flex-wrap items-center gap-1 rounded-md border px-1.5 py-1 focus-within:ring-3">
        {value.map((name) => (
          <span key={name} className="bg-muted inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs">
            {name}
            {!base.disabled ? (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-full outline-none focus-visible:ring-2"
                aria-label={t(it.issue.removeItem, { name })}
                onClick={() => onChange(value.filter((v) => v !== name))}
              >
                <X className="size-3" />
              </button>
            ) : null}
          </span>
        ))}
        {!base.disabled ? (
          <input
            value={draft}
            aria-label={base["aria-label"] ?? it.issue.fields.external_collaborators}
            placeholder={value.length === 0 ? it.issue.collaboratorsPlaceholder : ""}
            className="placeholder:text-muted-foreground min-w-24 flex-1 bg-transparent px-1 text-sm outline-none"
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                add(draft);
              } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
                onChange(value.slice(0, -1));
              }
            }}
          />
        ) : null}
      </div>
      {focused && matches.length > 0 ? (
        <ul className="bg-popover text-popover-foreground absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border p-1 shadow-md">
          {matches.map((m) => (
            <li key={m}>
              <button
                type="button"
                className="hover:bg-accent w-full rounded-sm px-2 py-1 text-left text-sm"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(m)}
              >
                {m}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
