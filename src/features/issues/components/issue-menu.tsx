"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Link2, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApp } from "@/components/app-shell/app-context";
import { canAdmin, canArchive } from "@/features/auth/permissions";
import { t } from "@/i18n/format";
import { it } from "@/i18n/it";
import { archiveIssue, deleteIssue, restoreIssue } from "../actions";
import { invalidateIssues, toastError, unwrap } from "../hooks";
import type { IssueRow } from "../model";

export function IssueMenu({ issue, issueKey, projectKey }: { issue: IssueRow; issueKey: string; projectKey: string }) {
  const { member } = useApp();
  const router = useRouter();
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState("");

  const archive = useMutation({
    mutationFn: () => unwrap(issue.archived_at ? restoreIssue(issue.id) : archiveIssue(issue.id)),
    onSuccess: () => toast.success(issue.archived_at ? it.issue.restored : it.issue.archived),
    onError: toastError,
    onSettled: () => invalidateIssues(qc),
  });

  const remove = useMutation({
    mutationFn: () => unwrap(deleteIssue(issue.id, typed)),
    onSuccess: () => {
      toast.success(it.issue.deleted);
      setConfirmOpen(false);
      invalidateIssues(qc);
      router.replace(`/p/${projectKey}`);
    },
    onError: toastError,
  });

  const copyLink = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/p/${projectKey}/issues/${issueKey}`);
    toast.success(it.issue.linkCopied);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={it.issue.menu}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => void copyLink()}>
            <Link2 />
            {it.issue.copyLink}
          </DropdownMenuItem>
          {canArchive(member.role, member.id, issue.created_by) ? (
            <DropdownMenuItem onSelect={() => archive.mutate()}>
              {issue.archived_at ? <ArchiveRestore /> : <Archive />}
              {issue.archived_at ? it.issue.restore : it.issue.archive}
            </DropdownMenuItem>
          ) : null}
          {canAdmin(member.role) ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => {
                  setTyped("");
                  setConfirmOpen(true);
                }}
              >
                <Trash2 />
                {it.issue.delete}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(it.issue.deleteTitle, { key: issueKey })}</AlertDialogTitle>
            <AlertDialogDescription>{it.issue.deleteBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <form
            id={`delete-${issue.id}`}
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (typed.trim().toUpperCase() === issueKey) remove.mutate();
            }}
          >
            <Label htmlFor={`delete-key-${issue.id}`}>{t(it.issue.deleteConfirmLabel, { key: issueKey })}</Label>
            <Input
              id={`delete-key-${issue.id}`}
              value={typed}
              autoComplete="off"
              onChange={(e) => setTyped(e.target.value)}
            />
          </form>
          <AlertDialogFooter>
            <AlertDialogCancel>{it.issue.cancel}</AlertDialogCancel>
            <AlertDialogAction
              type="submit"
              form={`delete-${issue.id}`}
              variant="destructive"
              disabled={typed.trim().toUpperCase() !== issueKey || remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                remove.mutate();
              }}
            >
              {it.issue.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
