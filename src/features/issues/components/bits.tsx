"use client";

import {
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  ChevronUp,
  Equal,
  ListChecks,
  SquareCheckBig,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { initials } from "@/features/auth/initials";
import { it } from "@/i18n/it";
import { cn } from "@/lib/utils";
import type { IssuePriority, IssueRisk, IssueType, LabelRow, StatusRow, UserRow } from "../model";

const TYPE_ICON: Record<IssueType, { icon: LucideIcon; className: string }> = {
  epic: { icon: Zap, className: "text-violet-600 dark:text-violet-400" },
  task: { icon: SquareCheckBig, className: "text-sky-600 dark:text-sky-400" },
  subtask: { icon: ListChecks, className: "text-teal-600 dark:text-teal-400" },
};

export function IssueTypeIcon({ type, className }: { type: IssueType; className?: string }) {
  const { icon: Icon, className: color } = TYPE_ICON[type];
  return <Icon aria-label={it.issue.types[type]} className={cn("size-4 shrink-0", color, className)} />;
}

const PRIORITY_ICON: Record<IssuePriority, { icon: LucideIcon; className: string }> = {
  highest: { icon: ChevronsUp, className: "text-red-600 dark:text-red-400" },
  high: { icon: ChevronUp, className: "text-orange-600 dark:text-orange-400" },
  medium: { icon: Equal, className: "text-amber-600 dark:text-amber-400" },
  low: { icon: ChevronDown, className: "text-sky-600 dark:text-sky-400" },
  lowest: { icon: ChevronsDown, className: "text-slate-500" },
};

export function PriorityIcon({ priority, className }: { priority: IssuePriority; className?: string }) {
  const { icon: Icon, className: color } = PRIORITY_ICON[priority];
  return <Icon aria-hidden="true" className={cn("size-4 shrink-0", color, className)} />;
}

export const RISK_COLOR: Record<IssueRisk, string> = {
  none: "#94a3b8",
  low: "#16a34a",
  medium: "#d97706",
  high: "#dc2626",
};

export function RiskDot({ risk }: { risk: IssueRisk }) {
  return (
    <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: RISK_COLOR[risk] }} />
  );
}

export function StatusDot({ color }: { color: string }) {
  return <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />;
}

export function StatusBadge({ status }: { status: Pick<StatusRow, "name" | "color"> | undefined }) {
  if (!status) return <span className="text-muted-foreground">{it.issue.none}</span>;
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-md border px-1.5 py-0.5 text-xs font-medium">
      <StatusDot color={status.color} />
      <span className="truncate">{status.name}</span>
    </span>
  );
}

export function UserAvatar({
  user,
  className,
}: {
  user: Pick<UserRow, "display_name" | "avatar_url">;
  className?: string;
}) {
  return (
    <Avatar className={cn("size-6", className)}>
      {user.avatar_url ? <AvatarImage src={user.avatar_url} alt="" referrerPolicy="no-referrer" /> : null}
      <AvatarFallback className="text-[10px]">{initials(user.display_name)}</AvatarFallback>
    </Avatar>
  );
}

/** Overlapping avatars with names in a tooltip. */
export function AvatarStack({ users, max = 3 }: { users: UserRow[]; max?: number }) {
  if (users.length === 0) return <span className="text-muted-foreground text-sm">{it.issue.unassigned}</span>;
  const shown = users.slice(0, max);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex items-center -space-x-1.5" tabIndex={-1}>
          {shown.map((u) => (
            <UserAvatar key={u.id} user={u} className="ring-background ring-2" />
          ))}
          {users.length > max ? (
            <span className="bg-muted ring-background flex size-6 items-center justify-center rounded-full text-[10px] ring-2">
              +{users.length - max}
            </span>
          ) : null}
        </span>
      </TooltipTrigger>
      <TooltipContent>{users.map((u) => u.display_name).join(", ")}</TooltipContent>
    </Tooltip>
  );
}

export function LabelChip({ label, onRemove }: { label: LabelRow; onRemove?: () => void }) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 truncate rounded-full border px-2 py-0.5 text-xs font-medium"
      style={{ borderColor: label.color, backgroundColor: `${label.color}1a` }}
    >
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: label.color }} />
      <span className="truncate">{label.name}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring -mr-0.5 rounded-full outline-none focus-visible:ring-2"
          aria-label={it.issue.removeItem.replace("{name}", label.name)}
        >
          ×
        </button>
      ) : null}
    </span>
  );
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <span
        className="bg-muted relative h-1.5 w-full min-w-10 overflow-hidden rounded-full"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
      >
        <span className="bg-primary absolute inset-y-0 left-0 rounded-full" style={{ width: `${value}%` }} />
      </span>
      <span className="text-muted-foreground w-9 shrink-0 text-right text-xs tabular-nums">{value}%</span>
    </span>
  );
}
