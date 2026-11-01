import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { planSeed, type UserMapping } from "./seed-plan";

const mapping: UserMapping = {
  users: [
    { jira_display_name: "Claudio Gabbiani", email: "Clogabbiani@Gmail.com", role: "owner" },
    { jira_display_name: "Edoardo Salamone", email: null, role: "admin" },
    { jira_display_name: "Merk", email: "merk@ntr.it", role: "admin" },
    { jira_display_name: "Nicola Ferrante", email: null, role: "admin" },
  ],
};

describe("planSeed", () => {
  it("keeps users with an email and reports the others", () => {
    const plan = planSeed(mapping);
    expect(plan.users).toEqual([
      { email: "clogabbiani@gmail.com", displayName: "Claudio Gabbiani", role: "owner" },
      { email: "merk@ntr.it", displayName: "Merk", role: "admin" },
    ]);
    expect(plan.skipped.map((s) => s.displayName)).toEqual(["Edoardo Salamone", "Nicola Ferrante"]);
  });

  it("allow-lists the owner placeholder plus every mapped email, deduplicated", () => {
    expect(planSeed(mapping).allowedEmails).toEqual(["clogabbiani@gmail.com", "merk@ntr.it"]);
  });

  it("normalises allowed domains", () => {
    expect(planSeed(mapping, [" @NTRBiosensors.it ", "", "ntrbiosensors.it"]).allowedDomains).toEqual([
      "ntrbiosensors.it",
    ]);
  });

  it("reports the PN member when Edoardo has no email", () => {
    const pn = planSeed(mapping).projects.find((p) => p.project.key === "PN")!;
    expect(pn.project.isPrivate).toBe(true);
    expect(pn.memberEmails).toEqual([]);
    expect(pn.missingMembers).toEqual(["Edoardo Salamone"]);
  });

  it("adds Edoardo to PN once mapped", () => {
    const withEdoardo: UserMapping = {
      users: mapping.users.map((u) =>
        u.jira_display_name === "Edoardo Salamone" ? { ...u, email: "edoardo@ntr.it" } : u,
      ),
    };
    const pn = planSeed(withEdoardo).projects.find((p) => p.project.key === "PN")!;
    expect(pn.memberEmails).toEqual(["edoardo@ntr.it"]);
  });

  it("requires an owner with an email", () => {
    expect(() => planSeed({ users: [{ jira_display_name: "X", email: null, role: "owner" }] })).toThrow(/owner/);
  });

  it("accepts the committed user_mapping.json", () => {
    const file = path.resolve(__dirname, "../../migration/user_mapping.json");
    const plan = planSeed(JSON.parse(readFileSync(file, "utf8")) as UserMapping);
    expect(plan.users.find((u) => u.role === "owner")?.email).toBe("clogabbiani@gmail.com");
  });
});
