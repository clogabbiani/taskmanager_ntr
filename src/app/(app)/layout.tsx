import { AppShell } from "@/components/app-shell/app-shell";
import { requireMember } from "@/features/auth/session";
import { listProjects } from "@/features/projects/queries";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const member = await requireMember();
  const projects = await listProjects(member.workspaceId);

  return (
    <AppShell member={member} projects={projects}>
      {children}
    </AppShell>
  );
}
