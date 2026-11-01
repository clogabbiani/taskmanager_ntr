import { requireAdmin } from "@/features/auth/session";
import { ProjectsSettings } from "@/features/settings/components/projects-settings";
import { listProjectConfigs } from "@/features/settings/queries";

export default async function ProjectsSettingsPage() {
  const member = await requireAdmin();
  return <ProjectsSettings projects={await listProjectConfigs(member.workspaceId)} me={member.id} />;
}
