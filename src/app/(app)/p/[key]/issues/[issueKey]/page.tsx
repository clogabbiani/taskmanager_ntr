import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IssueDetail } from "@/features/issues/components/issue-detail";
import { parseIssueKey } from "@/features/issues/model";

type Params = Promise<{ key: string; issueKey: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { issueKey } = await params;
  return { title: decodeURIComponent(issueKey).toUpperCase() };
}

/** Issue opened directly (link, reload): full page with the same detail component. */
export default async function IssuePage({ params }: { params: Params }) {
  const { issueKey } = await params;
  const parsed = parseIssueKey(decodeURIComponent(issueKey));
  if (!parsed) notFound();
  return (
    <div className="bg-background -m-4 flex min-h-[calc(100dvh-3.5rem)] flex-col md:-m-6">
      <IssueDetail projectKey={parsed.projectKey} number={parsed.number} mode="page" />
    </div>
  );
}
