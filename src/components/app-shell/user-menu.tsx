"use client";

import { LogOut, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import type { CurrentMember } from "@/features/auth/session";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initials } from "@/features/auth/initials";
import { it } from "@/i18n/it";

export function UserMenu({ member }: { member: CurrentMember }) {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label={it.userMenu.label}>
          <Avatar className="size-8">
            {member.avatarUrl ? <AvatarImage src={member.avatarUrl} alt="" referrerPolicy="no-referrer" /> : null}
            <AvatarFallback>{initials(member.displayName)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate">{member.displayName}</span>
          <span className="text-muted-foreground truncate text-xs font-normal">{member.email}</span>
          <span className="text-muted-foreground text-xs font-normal">
            {member.workspaceName} · {it.roles[member.role]}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>{it.userMenu.theme}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
              <DropdownMenuRadioItem value="light">
                <Sun aria-hidden="true" />
                {it.userMenu.themeLight}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon aria-hidden="true" />
                {it.userMenu.themeDark}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <Monitor aria-hidden="true" />
                {it.userMenu.themeSystem}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <form action="/auth/signout" method="post">
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOut aria-hidden="true" />
              {it.auth.logout}
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
