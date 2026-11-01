import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { requireMember } from "@/features/auth/session";
import { IssueList } from "@/features/issues/components/issue-list";
import { getProjectByKey } from "@/features/projects/queries";
import { PROJECT_VIEWS } from "@/features/projects/views";
import { it } from "@/i18n/it";

type Params = Promise<{ key: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { key } = await params;
  return { title: key.toUpperCase() };
}

export default async function ProjectPage({ params }: { params: Params }) {
  const { key } = await params;
  const member = await requireMember();
  const project = await getProjectByKey(member.workspaceId, member.id, key);
  if (!project?.can_read) notFound();

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-center gap-3">
        <span aria-hidden="true" className="size-3 rounded-sm" style={{ backgroundColor: project.color }} />
        <span className="text-muted-foreground font-mono text-sm">{project.key}</span>
        <h1 className="truncate text-2xl font-semibold">{project.name}</h1>
        {project.is_private ? (
          <Lock aria-label={it.nav.privateProject} className="text-muted-foreground size-4" />
        ) : null}
      </header>

      <Tabs defaultValue="table">
        <TabsList>
          {PROJECT_VIEWS.map((view) =>
            view.enabled ? (
              <TabsTrigger key={view.key} value={view.key}>
                {it.project.views[view.key]}
              </TabsTrigger>
            ) : (
              <Tooltip key={view.key}>
                <TooltipTrigger asChild>
                  {/* Wrapper keeps the tooltip working: disabled buttons emit no pointer events. */}
                  <span tabIndex={0}>
                    <TabsTrigger value={view.key} disabled>
                      {it.project.views[view.key]}
                    </TabsTrigger>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{it.project.viewComingSoon}</TooltipContent>
              </Tooltip>
            ),
          )}
        </TabsList>
        <TabsContent value="table">
          <IssueList projectId={project.id} projectKey={project.key} />
        </TabsContent>
      </Tabs>
    </section>
  );
}
