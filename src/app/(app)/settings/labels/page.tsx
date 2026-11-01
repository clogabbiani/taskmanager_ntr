import { requireAdmin } from "@/features/auth/session";
import { LabelsSettings } from "@/features/settings/components/labels-settings";
import { listLabelsWithUsage } from "@/features/settings/queries";

export default async function LabelsSettingsPage() {
  const member = await requireAdmin();
  return <LabelsSettings labels={await listLabelsWithUsage(member.workspaceId)} />;
}
