import { describe, expect, it } from "vitest";
import { initials } from "./initials";

describe("initials", () => {
  it.each([
    ["Nicola Ferrante", "NF"],
    ["Merk", "M"],
    ["claudio  gabbiani extra", "CG"],
    ["", "?"],
    ["   ", "?"],
  ])("%s → %s", (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});
