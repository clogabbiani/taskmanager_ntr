"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
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
import { canChangeRole } from "@/features/auth/permissions";
import { UserAvatar } from "@/features/issues/components/bits";
import { WORKSPACE_ROLES, type Role } from "@/features/issues/model";
import { addAllowedSignin, changeMemberRole, removeAllowedSignin, removeMember } from "@/features/members/actions";
import { t } from "@/i18n/format";
import { it } from "@/i18n/it";
import { formatDateTime } from "@/lib/dates";
import type { AllowedSignin, MemberWithRole } from "../queries";
import { useRunAction } from "./use-run-action";

export function MembersSettings({
  members,
  signins,
  me,
}: {
  members: MemberWithRole[];
  signins: AllowedSignin[];
  me: { id: string; role: Role };
}) {
  const { run, pending } = useRunAction();
  const [kind, setKind] = useState<"domain" | "email">("email");
  const [value, setValue] = useState("");

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-3" aria-labelledby="members-title">
        <h2 id="members-title" className="text-lg font-semibold">
          {it.settings.members.title}
        </h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="bg-muted/60 text-left">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  {it.settings.members.name}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {it.settings.members.email}
                </th>
                <th scope="col" className="w-44 px-3 py-2 font-medium">
                  {it.settings.members.role}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {it.settings.members.joined}
                </th>
                <th scope="col" className="w-12 px-3 py-2">
                  <span className="sr-only">{it.settings.members.remove}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const self = m.id === me.id;
                const roles = WORKSPACE_ROLES.filter((r) => r === m.role || canChangeRole(me.role, m.role, r));
                const locked = self || roles.length <= 1;
                return (
                  <tr key={m.id} className="border-t">
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2">
                        <UserAvatar user={m} />
                        {m.display_name}
                        {self ? (
                          <span className="text-muted-foreground text-xs">({it.settings.members.you})</span>
                        ) : null}
                      </span>
                    </td>
                    <td className="text-muted-foreground px-3 py-2">{m.email}</td>
                    <td className="px-3 py-2">
                      <Select
                        value={m.role}
                        disabled={locked || pending}
                        onValueChange={(role) =>
                          void run(changeMemberRole(m.id, role as Role), it.settings.members.roleChanged)
                        }
                      >
                        <SelectTrigger
                          size="sm"
                          className="w-full"
                          aria-label={`${it.settings.members.role}: ${m.display_name}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {roles.map((r) => (
                            <SelectItem key={r} value={r}>
                              {it.roles[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="text-muted-foreground px-3 py-2">{formatDateTime(m.joined_at)}</td>
                    <td className="px-3 py-2">
                      {!self && m.role !== "owner" ? (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`${it.settings.members.remove}: ${m.display_name}`}
                            >
                              <Trash2 />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{it.settings.members.remove}</AlertDialogTitle>
                              <AlertDialogDescription>
                                {t(it.settings.members.removeConfirm, { name: m.display_name })}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{it.settings.cancel}</AlertDialogCancel>
                              <AlertDialogAction
                                variant="destructive"
                                onClick={() => void run(removeMember(m.id), it.settings.members.removed)}
                              >
                                {it.settings.members.remove}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="allowlist-title">
        <div>
          <h2 id="allowlist-title" className="text-lg font-semibold">
            {it.settings.members.allowlist}
          </h2>
          <p className="text-muted-foreground text-sm">{it.settings.members.allowlistHint}</p>
        </div>
        <ul className="divide-y rounded-lg border">
          {signins.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="text-muted-foreground w-20">{it.settings.members.kinds[s.kind]}</span>
              <span className="flex-1 font-mono">{s.value}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={pending}
                aria-label={`${it.settings.members.remove}: ${s.value}`}
                onClick={() => void run(removeAllowedSignin(s.id))}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(addAllowedSignin({ kind, value }), it.settings.members.added);
            if (ok) setValue("");
          }}
        >
          <Select value={kind} onValueChange={(v) => setKind(v as "domain" | "email")}>
            <SelectTrigger className="w-32" aria-label={it.settings.members.kind}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="email">{it.settings.members.kinds.email}</SelectItem>
              <SelectItem value="domain">{it.settings.members.kinds.domain}</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={it.settings.members.valuePlaceholder}
            aria-label={it.settings.members.value}
            className="w-72"
          />
          <Button type="submit" disabled={!value.trim() || pending}>
            {it.settings.members.add}
          </Button>
        </form>
      </section>
    </div>
  );
}
