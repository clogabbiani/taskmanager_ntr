"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Bookmark, ListTodo, Lock, Settings, Users } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { canAdmin } from "@/features/auth/permissions";
import type { ProjectSummary } from "@/features/projects/queries";
import { useSavedViews } from "@/features/views/components/saved-views-menu";
import { it } from "@/i18n/it";
import { cn } from "@/lib/utils";
import { useApp } from "./app-context";

function ProjectViews({ project, onNavigate }: { project: ProjectSummary; onNavigate?: () => void }) {
  const { data: views = [] } = useSavedViews();
  const params = useSearchParams();
  const mine = views.filter((v) => v.project_id === project.id && v.kind === "table");
  if (mine.length === 0) return null;
  return (
    <ul className="mt-0.5 ml-5 flex flex-col gap-0.5 border-l pl-2" aria-label={`${it.views.title} ${project.key}`}>
      {mine.map((v) => {
        const active = params.get("view") === v.id;
        return (
          <li key={v.id}>
            <Link
              href={`/p/${project.key}?view=${v.id}`}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(itemClass, "py-1 text-xs", active && "bg-sidebar-accent font-medium")}
            >
              {v.is_shared ? (
                <Users aria-label={it.views.shared} className="size-3.5 shrink-0" />
              ) : (
                <Bookmark aria-label={it.views.personal} className="size-3.5 shrink-0" />
              )}
              <span className="truncate">{v.name}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

const itemClass =
  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring";

export function SidebarNav({ projects, onNavigate }: { projects: ProjectSummary[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { member } = useApp();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className="flex flex-col gap-6 p-3" aria-label={it.nav.projects}>
      <div className="flex flex-col gap-1">
        <Link
          href="/my-tasks"
          onClick={onNavigate}
          aria-current={isActive("/my-tasks") ? "page" : undefined}
          className={cn(itemClass, isActive("/my-tasks") && "bg-sidebar-accent font-medium")}
        >
          <ListTodo aria-hidden="true" className="size-4" />
          {it.nav.myTasks}
        </Link>
      </div>

      <div className="flex flex-col gap-1">
        <h2 className="text-muted-foreground px-2 text-xs font-semibold tracking-wide uppercase">{it.nav.projects}</h2>
        {projects.length === 0 ? (
          <p className="text-muted-foreground px-2 text-sm">{it.nav.noProjects}</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {projects.map((p) => {
              const href = `/p/${p.key}`;
              const active = isActive(href);
              return (
                <li key={p.id}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(itemClass, active && "bg-sidebar-accent font-medium")}
                  >
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: p.color }}
                    />
                    <span className="text-muted-foreground font-mono text-xs">{p.key}</span>
                    <span className="truncate">{p.name}</span>
                    {p.is_private ? (
                      <Lock aria-label={it.nav.privateProject} className="text-muted-foreground ml-auto size-3.5" />
                    ) : null}
                  </Link>
                  {active ? <ProjectViews project={p} onNavigate={onNavigate} /> : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-1">
        {canAdmin(member.role) ? (
          <Link
            href="/settings"
            onClick={onNavigate}
            aria-current={isActive("/settings") ? "page" : undefined}
            className={cn(itemClass, isActive("/settings") && "bg-sidebar-accent font-medium")}
          >
            <Settings aria-hidden="true" className="size-4" />
            {it.nav.settings}
          </Link>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                aria-disabled="true"
                tabIndex={0}
                className={cn(itemClass, "text-muted-foreground cursor-not-allowed")}
              >
                <Settings aria-hidden="true" className="size-4" />
                {it.nav.settings}
              </span>
            </TooltipTrigger>
            <TooltipContent>{it.nav.settingsAdminOnly}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </nav>
  );
}
