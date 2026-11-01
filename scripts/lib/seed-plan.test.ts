import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { planSeed, type UserMapping } from "./seed-plan";

const mapping: UserMapping = {
  users: [
    { jira_display_name: "Claudio Gabbiani", email: "C.Gabbiani@NTRBiosensors.com", role: "owner" },
    { jira_display_name: "Edoardo Salamone", email: null, role: "admin" },
    { jira_display_name: "Merk", email: "merk@ntr.it", role: "admin" },
    { jira_display_name: "Nicola Ferrante", email: null, role: "admin" },
  ],
};

describe("planSeed", () => {
  it("keeps users with an email and reports the others", () => {
    const plan = planSeed(mapping);
    expect(plan.users).toEqual([
      { email: "c.gabbiani@ntrbiosensors.com", displayName: "Claudio Gabbiani", role: "owner" },
      { email: "merk@ntr.it", displayName: "Merk", role: "admin" },
    ]);
    expect(plan.skipped.map((s) => s.displayName)).toEqual(["Edoardo Salamone", "Nicola Ferrante"]);
  });

  it("allow-lists every mapped email, deduplicated", () => {
    expect(planSeed(mapping).allowedEmails).toEqual(["c.gabbiani@ntrbiosensors.com", "merk@ntr.it"]);
  });

  it("allow-lists the NTR Workspace domain by default", () => {
    expect(planSeed(mapping).allowedDomains).toEqual(["ntrbiosensors.com"]);
  });

  it("normalises allowed domains and accepts an empty override", () => {
    expect(planSeed(mapping, [" @NTRBiosensors.com ", "", "ntrbiosensors.com"]).allowedDomains).toEqual([
      "ntrbiosensors.com",
    ]);
    expect(planSeed(mapping, [""]).allowedDomains).toEqual([]);
  });

  it("reports the PN member when Edoardo has no email", () => {
    const pn = planSeed(mapping).projects.find((p) => p.project.key === "PN")!;
    expect(pn.project.isPrivate).toBe(true);
    expect(pn.memberEmails).toEqual([]);
    expect(pn.missingMembers).toEqual(["Edoardo Salamone"]);
  });

  it("requires an owner with an email", () => {
    expect(() => planSeed({ users: [{ jira_display_name: "X", email: null, role: "owner" }] })).toThrow(/owner/);
  });

  describe("committed migration/user_mapping.json", () => {
    const file = path.resolve(__dirname, "../../migration/user_mapping.json");
    const plan = planSeed(JSON.parse(readFileSync(file, "utf8")) as UserMapping);

    it("seeds Claudio as owner with the Workspace account", () => {
      expect(plan.users.find((u) => u.role === "owner")?.email).toBe("c.gabbiani@ntrbiosensors.com");
    });

    it("adds Edoardo to the private PN project", () => {
      const pn = plan.projects.find((p) => p.project.key === "PN")!;
      expect(pn.memberEmails).toEqual(["e.salamone@ntrbiosensors.com"]);
    });

    it("keeps clogabbiani@gmail.com out of the allow-list (unauthorised test account, setup G.4)", () => {
      expect(plan.allowedEmails).not.toContain("clogabbiani@gmail.com");
      expect(plan.allowedDomains).not.toContain("gmail.com");
    });
  });
});
