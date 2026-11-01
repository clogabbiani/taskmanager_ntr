/**
 * pnpm db:seed — idempotent bootstrap of the NTR workspace (CLAUDE.md §4, §9 M0).
 *
 * Connects with DATABASE_URL (direct Postgres connection, bypasses RLS). Never
 * imported by application code. Re-running it is safe: existing rows are kept,
 * missing ones are added.
 *
 *   SEED_ALLOWED_DOMAINS=ntrbiosensors.it pnpm db:seed   # optional, once Q1 is resolved
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { planSeed, WORKSPACE, type UserMapping } from "./lib/seed-plan";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");

  const mapping = JSON.parse(
    readFileSync(path.resolve(__dirname, "../migration/user_mapping.json"), "utf8"),
  ) as UserMapping;
  const domains = (process.env.SEED_ALLOWED_DOMAINS ?? "").split(",");
  const plan = planSeed(mapping, domains);

  const sql = postgres(url, { prepare: false, max: 1 });
  try {
    await sql.begin(async (tx) => {
      const [ws] = await tx<{ id: string }[]>`
        INSERT INTO workspaces (name, slug) VALUES (${WORKSPACE.name}, ${WORKSPACE.slug})
        ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
        RETURNING id`;
      const workspaceId = ws!.id;

      for (const email of plan.allowedEmails) {
        await tx`
          INSERT INTO allowed_signins (workspace_id, kind, value) VALUES (${workspaceId}, 'email', ${email})
          ON CONFLICT DO NOTHING`;
      }
      for (const domain of plan.allowedDomains) {
        await tx`
          INSERT INTO allowed_signins (workspace_id, kind, value) VALUES (${workspaceId}, 'domain', ${domain})
          ON CONFLICT DO NOTHING`;
      }

      const userIds = new Map<string, string>();
      for (const u of plan.users) {
        // Placeholder id: re-keyed to auth.users.id by claim_signin() at first login (ADR-001).
        const [row] = await tx<{ id: string }[]>`
          INSERT INTO users (email, display_name) VALUES (${u.email}, ${u.displayName})
          ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
          RETURNING id`;
        userIds.set(u.email, row!.id);
        // Apply the mapped role, but never touch a role already changed from the default.
        await tx`
          INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (${workspaceId}, ${row!.id}, ${u.role})
          ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role
          WHERE workspace_members.role = 'member'`;
        await tx`INSERT INTO notification_prefs (user_id) VALUES (${row!.id}) ON CONFLICT DO NOTHING`;
      }

      for (const { project, memberEmails } of plan.projects) {
        // Default statuses are created by the projects_default_statuses trigger.
        const [p] = await tx<{ id: string }[]>`
          INSERT INTO projects (workspace_id, key, name, color, is_private)
          VALUES (${workspaceId}, ${project.key}, ${project.name}, ${project.color}, ${project.isPrivate})
          ON CONFLICT (workspace_id, key) DO UPDATE SET key = EXCLUDED.key
          RETURNING id`;
        for (const email of memberEmails) {
          await tx`
            INSERT INTO project_members (project_id, user_id) VALUES (${p!.id}, ${userIds.get(email)!})
            ON CONFLICT DO NOTHING`;
        }
      }
    });
  } finally {
    await sql.end();
  }

  console.log(`Workspace "${WORKSPACE.name}" pronto.`);
  console.log(`Utenti seminati: ${plan.users.map((u) => `${u.displayName} (${u.role})`).join(", ")}`);
  console.log(`allowed_signins email: ${plan.allowedEmails.join(", ")}`);
  if (plan.allowedDomains.length) console.log(`allowed_signins domini: ${plan.allowedDomains.join(", ")}`);
  for (const s of plan.skipped) console.warn(`SALTATO ${s.displayName}: ${s.reason}`);
  for (const { project, missingMembers } of plan.projects) {
    console.log(`Progetto ${project.key}${project.isPrivate ? " (privato)" : ""} pronto.`);
    for (const name of missingMembers) {
      console.warn(`ATTENZIONE ${project.key}: membro ${name} non aggiunto (email mancante).`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
