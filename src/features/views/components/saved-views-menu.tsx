"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Check, Trash2, Users } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useApp } from "@/components/app-shell/app-context";
import { canEditView } from "@/features/auth/permissions";
import { toastError, unwrap } from "@/features/issues/hooks";
import { t } from "@/i18n/format";
import { it } from "@/i18n/it";
import { useSupabase } from "@/lib/supabase/use-supabase";
import { createView, deleteView, updateView } from "../actions";
import { fetchSavedViews, savedViewsKey, type SavedView } from "../queries";
import type { ViewState } from "../use-view-state";

export function useSavedViews() {
  const supabase = useSupabase();
  const { member } = useApp();
  return useQuery({
    queryKey: savedViewsKey(member.workspaceId),
    queryFn: () => fetchSavedViews(supabase, member.workspaceId),
  });
}

export function SavedViewsMenu({ projectId, state }: { projectId: string; state: ViewState }) {
  const { member } = useApp();
  const qc = useQueryClient();
  const { data: all = [] } = useSavedViews();
  const views = all.filter((v) => v.project_id === projectId && v.kind === "table");
  const current = views.find((v) => v.id === state.viewId);
  const [dialog, setDialog] = useState(false);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: savedViewsKey(member.workspaceId) });

  // A link with only ?view=<id> (sidebar) loads that view's filters, sort and columns.
  const params = useSearchParams();
  const onlyView = [...params.keys()].every((k) => k === "view");
  useEffect(() => {
    if (current && onlyView && (current.config.query || current.config.columns)) {
      state.applyView(current.id, current.config);
    }
    // Run when the selected view or its data arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, onlyView]);

  const save = useMutation({
    mutationFn: () =>
      unwrap(
        createView({ project_id: projectId, name, kind: "table", config: state.currentConfig(), is_shared: shared }),
      ),
    onSuccess: ({ id }) => {
      toast.success(it.views.saved);
      setDialog(false);
      void refresh();
      state.applyView(id, state.currentConfig());
    },
    onError: toastError,
  });

  const update = useMutation({
    mutationFn: (v: SavedView) => unwrap(updateView(v.id, { config: state.currentConfig() })),
    onSuccess: () => {
      toast.success(it.views.updated);
      void refresh();
    },
    onError: toastError,
  });

  const remove = useMutation({
    mutationFn: (v: SavedView) => unwrap(deleteView(v.id)),
    onSuccess: (_d, v) => {
      toast.success(it.views.deleted);
      void refresh();
      if (v.id === state.viewId) state.applyView(null);
    },
    onError: toastError,
  });

  const editable = (v: SavedView) => canEditView(member.role, member.id, v);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <Bookmark />
            <span className="max-w-40 truncate">{current ? current.name : it.views.title}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>{it.views.title}</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => state.applyView(null)}>
            {it.views.reset}
            {!state.viewId ? <Check className="ml-auto" /> : null}
          </DropdownMenuItem>
          {views.length === 0 ? (
            <p className="text-muted-foreground px-2 py-1.5 text-xs">{it.views.none}</p>
          ) : (
            views.map((v) => (
              <DropdownMenuItem key={v.id} onSelect={() => state.applyView(v.id, v.config)}>
                {v.is_shared ? <Users aria-label={it.views.shared} /> : <Bookmark aria-label={it.views.personal} />}
                <span className="truncate">{v.name}</span>
                {v.id === state.viewId ? <Check className="ml-auto" /> : null}
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          {current && editable(current) ? (
            <DropdownMenuItem onSelect={() => update.mutate(current)}>{it.views.update}</DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onSelect={() => {
              setName("");
              setShared(false);
              setDialog(true);
            }}
          >
            {current ? it.views.saveAs : it.views.save}
          </DropdownMenuItem>
          {current && editable(current) ? (
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => {
                if (window.confirm(t(it.views.deleteConfirm, { name: current.name }))) remove.mutate(current);
              }}
            >
              <Trash2 />
              {it.views.delete}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{it.views.save}</DialogTitle>
            <DialogDescription>{it.views.sharedHint}</DialogDescription>
          </DialogHeader>
          <form
            id="save-view"
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) save.mutate();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="view-name">{it.views.name}</Label>
              <Input id="view-name" value={name} maxLength={80} autoFocus onChange={(e) => setName(e.target.value)} />
            </div>
            <Label className="flex items-center gap-2 font-normal">
              <Switch checked={shared} onCheckedChange={setShared} />
              {it.views.shared}
            </Label>
          </form>
          <DialogFooter>
            <Button type="submit" form="save-view" disabled={!name.trim() || save.isPending}>
              {it.views.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
