"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { it } from "@/i18n/it";
import { cn } from "@/lib/utils";
import { IssueDetail } from "./issue-detail";

/**
 * Side panel shown when an issue URL is opened from inside the app (intercepted
 * route). Full screen below 768px; ~560px otherwise, expandable to full width.
 */
export function IssueSheet({ projectKey, number }: { projectKey: string; number: number }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const close = () => router.back();

  return (
    <Sheet open onOpenChange={(open) => !open && close()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className={cn(
          "w-full gap-0 p-0 data-[side=right]:w-full",
          expanded
            ? "data-[side=right]:sm:max-w-full"
            : "data-[side=right]:sm:max-w-full md:data-[side=right]:sm:max-w-[560px]",
        )}
      >
        <SheetTitle className="sr-only">{`${projectKey}-${number}`}</SheetTitle>
        <SheetDescription className="sr-only">{it.issue.tabs.details}</SheetDescription>
        <IssueDetail
          projectKey={projectKey}
          number={number}
          mode="sheet"
          expanded={expanded}
          onToggleExpand={() => setExpanded((e) => !e)}
          onClose={close}
        />
      </SheetContent>
    </Sheet>
  );
}
