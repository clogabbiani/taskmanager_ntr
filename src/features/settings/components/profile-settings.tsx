"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/features/issues/components/bits";
import { updateProfile } from "@/features/members/actions";
import { it } from "@/i18n/it";
import { useRunAction } from "./use-run-action";

export function ProfileSettings({
  user,
}: {
  user: { display_name: string; email: string; avatar_url: string | null };
}) {
  const { run, pending } = useRunAction();
  const [name, setName] = useState(user.display_name);

  return (
    <div className="flex max-w-xl flex-col gap-8">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(updateProfile({ display_name: name }), it.settings.profile.saved);
        }}
      >
        <div className="flex items-center gap-4">
          <UserAvatar user={user} className="size-14" />
          <p className="text-muted-foreground text-sm">{it.settings.profile.avatarHint}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-name">{it.settings.profile.displayName}</Label>
          <Input id="profile-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-email">{it.settings.profile.email}</Label>
          <Input id="profile-email" value={user.email} readOnly disabled />
        </div>
        <Button type="submit" className="w-fit" disabled={!name.trim() || name.trim() === user.display_name || pending}>
          {it.settings.save}
        </Button>
      </form>
      <section className="flex flex-col gap-1" aria-labelledby="profile-notifications">
        <h2 id="profile-notifications" className="text-lg font-semibold">
          {it.settings.profile.notifications}
        </h2>
        <p className="text-muted-foreground text-sm">{it.settings.profile.notificationsSoon}</p>
      </section>
    </div>
  );
}
