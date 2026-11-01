import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const WS = "00000000-0000-0000-0000-0000000000a1";
const OWNER = "00000000-0000-0000-0000-0000000000b1";
const ADMIN = "00000000-0000-0000-0000-0000000000b2";
const MEMBER = "00000000-0000-0000-0000-0000000000b3";
const EDO = "00000000-0000-0000-0000-0000000000b4";
const STRANGER = "00000000-0000-0000-0000-0000000000b9";

const as = (sub: string) => ({ sub, email: `${sub.slice(-2)}@ntr.test` });
const owner = as(OWNER);
const admin = as(ADMIN);
const member = as(MEMBER);
const edo = as(EDO);

let db: PGlite;
let nbi: string;
let pn: string;

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  return (await db.query<T>(sql, params)).rows[0]!;
}

async function count(sql: string, params: unknown[] = []) {
  return (await one<{ n: number }>(`SELECT count(*)::int AS n FROM (${sql}) q`, params)).n;
}

type Created = { id: string; number: number; key: string };

async function createIssue(
  user: { sub: string },
  project: string,
  type: "epic" | "task" | "subtask",
  title: string,
  parent: string | null = null,
) {
  return asUser(
    db,
    user,
    async () =>
      (await one<{ r: Created }>(`SELECT create_issue($1, $2, $3, $4) AS r`, [project, type, title, parent])).r,
  );
}

async function statusId(project: string, name: string) {
  return (await one<{ id: string }>(`SELECT id FROM statuses WHERE project_id = $1 AND name = $2`, [project, name])).id;
}

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(`
    INSERT INTO workspaces (id, name, slug) VALUES ('${WS}', 'NTR Biosensors', 'ntr');
    INSERT INTO users (id, email, display_name) VALUES
      ('${OWNER}', 'owner@ntr.test', 'Owner'), ('${ADMIN}', 'admin@ntr.test', 'Admin'),
      ('${MEMBER}', 'member@ntr.test', 'Member'), ('${EDO}', 'edo@ntr.test', 'Edoardo'),
      ('${STRANGER}', 'stranger@else.test', 'Stranger');
    INSERT INTO workspace_members (workspace_id, user_id, role) VALUES
      ('${WS}', '${OWNER}', 'owner'), ('${WS}', '${ADMIN}', 'admin'),
      ('${WS}', '${MEMBER}', 'member'), ('${WS}', '${EDO}', 'member');
  `);
  nbi = (
    await one<{ id: string }>(`INSERT INTO projects (workspace_id, key, name) VALUES ($1, 'NBI', 'NBI') RETURNING id`, [
      WS,
    ])
  ).id;
  pn = (
    await one<{ id: string }>(
      `INSERT INTO projects (workspace_id, key, name, is_private) VALUES ($1, 'PN', 'Personali', true) RETURNING id`,
      [WS],
    )
  ).id;
  await db.query(`INSERT INTO project_members (project_id, user_id) VALUES ($1, $2)`, [pn, EDO]);
  await createIssue(edo, pn, "task", "Task privato di Edoardo");
});

describe("private project visibility (ADR-004)", () => {
  it("admin who is not a member sees the project and its statuses but no issues", async () => {
    await asUser(db, admin, async () => {
      expect(await count(`SELECT 1 FROM projects WHERE id = $1`, [pn])).toBe(1);
      expect(await count(`SELECT 1 FROM statuses WHERE project_id = $1`, [pn])).toBe(4);
      expect(await count(`SELECT 1 FROM project_members WHERE project_id = $1`, [pn])).toBe(1);
      expect(await count(`SELECT 1 FROM issues WHERE project_id = $1`, [pn])).toBe(0);
      expect(
        await count(`SELECT 1 FROM activity_log a JOIN issues i ON i.id = a.issue_id WHERE i.project_id = $1`, [pn]),
      ).toBe(0);
    });
  });

  it("member who is not listed sees neither the project nor its issues", async () => {
    await asUser(db, member, async () => {
      expect(await count(`SELECT 1 FROM projects WHERE id = $1`, [pn])).toBe(0);
      expect(await count(`SELECT 1 FROM issues WHERE project_id = $1`, [pn])).toBe(0);
    });
  });

  it("admin who adds themselves to project_members can read the issues", async () => {
    await asUser(db, admin, () =>
      db.query(`INSERT INTO project_members (project_id, user_id) VALUES ($1, $2)`, [pn, ADMIN]),
    );
    expect(await asUser(db, admin, () => count(`SELECT 1 FROM issues WHERE project_id = $1`, [pn]))).toBe(1);
    await asUser(db, admin, () =>
      db.query(`DELETE FROM project_members WHERE project_id = $1 AND user_id = $2`, [pn, ADMIN]),
    );
    expect(await asUser(db, admin, () => count(`SELECT 1 FROM issues WHERE project_id = $1`, [pn]))).toBe(0);
  });

  it("members cannot manage project_members and outsiders cannot be added", async () => {
    await expect(
      asUser(db, edo, () =>
        db.query(`INSERT INTO project_members (project_id, user_id) VALUES ($1, $2)`, [pn, MEMBER]),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      asUser(db, owner, () =>
        db.query(`INSERT INTO project_members (project_id, user_id) VALUES ($1, $2)`, [pn, STRANGER]),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("status guards", () => {
  it("keeps at least one status per category", async () => {
    const todo = await statusId(nbi, "To Do");
    const done = await statusId(nbi, "Done");
    await expect(asUser(db, admin, () => db.query(`DELETE FROM statuses WHERE id = $1`, [todo]))).rejects.toThrow(
      /status_category_required/,
    );
    await expect(
      asUser(db, admin, () => db.query(`UPDATE statuses SET category = 'todo' WHERE id = $1`, [done])),
    ).rejects.toThrow(/status_category_required/);
    // Review can leave in_progress: In Progress remains.
    const review = await statusId(nbi, "Review");
    await asUser(db, admin, () => db.query(`UPDATE statuses SET category = 'done' WHERE id = $1`, [review]));
    await asUser(db, admin, () => db.query(`UPDATE statuses SET category = 'in_progress' WHERE id = $1`, [review]));
  });

  it("blocks deleting a status with issues; delete_status moves them first", async () => {
    const extra = (
      await asUser(db, admin, () =>
        one<{ id: string }>(
          `INSERT INTO statuses (project_id, name, category, position) VALUES ($1, 'Blocked', 'in_progress', 9) RETURNING id`,
          [nbi],
        ),
      )
    ).id;
    const issue = await createIssue(member, nbi, "task", "Da spostare");
    await asUser(db, member, () => db.query(`UPDATE issues SET status_id = $1 WHERE id = $2`, [extra, issue.id]));

    await expect(asUser(db, admin, () => db.query(`DELETE FROM statuses WHERE id = $1`, [extra]))).rejects.toThrow(
      /status_has_issues/,
    );
    const target = await statusId(nbi, "In Progress");
    const moved = await asUser(db, admin, () =>
      one<{ n: number }>(`SELECT delete_status($1, $2) AS n`, [extra, target]),
    );
    expect(moved.n).toBe(1);
    expect((await one<{ status_id: string }>(`SELECT status_id FROM issues WHERE id = $1`, [issue.id])).status_id).toBe(
      target,
    );
    expect(await count(`SELECT 1 FROM activity_log WHERE issue_id = $1 AND field = 'status_id'`, [issue.id])).toBe(1);
  });

  it("members cannot edit statuses", async () => {
    const todo = await statusId(nbi, "To Do");
    const r = await asUser(db, member, () => db.query(`UPDATE statuses SET name = 'X' WHERE id = $1`, [todo]));
    expect(r.affectedRows).toBe(0);
  });

  it("a project with issues and statuses can still be hard-deleted", async () => {
    const tmp = (
      await asUser(db, admin, () =>
        one<{ id: string }>(`INSERT INTO projects (workspace_id, key, name) VALUES ($1, 'TMP', 'Tmp') RETURNING id`, [
          WS,
        ]),
      )
    ).id;
    await createIssue(admin, tmp, "task", "Tmp");
    await asUser(db, admin, () => db.query(`DELETE FROM projects WHERE id = $1`, [tmp]));
    expect(await count(`SELECT 1 FROM statuses WHERE project_id = $1`, [tmp])).toBe(0);
  });
});

describe("create_issue and hierarchy", () => {
  it("allocates numbers, picks the first todo status and logs 'created'", async () => {
    const a = await createIssue(member, nbi, "epic", "Epic A");
    const b = await createIssue(member, nbi, "epic", "Epic B");
    expect(b.number).toBe(a.number + 1);
    expect(a.key).toBe(`NBI-${a.number}`);
    const row = await one<{ name: string; created_by: string }>(
      `SELECT s.name, i.created_by FROM issues i JOIN statuses s ON s.id = i.status_id WHERE i.id = $1`,
      [a.id],
    );
    expect(row).toEqual({ name: "To Do", created_by: MEMBER });
    expect(await count(`SELECT 1 FROM activity_log WHERE issue_id = $1 AND action = 'created'`, [a.id])).toBe(1);
  });

  it("enforces epic → task → subtask", async () => {
    const epic = await createIssue(member, nbi, "epic", "E");
    const task = await createIssue(member, nbi, "task", "T", epic.id);
    await createIssue(member, nbi, "subtask", "S", task.id);
    await expect(createIssue(member, nbi, "subtask", "orphan")).rejects.toThrow(/requires a parent/);
    await expect(createIssue(member, nbi, "task", "T2", task.id)).rejects.toThrow(/invalid hierarchy/);
    await expect(createIssue(member, nbi, "subtask", "S2", epic.id)).rejects.toThrow(/invalid hierarchy/);
    await expect(createIssue(member, nbi, "epic", "E2", epic.id)).rejects.toThrow();
    await expect(
      asUser(db, member, () => db.query(`UPDATE issues SET parent_id = id WHERE id = $1`, [task.id])),
    ).rejects.toThrow(/invalid hierarchy/);
    await expect(
      asUser(db, member, () => db.query(`UPDATE issues SET type = 'epic', parent_id = NULL WHERE id = $1`, [task.id])),
    ).rejects.toThrow(/invalid hierarchy/);
    await expect(
      asUser(db, member, () => db.query(`UPDATE issues SET project_id = $1 WHERE id = $2`, [pn, task.id])),
    ).rejects.toThrow();
  });
});

describe("computed_progress", () => {
  async function progress(id: string) {
    return (await one<{ p: number }>(`SELECT computed_progress(i) AS p FROM issues i WHERE i.id = $1`, [id])).p;
  }
  async function setChild(id: string, progress: number, days: number | null) {
    await db.query(`UPDATE issues SET progress = $1, planned_days = $2 WHERE id = $3`, [progress, days, id]);
  }

  it("is 0 without children, weighted by planned_days, simple average as fallback", async () => {
    const epic = await createIssue(member, nbi, "epic", "Progress");
    expect(await progress(epic.id)).toBe(0);

    const t1 = await createIssue(member, nbi, "task", "t1", epic.id);
    const t2 = await createIssue(member, nbi, "task", "t2", epic.id);
    await setChild(t1.id, 100, null);
    await setChild(t2.id, 0, null);
    expect(await progress(epic.id)).toBe(50);

    await setChild(t1.id, 100, 3);
    await setChild(t2.id, 0, 1);
    expect(await progress(epic.id)).toBe(75);

    await db.query(`UPDATE issues SET archived_at = now() WHERE id = $1`, [t1.id]);
    expect(await progress(epic.id)).toBe(0);
    expect(await progress(t2.id)).toBe(0);
  });
});

describe("search_issues", () => {
  it("matches exact key, title and Italian full-text, respecting RLS", async () => {
    const issue = await createIssue(member, nbi, "task", "Calibrazione sensori");
    await db.query(`UPDATE issues SET description_text = 'Verificare le misurazioni del lotto' WHERE id = $1`, [
      issue.id,
    ]);
    const search = (user: { sub: string }, q: string) =>
      asUser(db, user, async () =>
        (await db.query<{ issue_id: string }>(`SELECT issue_id FROM search_issues($1)`, [q])).rows.map(
          (r) => r.issue_id,
        ),
      );
    expect((await search(member, issue.key.toLowerCase()))[0]).toBe(issue.id);
    expect(await search(member, "calibraz")).toContain(issue.id);
    expect(await search(member, "misurazione")).toContain(issue.id);
    expect(await search(member, "privato")).toHaveLength(0);
    expect(await search(edo, "privato")).toHaveLength(1);
    expect(await search(member, "   ")).toHaveLength(0);
  });
});

describe("labels", () => {
  it("merge_labels moves assignments and is admin-only", async () => {
    const [l1, l2] = (
      await db.query<{ id: string }>(
        `INSERT INTO labels (workspace_id, name) VALUES ($1, 'In linea'), ($1, 'in-linea') RETURNING id`,
        [WS],
      )
    ).rows;
    const issue = await createIssue(member, nbi, "task", "Etichettata");
    await db.query(`INSERT INTO issue_labels (issue_id, label_id) VALUES ($1, $2)`, [issue.id, l2!.id]);

    await expect(asUser(db, member, () => db.query(`SELECT merge_labels($1, $2)`, [l2!.id, l1!.id]))).rejects.toThrow(
      /not allowed/,
    );
    await asUser(db, admin, () => db.query(`SELECT merge_labels($1, $2)`, [l2!.id, l1!.id]));
    expect(await count(`SELECT 1 FROM labels WHERE id = $1`, [l2!.id])).toBe(0);
    expect(await count(`SELECT 1 FROM issue_labels WHERE issue_id = $1 AND label_id = $2`, [issue.id, l1!.id])).toBe(1);
    const usage = await asUser(db, member, () =>
      one<{ issue_count: number }>(`SELECT issue_count FROM label_usage($1) WHERE label_id = $2`, [WS, l1!.id]),
    );
    expect(usage.issue_count).toBe(1);
  });

  it("members cannot create labels", async () => {
    await expect(
      asUser(db, member, () => db.query(`INSERT INTO labels (workspace_id, name) VALUES ($1, 'Nuova')`, [WS])),
    ).rejects.toThrow(/row-level security/);
  });
});
