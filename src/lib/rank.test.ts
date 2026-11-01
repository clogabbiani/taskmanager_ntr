import { describe, expect, it } from "vitest";
import { after, before, between, compareRanks, sequence } from "./rank";

const sorted = (xs: string[]) => [...xs].sort(compareRanks);

describe("rank", () => {
  it("creates a first key and keys at both ends", () => {
    const first = between(null, null);
    expect(first).toBe("i");
    expect(before(first) < first).toBe(true);
    expect(after(first) > first).toBe(true);
  });

  it("finds keys between adjacent and prefix keys", () => {
    for (const [a, b] of [
      ["a", "b"],
      ["a", "a1"],
      ["az", "b"],
      ["1", "2"],
      ["y", "z"],
      ["zz", null],
      [null, "01"],
    ] as const) {
      const m = between(a, b);
      if (a !== null) expect(m > a).toBe(true);
      if (b !== null) expect(m < b).toBe(true);
      expect(m.endsWith("0")).toBe(false);
    }
  });

  it("keeps order under repeated inserts at the same spot", () => {
    let lo = "a";
    const hi = "b";
    const keys = [lo, hi];
    for (let i = 0; i < 200; i++) {
      lo = between(lo, hi);
      keys.push(lo);
    }
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((k) => k > "a" || k === "a")).toBe(true);

    let h = "b";
    for (let i = 0; i < 200; i++) {
      h = between("a", h);
      expect(h > "a" && h < "b").toBe(true);
    }
  });

  it("keeps order when inserting at random positions", () => {
    const keys: string[] = [between(null, null)];
    let seed = 42;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let i = 0; i < 500; i++) {
      const ordered = sorted(keys);
      const pos = Math.floor(rand() * (ordered.length + 1));
      const k = between(ordered[pos - 1] ?? null, ordered[pos] ?? null);
      keys.push(k);
      const next = sorted(keys);
      expect(next.indexOf(k)).toBe(pos);
    }
  });

  it("generates an increasing sequence", () => {
    const seq = sequence(100);
    expect(sorted(seq)).toEqual(seq);
    expect(new Set(seq).size).toBe(100);
  });

  it("rejects invalid or out-of-order bounds", () => {
    expect(() => between("b", "a")).toThrow();
    expect(() => between("a", "a")).toThrow();
    expect(() => between("a0", null)).toThrow();
    expect(() => between("A", null)).toThrow();
    expect(() => between("", null)).toThrow();
  });

  it("sorts nulls last", () => {
    expect([null, "b", "a"].sort(compareRanks)).toEqual(["a", "b", null]);
  });
});
