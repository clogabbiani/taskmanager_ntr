import { redirect } from "next/navigation";
import { requireMember } from "@/features/auth/session";
import { listProjects } from "@/features/projects/queries";
import { it } from "@/i18n/it";

export default async function HomePage() {
  const member = await requireMember();
  const [first] = await listProjects(member.workspaceId, member.id);
  if (first) redirect(`/p/${first.key}`);

  return (
    <section className="mx-auto max-w-xl py-16 text-center">
      <h1 className="text-2xl font-semibold">{it.home.title}</h1>
      <p className="text-muted-foreground mt-2">{it.home.body}</p>
    </section>
  );
}
