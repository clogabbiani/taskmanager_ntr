import { describe, expect, it } from "vitest";
import { describeActivity, referencedIssueIds, type ActivityLookups } from "./activity-format";
import type { ActivityRow } from "./model";

const lookups: ActivityLookups = {
  user: (id) => ({ u1: "Claudio", u2: "Nicola Ferrante", u3: "Edoardo Salamone" })[id],
  status: (id) => ({ s1: "To Do", s2: "In Progress" })[id],
  label: (id) => ({ l1: "In linea", l2: "Obiettivo" })[id],
  issueKey: (id) => ({ i1: "NBI-3", i2: "NBI-7" })[id],
};

const row = (partial: Partial<ActivityRow>): ActivityRow => ({
  id: "a",
  issue_id: "i0",
  actor_id: "u1",
  action: "updated",
  field: null,
  old_value: null,
  new_value: null,
  created_at: "2026-11-01T10:00:00Z",
  ...partial,
});

describe("describeActivity", () => {
  it.each([
    [row({ action: "created" }), "Claudio ha creato l'issue"],
    [row({ action: "archived" }), "Claudio ha archiviato l'issue"],
    [row({ field: "status", old_value: "s1", new_value: "s2" }), "Claudio ha cambiato Stato da To Do a In Progress"],
    [
      row({ field: "priority", old_value: "medium", new_value: "high" }),
      "Claudio ha cambiato Priorità da Media a Alta",
    ],
    [
      row({ field: "due_date", old_value: null, new_value: "2026-11-30" }),
      "Claudio ha impostato Scadenza a 30/11/2026",
    ],
    [row({ field: "progress", old_value: 20, new_value: null }), "Claudio ha rimosso Avanzamento (20%)"],
    [row({ field: "progress", old_value: 20, new_value: 60 }), "Claudio ha cambiato Avanzamento da 20% a 60%"],
    [
      row({ field: "assignees", old_value: ["u1"], new_value: ["u1", "u2"] }),
      "Claudio ha aggiunto Nicola Ferrante a Assegnatari",
    ],
    [row({ field: "labels", old_value: ["l1", "l2"], new_value: ["l2"] }), "Claudio ha rimosso In linea da Etichette"],
    [
      row({ field: "assignees", old_value: ["u2"], new_value: ["u3"] }),
      "Claudio ha aggiornato Assegnatari: +Edoardo Salamone −Nicola Ferrante",
    ],
    [row({ field: "parent", old_value: "i1", new_value: "i2" }), "Claudio ha cambiato Padre da NBI-3 a NBI-7"],
    [row({ field: "description", old_value: "a", new_value: "b" }), "Claudio ha modificato la descrizione"],
    [
      row({ field: "links", new_value: { kind: "blocks", to: "i2" } }),
      "Claudio ha aggiunto il collegamento «Blocca» con NBI-7",
    ],
    [row({ field: "status", old_value: "gone", new_value: "s1" }), "Claudio ha cambiato Stato da (eliminato) a To Do"],
    [row({ actor_id: null, action: "created" }), "Qualcuno ha creato l'issue"],
  ])("%#", (r, expected) => {
    expect(describeActivity(r, lookups)).toBe(expected);
  });
});

describe("referencedIssueIds", () => {
  it("collects parent and link targets", () => {
    expect(
      referencedIssueIds([
        row({ field: "parent", old_value: null, new_value: "i1" }),
        row({ field: "links", old_value: { kind: "relates", to: "i2" } }),
        row({ field: "status", new_value: "s1" }),
      ]).sort(),
    ).toEqual(["i1", "i2"]);
  });
});
