import { requireMember } from "@/features/auth/session";
import { ProfileSettings } from "@/features/settings/components/profile-settings";

export default async function ProfileSettingsPage() {
  const member = await requireMember();
  return (
    <ProfileSettings user={{ display_name: member.displayName, email: member.email, avatar_url: member.avatarUrl }} />
  );
}
