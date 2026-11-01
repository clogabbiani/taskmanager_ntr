"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp } from "@/components/app-shell/app-context";
import { t } from "@/i18n/format";
import { it } from "@/i18n/it";
import { createIssue } from "../actions";
import { invalidateIssues, toastError, unwrap } from "../hooks";
import { ISSUE_TYPES, type IssueType } from "../model";
import { IssueTypeIcon } from "./bits";
import { ParentPicker } from "./parent-picker";

/** Project key of the current URL (/p/NBI/...), if any. */
function currentProjectKey(pathname: string): string | null {
  return /^\/p\/([A-Za-z]{2,6})(?:\/|$)/.exec(pathname)?.[1]?.toUpperCase() ?? null;
}

export function QuickCreateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { projects } = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  const [type, setType] = useState<IssueType>("task");
  const [parentId, setParentId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const key = currentProjectKey(pathname);
    setProjectId((projects.find((p) => p.key === key) ?? projects[0])?.id ?? "");
    setTitle("");
    setType("task");
    setParentId(null);
  }, [open, pathname, projects]);

  const project = projects.find((p) => p.id === projectId);
  const needsParent = type === "subtask" && !parentId;

  const create = useMutation({
    mutationFn: () =>
      unwrap(
        createIssue({ project_id: projectId, title: title.trim(), type, parent_id: type === "epic" ? null : parentId }),
      ),
    onSuccess: ({ key }) => {
      toast.success(t(it.quickCreate.created, { key }));
      onOpenChange(false);
      router.push(`/p/${project!.key}/issues/${key}`);
    },
    onError: toastError,
    onSettled: () => invalidateIssues(qc),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{it.quickCreate.title}</DialogTitle>
          <DialogDescription>{it.quickCreate.description}</DialogDescription>
        </DialogHeader>
        {projects.length === 0 ? (
          <p className="text-muted-foreground text-sm">{it.quickCreate.noProjects}</p>
        ) : (
          <form
            id="quick-create"
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (title.trim() && projectId && !needsParent) create.mutate();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="quick-create-title">{it.quickCreate.titleLabel}</Label>
              <Input
                id="quick-create-title"
                value={title}
                autoFocus
                maxLength={500}
                placeholder={it.quickCreate.titlePlaceholder}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>{it.quickCreate.project}</Label>
                <Select
                  value={projectId}
                  onValueChange={(v) => {
                    setProjectId(v);
                    setParentId(null);
                  }}
                >
                  <SelectTrigger className="w-full" aria-label={it.quickCreate.project}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="text-muted-foreground font-mono text-xs">{p.key}</span>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{it.quickCreate.type}</Label>
                <Select
                  value={type}
                  onValueChange={(v) => {
                    setType(v as IssueType);
                    setParentId(null);
                  }}
                >
                  <SelectTrigger className="w-full" aria-label={it.quickCreate.type}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ISSUE_TYPES.map((ty) => (
                      <SelectItem key={ty} value={ty}>
                        <IssueTypeIcon type={ty} />
                        {it.issue.types[ty]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {type !== "epic" && project ? (
              <div className="flex flex-col gap-1.5">
                <Label>{it.quickCreate.parent}</Label>
                <ParentPicker
                  projectId={project.id}
                  projectKey={project.key}
                  type={type}
                  value={parentId}
                  onChange={setParentId}
                  className="border"
                />
                {needsParent ? <p className="text-muted-foreground text-xs">{it.quickCreate.parentRequired}</p> : null}
              </div>
            ) : null}
          </form>
        )}
        <DialogFooter>
          <Button
            type="submit"
            form="quick-create"
            disabled={!title.trim() || !projectId || needsParent || create.isPending}
          >
            {it.quickCreate.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
