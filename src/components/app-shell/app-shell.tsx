"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, Plus, Search, X } from "lucide-react";
import type { CurrentMember } from "@/features/auth/session";
import type { ProjectSummary } from "@/features/projects/queries";
import { Button } from "@/components/ui/button";
import { canWrite } from "@/features/auth/permissions";
import { GlobalSearch } from "@/features/issues/components/global-search";
import { QuickCreateDialog } from "@/features/issues/components/quick-create-dialog";
import { it } from "@/i18n/it";
import { useHotkey } from "@/lib/use-hotkey";
import { cn } from "@/lib/utils";
import { AppProvider } from "./app-context";
import { SidebarNav } from "./sidebar-nav";
import { UserMenu } from "./user-menu";

export function AppShell({
  member,
  projects,
  children,
}: {
  member: CurrentMember;
  projects: ProjectSummary[];
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const mayCreate = canWrite(member.role) && projects.length > 0;

  useHotkey("k", () => setSearchOpen((o) => !o), { mod: true });
  useHotkey("c", () => mayCreate && setCreateOpen(true));

  return (
    <AppProvider value={{ member, projects }}>
      <div className="flex min-h-dvh">
        {mobileOpen ? (
          <div
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            aria-hidden="true"
            onClick={() => setMobileOpen(false)}
          />
        ) : null}

        <aside
          id="app-sidebar"
          className={cn(
            "bg-sidebar text-sidebar-foreground border-sidebar-border fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r transition-transform md:sticky md:top-0 md:h-dvh md:translate-x-0",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex h-14 items-center justify-between border-b px-4">
            <Link href="/" className="font-semibold tracking-tight">
              {it.app.name}
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label={it.nav.closeMenu}
              onClick={() => setMobileOpen(false)}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <SidebarNav projects={projects} onNavigate={() => setMobileOpen(false)} />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="bg-background/95 sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-3 backdrop-blur md:px-6">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label={it.nav.openMenu}
              aria-controls="app-sidebar"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
            >
              <Menu aria-hidden="true" />
            </Button>

            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-keyshortcuts="Control+K Meta+K"
              className="text-muted-foreground bg-muted/50 hover:bg-muted focus-visible:ring-ring flex h-9 w-full max-w-md items-center gap-2 rounded-md border px-3 text-sm outline-none focus-visible:ring-2"
            >
              <Search aria-hidden="true" className="size-4" />
              <span className="truncate">{it.topbar.searchPlaceholder}</span>
              <kbd className="bg-background ml-auto hidden rounded border px-1.5 font-mono text-[10px] sm:inline">
                {it.topbar.searchShortcut}
              </kbd>
            </button>

            <div className="ml-auto flex items-center gap-2">
              {mayCreate ? (
                <Button size="sm" onClick={() => setCreateOpen(true)} aria-keyshortcuts="C">
                  <Plus aria-hidden="true" />
                  <span className="hidden sm:inline">{it.topbar.newIssue}</span>
                  <kbd className="bg-primary-foreground/20 hidden rounded px-1 font-mono text-[10px] sm:inline">
                    {it.topbar.newIssueShortcut}
                  </kbd>
                </Button>
              ) : null}
              <UserMenu member={member} />
            </div>
          </header>

          <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
      {mayCreate ? <QuickCreateDialog open={createOpen} onOpenChange={setCreateOpen} /> : null}
    </AppProvider>
  );
}
