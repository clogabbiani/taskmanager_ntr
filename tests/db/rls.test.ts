import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const WS = "00000000-0000-0000-0000-0000000000a1";
const OWNER_PLACEHOLDER = "00000000-0000-0000-0000-00000000f001";
const OWNER_AUTH = "00000000-0000-0000-0000-0000000000c1";
const ADMIN = "00000000-0000-0000-0000-0000000000c2";
const MEMBER = "00000000-0000-0000-0000-0000000000c3";
const VIEWER = "00000000-0000-0000-0000-0000000000c4";
const OUTSIDER = "00000000-0000-0000-0000-0000000000c9";

type Claims = { sub: string; email: string; user_metadata: Record<string, unknown> };
const claims = (sub: string, email: string): Claims => ({ sub, email, user_metadata: { full_name: email } });
const owner = claims(OWNER_AUTH, "owner@gmail.com");
const admin = claims(ADMIN, "admin@ntr.test");
const member = claims(MEMBER, "member@ntr.test");
const viewer = claims(VIEWER, "viewer@ntr.test");

let db: PGlite;
let nbi: string;
let pn: string;
let todo: string;

async function count(sql: string, params: unknown[] = []) {
  const r = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM (${sql}) q`, params);
  return r.rows[0]!.n;
}

async function claim(c: Claims) {
  return asUser(db, c, async () => (await db.query<{ ok: boolean }>(`SELECT claim_signin() AS ok`)).rows[0]!.ok);
}

async function affected(c: Claims, sql: string, params: unknown[] = []) {
  return asUser(db, c, async () => (await db.query(sql, params)).affectedRows ?? 0);
}

async function insertIssue(c: Claims, type = "task", parent: string | null = null) {
  return asUser(db, c, async () => {
    const n = (await db.query<{ n: number }>(`SELECT next_issue_number($1) AS n`, [nbi])).rows[0]!.n;
    const r = await db.query<{ id: string }>(
      `INSERT INTO issues (project_id, number, type, parent_id, title, status_id, created_by)
       VALUES ($1, $2, $3, $4, 'T', $5, $6) RETURNING id`,
      [nbi, n, type, parent, todo, c.sub],
    );
    return r.rows[0]!.id;
  });
}

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(`
    INSERT INTO workspaces (id, name, slug) VALUES ('${WS}', 'NTR Biosensors', 'ntr');
    INSERT INTO allowed_signins (workspace_id, kind, value) VALUES
      ('${WS}', 'email', 'Owner@gmail.com'), ('${WS}', 'domain', 'ntr.test');
    INSERT INTO users (id, email, display_name) VALUES
      ('${OWNER_PLACEHOLDER}', 'owner@gmail.com', 'Owner'),
      ('${ADMIN}', 'admin@ntr.test', 'Admin'),
      ('${MEMBER}', 'member@ntr.test', 'Member'),
      ('${VIEWER}', 'viewer@ntr.test', 'Viewer');
    INSERT INTO workspace_members (workspace_id, user_id, role) VALUES
      ('${WS}', '${OWNER_PLACEHOLDER}', 'owner'), ('${WS}', '${ADMIN}', 'admin'),
      ('${WS}', '${MEMBER}', 'member'), ('${WS}', '${VIEWER}', 'viewer');
  `);
  const insertProject = async (key: string, isPrivate: boolean) =>
    (
      await db.query<{ id: string }>(
        `INSERT INTO projects (workspace_id, key, name, is_private) VALUES ($1, $2, $2, $3) RETURNING id`,
        [WS, key, isPrivate],
      )
    ).rows[0]!.id;
  nbi = await insertProject("NBI", false);
  pn = await insertProject("PN", true);
  await db.query(`INSERT INTO project_members (project_id, user_id) VALUES ($1, $2)`, [pn, ADMIN]);
  todo = (await db.query<{ id: string }>(`SELECT id FROM statuses WHERE project_id = $1 AND name = 'To Do'`, [nbi]))
    .rows[0]!.id;
});

describe("schema bootstrap", () => {
  it("enables RLS on every public table", async () => {
    expect(await count(`SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity`)).toBe(0);
    expect(await count(`SELECT 1 FROM pg_tables WHERE schemaname = 'public'`)).toBe(18);
  });

  it("creates the four default statuses for a new project", async () => {
    const r = await db.query<{ name: string; category: string }>(
      `SELECT name, category FROM statuses WHERE project_id = $1 ORDER BY position`,
      [nbi],
    );
    expect(r.rows).toEqual([
      { name: "To Do", category: "todo" },
      { name: "In Progress", category: "in_progress" },
      { name: "Review", category: "in_progress" },
      { name: "Done", category: "done" },
    ]);
  });
});

describe("claim_signin (allow-list)", () => {
  it("rejects an email outside the allow-list without creating rows", async () => {
    expect(await claim(claims(OUTSIDER, "someone@else.com"))).toBe(false);
    expect(await count(`SELECT 1 FROM users WHERE id = $1`, [OUTSIDER])).toBe(0);
  });

  it("provisions a new domain user as member", async () => {
    const sub = "00000000-0000-0000-0000-0000000000d1";
    expect(await claim(claims(sub, "New.Person@NTR.test"))).toBe(true);
    const r = await db.query<{ role: string; email: string }>(
      `SELECT wm.role, u.email FROM workspace_members wm JOIN users u ON u.id = wm.user_id WHERE u.id = $1`,
      [sub],
    );
    expect(r.rows).toEqual([{ role: "member", email: "new.person@ntr.test" }]);
  });

  it("re-keys a seeded placeholder to the auth id and keeps its role", async () => {
    expect(await claim(owner)).toBe(true);
    const r = await db.query<{ role: string }>(`SELECT role FROM workspace_members WHERE user_id = $1`, [OWNER_AUTH]);
    expect(r.rows).toEqual([{ role: "owner" }]);
    expect(await count(`SELECT 1 FROM users WHERE id = $1`, [OWNER_PLACEHOLDER])).toBe(0);
  });

  it("before-user-created hook allows listed emails and rejects others", async () => {
    const ok = await db.query<{ r: unknown }>(`SELECT hook_before_user_created('{"user":{"email":"x@ntr.test"}}') AS r`);
    expect(ok.rows[0]!.r).toEqual({});
    const ko = await db.query<{ r: { error: { http_code: number } } }>(
      `SELECT hook_before_user_created('{"user":{"email":"x@evil.com"}}') AS r`,
    );
    expect(ko.rows[0]!.r.error.http_code).toBe(403);
  });
});

describe("project visibility", () => {
  it("hides private projects from users not listed in project_members", async () => {
    expect(await asUser(db, member, () => count(`SELECT 1 FROM projects`))).toBe(1);
    expect(await asUser(db, admin, () => count(`SELECT 1 FROM projects`))).toBe(2);
    expect(await asUser(db, owner, () => count(`SELECT 1 FROM projects WHERE id = $1`, [pn]))).toBe(0);
  });

  it("lets only admins create projects", async () => {
    await expect(
      asUser(db, member, () => db.query(`INSERT INTO projects (workspace_id, key, name) VALUES ($1, 'QMS', 'Q')`, [WS])),
    ).rejects.toThrow(/row-level security/);
    await asUser(db, admin, () =>
      db.query(`INSERT INTO projects (workspace_id, key, name) VALUES ($1, 'FW', 'Firmware')`, [WS]),
    );
  });
});

describe("issues", () => {
  it("lets members create issues with sequential numbers and blocks viewers", async () => {
    await insertIssue(member);
    await insertIssue(member);
    const r = await db.query<{ number: number }>(`SELECT number FROM issues WHERE project_id = $1 ORDER BY number`, [nbi]);
    expect(r.rows.map((x) => x.number)).toEqual([1, 2]);
    await expect(insertIssue(viewer)).rejects.toThrow();
  });

  it("enforces the epic → task → subtask hierarchy", async () => {
    const epic = await insertIssue(admin, "epic");
    const task = await insertIssue(member, "task", epic);
    await insertIssue(member, "subtask", task);
    await expect(insertIssue(member, "subtask", epic)).rejects.toThrow(/invalid hierarchy/);
    await expect(insertIssue(member, "epic", epic)).rejects.toThrow();
    await expect(affected(member, `UPDATE issues SET type = 'subtask' WHERE id = $1`, [task])).rejects.toThrow(
      /invalid hierarchy/,
    );
    const standalone = await insertIssue(member, "task");
    await insertIssue(member, "subtask", standalone);
    await expect(affected(member, `UPDATE issues SET type = 'epic' WHERE id = $1`, [standalone])).rejects.toThrow(
      /children/,
    );
  });

  it("lets members archive only their own issues; admins any", async () => {
    const mine = await insertIssue(member);
    const theirs = await insertIssue(admin);
    await affected(member, `UPDATE issues SET archived_at = now() WHERE id = $1`, [mine]);
    await expect(affected(member, `UPDATE issues SET archived_at = now() WHERE id = $1`, [theirs])).rejects.toThrow(
      /own issues/,
    );
    expect(await affected(admin, `UPDATE issues SET archived_at = NULL WHERE id = $1`, [mine])).toBe(1);
  });

  it("reserves hard delete to admins", async () => {
    const id = await insertIssue(member);
    expect(await affected(member, `DELETE FROM issues WHERE id = $1`, [id])).toBe(0);
    expect(await affected(admin, `DELETE FROM issues WHERE id = $1`, [id])).toBe(1);
  });
});

describe("membership administration", () => {
  it("prevents admins from demoting the owner", async () => {
    expect(await affected(admin, `UPDATE workspace_members SET role = 'member' WHERE user_id = $1`, [OWNER_AUTH])).toBe(0);
  });

  it("prevents admins from granting owner", async () => {
    await expect(
      affected(admin, `UPDATE workspace_members SET role = 'owner' WHERE user_id = $1`, [MEMBER]),
    ).rejects.toThrow(/row-level security/);
  });

  it("lets admins change roles and blocks members from doing so", async () => {
    expect(await affected(member, `UPDATE workspace_members SET role = 'admin' WHERE user_id = $1`, [VIEWER])).toBe(0);
    expect(await affected(admin, `UPDATE workspace_members SET role = 'member' WHERE user_id = $1`, [VIEWER])).toBe(1);
  });

  it("hides the allow-list from members", async () => {
    expect(await asUser(db, member, () => count(`SELECT 1 FROM allowed_signins`))).toBe(0);
    expect(await asUser(db, admin, () => count(`SELECT 1 FROM allowed_signins`))).toBe(2);
  });
});
