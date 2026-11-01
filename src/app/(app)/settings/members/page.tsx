import { requireAdmin } from "@/features/auth/session";
import { MembersSettings } from "@/features/settings/components/members-settings";
import { listAllowedSignins, listMembers } from "@/features/settings/queries";

export default async function MembersSettingsPage() {
  const member = await requireAdmin();
  const [members, signins] = await Promise.all([
    listMembers(member.workspaceId),
    listAllowedSignins(member.workspaceId),
  ]);
  return <MembersSettings members={members} signins={signins} me={{ id: member.id, role: member.role }} />;
}
