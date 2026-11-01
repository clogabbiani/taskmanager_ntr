import { describe, expect, it } from "vitest";
import type { IssueRow } from "@/features/issues/model";
import {
  activeFilterCount,
  EMPTY_FILTERS,
  epicOf,
  matchesFilters,
  parseFilters,
  parseGroup,
  parseSort,
  serializeView,
  type Filters,
} from "./filters";

const S1 = "11111111-1111-1111-1111-111111111111";
const S2 = "22222222-2222-2222-2222-222222222222";
const U1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const L1 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const E1 = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

const params = (q: string) => new URLSearchParams(q);

describe("parseFilters", () => {
  it("reads lists, dates, text and archived", () => {
    const f = parseFilters(
      params(
        `status=${S1},${S2}&type=task,bogus&assignee=me,none,${U1}&label=${L1}&priority=high&risk=high,low&epic=none&due_from=2026-11-01&due_to=nope&q=calibrazione&archived=1`,
      ),
    );
    expect(f).toEqual<Filters>({
      ...EMPTY_FILTERS,
      status: [S1, S2],
      type: ["task"],
      assignee: ["me", "none", U1],
      label: [L1],
      priority: ["high"],
      risk: ["high", "low"],
      epic: ["none"],
      due_from: "2026-11-01",
      q: "calibrazione",
      archived: true,
    });
  });

  it("ignores malformed ids and duplicates", () => {
    expect(parseFilters(params("status=abc,abc&label=")).status).toEqual([]);
    expect(parseFilters(params(`status=${S1},${S1}`)).status).toEqual([S1]);
  });

  it("round-trips through serializeView", () => {
    const f: Filters = {
      ...EMPTY_FILTERS,
      status: [S1],
      assignee: ["me"],
      due_to: "2026-12-31",
      q: "lotto",
      archived: true,
    };
    const sort = [
      { id: "due_date", desc: false },
      { id: "priority", desc: true },
    ];
    const qs = serializeView(f, sort, "epic");
    expect(qs.toString()).toBe(
      `status=${S1}&assignee=me&due_to=2026-12-31&q=lotto&archived=1&sort=due_date%3Aasc%2Cpriority%3Adesc&group=epic`,
    );
    expect(parseFilters(qs)).toEqual(f);
    expect(parseSort(qs)).toEqual(sort);
    expect(parseGroup(qs)).toBe("epic");
    expect(serializeView(EMPTY_FILTERS).toString()).toBe("");
  });

  it("parses sort keeping only known columns", () => {
    expect(parseSort(params("sort=priority:desc,nope:asc,priority:asc,title"))).toEqual([
      { id: "priority", desc: true },
      { id: "title", desc: false },
    ]);
  });

  it("counts active filters", () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...EMPTY_FILTERS, status: [S1], q: "x", due_from: "2026-01-01" })).toBe(3);
  });
});

const issue = (partial: Partial<IssueRow>): IssueRow => ({
  id: "i",
  project_id: "p",
  number: 1,
  type: "task",
  parent_id: null,
  title: "Calibrazione sensori",
  description_md: null,
  status_id: S1,
  priority: "medium",
  start_date: null,
  due_date: null,
  planned_days: null,
  progress: 0,
  computed_progress: 0,
  risk: "none",
  external_collaborators: [],
  rank: null,
  created_by: null,
  archived_at: null,
  created_at: "",
  updated_at: "",
  assignee_ids: [],
  label_ids: [],
  ...partial,
});

describe("matchesFilters", () => {
  const epic = issue({ id: E1, type: "epic", number: 1, title: "Firmware" });
  const task = issue({
    id: "t",
    number: 2,
    parent_id: E1,
    assignee_ids: [U1],
    label_ids: [L1],
    due_date: "2026-11-15",
  });
  const sub = issue({ id: "s", number: 3, type: "subtask", parent_id: "t" });
  const loose = issue({ id: "l", number: 4, archived_at: "2026-11-01T00:00:00Z" });
  const byId = new Map([epic, task, sub, loose].map((i) => [i.id, i]));
  const ctx = { me: U1, projectKey: "NBI", byId };
  const run = (f: Partial<Filters>) =>
    [epic, task, sub, loose].filter((i) => matchesFilters(i, { ...EMPTY_FILTERS, ...f }, ctx)).map((i) => i.id);

  it("hides archived unless asked", () => {
    expect(run({})).toEqual([E1, "t", "s"]);
    expect(run({ archived: true })).toEqual([E1, "t", "s", "l"]);
  });

  it("filters by assignee including me and none", () => {
    expect(run({ assignee: ["me"] })).toEqual(["t"]);
    expect(run({ assignee: ["none"] })).toEqual([E1, "s"]);
  });

  it("filters by epic including descendants and 'none'", () => {
    expect(epicOf(sub, byId)).toBe(E1);
    expect(run({ epic: [E1] })).toEqual([E1, "t", "s"]);
    expect(run({ epic: ["none"], archived: true })).toEqual(["l"]);
  });

  it("filters by label, type, date range and text", () => {
    expect(run({ label: [L1] })).toEqual(["t"]);
    expect(run({ type: ["epic", "subtask"] })).toEqual([E1, "s"]);
    expect(run({ due_from: "2026-11-01", due_to: "2026-11-30" })).toEqual(["t"]);
    expect(run({ q: "firmware" })).toEqual([E1]);
    expect(run({ q: "nbi-3" })).toEqual(["s"]);
  });
});
