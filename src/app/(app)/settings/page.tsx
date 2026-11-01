import { redirect } from "next/navigation";
import { canAdmin } from "@/features/auth/permissions";
import { requireMember } from "@/features/auth/session";

export default async function SettingsIndex() {
  const member = await requireMember();
  redirect(canAdmin(member.role) ? "/settings/members" : "/settings/profile");
}
