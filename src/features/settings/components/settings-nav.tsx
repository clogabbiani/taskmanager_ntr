"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { it } from "@/i18n/it";
import { cn } from "@/lib/utils";

const ADMIN_LINKS = [
  { href: "/settings/members", label: it.settings.nav.members },
  { href: "/settings/labels", label: it.settings.nav.labels },
  { href: "/settings/projects", label: it.settings.nav.projects },
];

export function SettingsNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const links = [...(isAdmin ? ADMIN_LINKS : []), { href: "/settings/profile", label: it.settings.nav.profile }];
  return (
    <nav aria-label={it.settings.title} className="flex gap-1 overflow-x-auto border-b">
      {links.map((l) => {
        const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "focus-visible:ring-ring -mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap outline-none focus-visible:ring-2",
              active ? "border-primary font-medium" : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
