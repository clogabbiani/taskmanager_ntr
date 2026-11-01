"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ListTodo, Lock } from "lucide-react";
import type { ProjectSummary } from "@/features/projects/queries";
import { it } from "@/i18n/it";
import { cn } from "@/lib/utils";

const itemClass =
  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring";

export function SidebarNav({ projects, onNavigate }: { projects: ProjectSummary[]; onNavigate?: () => void }) {
  const pathname = usePathname();
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
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </nav>
  );
}
