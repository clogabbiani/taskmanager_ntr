"use client";

import { useEffect, useState } from "react";
import { GitMerge, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createLabel, deleteLabel, mergeLabels, updateLabel } from "@/features/labels/actions";
import { t } from "@/i18n/format";
import { it } from "@/i18n/it";
import type { LabelWithUsage } from "../queries";
import { useRunAction } from "./use-run-action";

function LabelRow({ label, others }: { label: LabelWithUsage; others: LabelWithUsage[] }) {
  const { run, pending } = useRunAction();
  const [name, setName] = useState(label.name);
  const [target, setTarget] = useState("");
  const [color, setColor] = useState(label.color);
  useEffect(() => setName(label.name), [label.name]);
  useEffect(() => setColor(label.color), [label.color]);

  const commitName = () => {
    const next = name.trim();
    if (!next || next === label.name) return setName(label.name);
    void run(updateLabel(label.id, { name: next }), it.settings.labels.saved);
  };

  return (
    <tr className="border-t">
      <td className="px-3 py-1.5">
        <input
          type="color"
          value={color}
          aria-label={`${it.settings.labels.color}: ${label.name}`}
          className="h-7 w-9 cursor-pointer rounded border bg-transparent"
          onChange={(e) => setColor(e.target.value)}
          onBlur={() => color !== label.color && void run(updateLabel(label.id, { color }), it.settings.labels.saved)}
        />
      </td>
      <td className="px-3 py-1.5">
        <Input
          value={name}
          aria-label={`${it.settings.labels.name}: ${label.name}`}
          className="h-8"
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums">{label.issue_count}</td>
      <td className="px-3 py-1.5">
        <div className="flex justify-end gap-1">
          <AlertDialog onOpenChange={() => setTarget("")}>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" disabled={others.length === 0 || pending}>
                <GitMerge />
                {it.settings.labels.merge}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t(it.settings.labels.mergeTitle, { name: label.name })}</AlertDialogTitle>
                <AlertDialogDescription>{t(it.settings.labels.mergeBody, { name: label.name })}</AlertDialogDescription>
              </AlertDialogHeader>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger className="w-full" aria-label={it.settings.labels.mergeTarget}>
                  <SelectValue placeholder={it.settings.labels.mergeTarget} />
                </SelectTrigger>
                <SelectContent>
                  {others.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      <span aria-hidden="true" className="size-2.5 rounded-full" style={{ backgroundColor: o.color }} />
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <AlertDialogFooter>
                <AlertDialogCancel>{it.settings.cancel}</AlertDialogCancel>
                <AlertDialogAction
                  disabled={!target}
                  onClick={() => void run(mergeLabels(label.id, target), it.settings.labels.merged)}
                >
                  {it.settings.labels.merge}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={pending}
                aria-label={`${it.settings.labels.delete}: ${label.name}`}
              >
                <Trash2 />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t(it.settings.labels.deleteTitle, { name: label.name })}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t(it.settings.labels.deleteBody, { n: label.issue_count })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{it.settings.cancel}</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => void run(deleteLabel(label.id), it.settings.labels.deleted)}
                >
                  {it.settings.labels.delete}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </td>
    </tr>
  );
}

export function LabelsSettings({ labels }: { labels: LabelWithUsage[] }) {
  const { run, pending } = useRunAction();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#2563eb");

  return (
    <section className="flex flex-col gap-4" aria-labelledby="labels-title">
      <h2 id="labels-title" className="text-lg font-semibold">
        {it.settings.labels.title}
      </h2>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(createLabel({ name, color }), it.settings.labels.saved)) setName("");
        }}
      >
        <input
          type="color"
          value={color}
          aria-label={it.settings.labels.color}
          className="h-8 w-10 cursor-pointer rounded border bg-transparent"
          onChange={(e) => setColor(e.target.value)}
        />
        <Input
          value={name}
          maxLength={50}
          placeholder={it.settings.labels.new}
          aria-label={it.settings.labels.new}
          className="w-64"
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" disabled={!name.trim() || pending}>
          {it.settings.labels.create}
        </Button>
      </form>
      {labels.length === 0 ? (
        <p className="text-muted-foreground text-sm">{it.settings.labels.empty}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="bg-muted/60 text-left">
              <tr>
                <th scope="col" className="w-16 px-3 py-2 font-medium">
                  {it.settings.labels.color}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {it.settings.labels.name}
                </th>
                <th scope="col" className="w-20 px-3 py-2 text-right font-medium">
                  {it.settings.labels.usage}
                </th>
                <th scope="col" className="w-48 px-3 py-2">
                  <span className="sr-only">{it.settings.labels.merge}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {labels.map((l) => (
                <LabelRow key={l.id} label={l} others={labels.filter((o) => o.id !== l.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
