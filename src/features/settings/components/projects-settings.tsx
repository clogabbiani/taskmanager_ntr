"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, Lock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createProject } from "@/features/projects/actions";
import { it } from "@/i18n/it";
import type { ProjectConfig } from "../queries";
import { useRunAction } from "./use-run-action";

export type ProjectFormValue = { name: string; description: string; color: string; is_private: boolean };

/** Name, description, colour and privacy fields shared by create and edit. */
export function ProjectFields({
  value,
  onChange,
  idPrefix,
}: {
  value: ProjectFormValue;
  onChange: (v: ProjectFormValue) => void;
  idPrefix: string;
}) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-name`}>{it.settings.projects.name}</Label>
        <Input
          id={`${idPrefix}-name`}
          value={value.name}
          maxLength={100}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-description`}>{it.settings.projects.description}</Label>
        <Textarea
          id={`${idPrefix}-description`}
          value={value.description}
          maxLength={2000}
          rows={3}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
        />
      </div>
      <div className="flex items-center gap-6">
        <Label className="flex items-center gap-2 font-normal">
          <input
            type="color"
            value={value.color}
            className="h-8 w-10 cursor-pointer rounded border bg-transparent"
            onChange={(e) => onChange({ ...value, color: e.target.value })}
          />
          {it.settings.projects.color}
        </Label>
        <Label className="flex items-center gap-2 font-normal">
          <Switch checked={value.is_private} onCheckedChange={(is_private) => onChange({ ...value, is_private })} />
          {it.settings.projects.private}
        </Label>
      </div>
      {value.is_private ? <p className="text-muted-foreground text-xs">{it.settings.projects.privateHint}</p> : null}
    </>
  );
}

function CreateProjectDialog() {
  const router = useRouter();
  const { run, pending } = useRunAction();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [value, setValue] = useState<ProjectFormValue>({
    name: "",
    description: "",
    color: "#2563eb",
    is_private: false,
  });
  const validKey = /^[A-Z]{2,6}$/.test(key);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setKey("");
          setValue({ name: "", description: "", color: "#2563eb", is_private: false });
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus />
          {it.settings.projects.new}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{it.settings.projects.new}</DialogTitle>
          <DialogDescription>{it.settings.projects.keyHint}</DialogDescription>
        </DialogHeader>
        <form
          id="create-project"
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const created = await run(
              createProject({ ...value, key, description: value.description.trim() || null }),
              it.settings.projects.created,
            );
            if (created) {
              setOpen(false);
              router.push(`/settings/projects/${created.key}`);
            }
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-project-key">{it.settings.projects.key}</Label>
            <Input
              id="new-project-key"
              value={key}
              maxLength={6}
              className="w-32 font-mono uppercase"
              aria-invalid={key.length > 0 && !validKey}
              onChange={(e) => setKey(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
            />
          </div>
          <ProjectFields value={value} onChange={setValue} idPrefix="new-project" />
        </form>
        <DialogFooter>
          <Button type="submit" form="create-project" disabled={!validKey || !value.name.trim() || pending}>
            {it.settings.projects.create}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProjectsSettings({ projects, me }: { projects: ProjectConfig[]; me: string }) {
  return (
    <section className="flex flex-col gap-4" aria-labelledby="projects-title">
      <div className="flex items-center justify-between gap-2">
        <h2 id="projects-title" className="text-lg font-semibold">
          {it.settings.projects.title}
        </h2>
        <CreateProjectDialog />
      </div>
      <ul className="divide-y rounded-lg border">
        {projects.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
            <span aria-hidden="true" className="size-3 rounded-sm" style={{ backgroundColor: p.color }} />
            <span className="text-muted-foreground w-14 font-mono">{p.key}</span>
            <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
            {p.is_private ? (
              <span className="text-muted-foreground flex items-center gap-1 text-xs">
                <Lock className="size-3.5" aria-hidden="true" />
                {it.settings.projects.private}
                {!p.member_ids.includes(me) ? ` · ${it.settings.projects.notMember}` : null}
              </span>
            ) : null}
            {p.archived_at ? (
              <span className="text-muted-foreground flex items-center gap-1 text-xs">
                <Archive className="size-3.5" aria-hidden="true" />
                {it.settings.projects.archived}
              </span>
            ) : null}
            <Button variant="outline" size="sm" asChild>
              <Link href={`/settings/projects/${p.key}`}>{it.settings.projects.manage}</Link>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
