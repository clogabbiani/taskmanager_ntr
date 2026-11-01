import type { Metadata } from "next";
import { requireMember } from "@/features/auth/session";
import { canAdmin } from "@/features/auth/permissions";
import { SettingsNav } from "@/features/settings/components/settings-nav";
import { it } from "@/i18n/it";

export const metadata: Metadata = { title: it.settings.title };

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const member = await requireMember();
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{it.settings.title}</h1>
      <SettingsNav isAdmin={canAdmin(member.role)} />
      {children}
    </section>
  );
}
