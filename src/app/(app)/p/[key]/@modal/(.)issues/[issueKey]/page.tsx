import { notFound } from "next/navigation";
import { IssueSheet } from "@/features/issues/components/issue-sheet";
import { parseIssueKey } from "@/features/issues/model";

type Params = Promise<{ key: string; issueKey: string }>;

/** Issue opened from inside the app: side panel over the current project view. */
export default async function IssueSheetRoute({ params }: { params: Params }) {
  const { issueKey } = await params;
  const parsed = parseIssueKey(decodeURIComponent(issueKey));
  if (!parsed) notFound();
  return <IssueSheet projectKey={parsed.projectKey} number={parsed.number} />;
}
