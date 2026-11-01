/**
 * Pure planning step of `pnpm db:seed`: turns migration/user_mapping.json into
 * the rows to upsert, so the rules are unit-testable without a database.
 */
import type { WorkspaceRole } from "../../src/db/schema";

export type MappedUser = {
  jira_display_name: string;
  email: string | null;
  role: WorkspaceRole;
  aliases?: string[];
};

export type UserMapping = { users: MappedUser[] };

export type SeedProject = {
  key: string;
  name: string;
  color: string;
  isPrivate: boolean;
  /** display names (as in user_mapping) to add to project_members */
  members: string[];
};

export const WORKSPACE = { name: "NTR Biosensors", slug: "ntr-biosensors" } as const;

export const SEED_PROJECTS: SeedProject[] = [
  { key: "NBI", name: "NTR Biosensors - Italia", color: "#0ea5e9", isPrivate: false, members: [] },
  { key: "PN", name: "Task personali NTR", color: "#a855f7", isPrivate: true, members: ["Edoardo Salamone"] },
];

/** Q1 (CLAUDE.md §10, resolved): the NTR Google Workspace domain. */
export const DEFAULT_ALLOWED_DOMAINS = ["ntrbiosensors.com"];

export type SeedPlan = {
  users: { email: string; displayName: string; role: WorkspaceRole }[];
  skipped: { displayName: string; reason: string }[];
  allowedEmails: string[];
  allowedDomains: string[];
  projects: { project: SeedProject; memberEmails: string[]; missingMembers: string[] }[];
};

const normaliseEmail = (email: string) => email.trim().toLowerCase();

export function planSeed(mapping: UserMapping, allowedDomains: string[] = DEFAULT_ALLOWED_DOMAINS): SeedPlan {
  const users: SeedPlan["users"] = [];
  const skipped: SeedPlan["skipped"] = [];
  const emailByName = new Map<string, string>();

  for (const u of mapping.users) {
    if (!u.email || !u.email.includes("@")) {
      skipped.push({ displayName: u.jira_display_name, reason: "email mancante in user_mapping.json" });
      continue;
    }
    const email = normaliseEmail(u.email);
    emailByName.set(u.jira_display_name, email);
    users.push({ email, displayName: u.jira_display_name, role: u.role });
  }

  if (!users.some((u) => u.role === "owner")) {
    throw new Error("user_mapping.json must contain exactly one user with role 'owner' and an email");
  }

  // Only mapped users are allow-listed by email; everyone else needs the Workspace domain.
  const allowedEmails = [...new Set(users.map((u) => u.email))];
  const domains = [...new Set(allowedDomains.map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean))];

  const projects = SEED_PROJECTS.map((project) => {
    const memberEmails: string[] = [];
    const missingMembers: string[] = [];
    for (const name of project.members) {
      const email = emailByName.get(name);
      if (email) memberEmails.push(email);
      else missingMembers.push(name);
    }
    return { project, memberEmails, missingMembers };
  });

  return { users, skipped, allowedEmails, allowedDomains: domains, projects };
}
