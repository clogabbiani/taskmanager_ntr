import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";
import { requireAdmin } from "@/features/auth/session";
import { ProjectSettings } from "@/features/settings/components/project-settings";
import { getProjectConfig, listMembers } from "@/features/settings/queries";
import { it } from "@/i18n/it";

type Params = Promise<{ key: string }>;

export default async function ProjectSettingsPage({ params }: { params: Params }) {
  const { key } = await params;
  const member = await requireAdmin();
  const [config, members] = await Promise.all([
    getProjectConfig(member.workspaceId, key),
    listMembers(member.workspaceId),
  ]);
  if (!config) notFound();
  const { project, statuses, issueCounts } = config;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/settings/projects"
          className="text-muted-foreground flex w-fit items-center gap-1 text-sm hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {it.settings.projects.back}
        </Link>
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <span aria-hidden="true" className="size-3 rounded-sm" style={{ backgroundColor: project.color }} />
          <span className="text-muted-foreground font-mono text-base">{project.key}</span>
          {project.name}
          {project.is_private ? (
            <Lock aria-label={it.nav.privateProject} className="text-muted-foreground size-4" />
          ) : null}
        </h2>
        {project.is_private && !project.member_ids.includes(member.id) ? (
          <p className="text-muted-foreground text-sm">{it.settings.projects.notMember}</p>
        ) : null}
      </div>
      <ProjectSettings project={project} statuses={statuses} issueCounts={issueCounts} members={members} />
    </div>
  );
}
