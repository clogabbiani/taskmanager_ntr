import { describe, expect, it } from "vitest";
import { DEFAULT_COLUMNS, normaliseColumns } from "./use-view-state";

describe("normaliseColumns", () => {
  it("falls back to the defaults", () => {
    expect(normaliseColumns(undefined)).toEqual(DEFAULT_COLUMNS);
  });

  it("drops unknown columns and appends new ones to the order", () => {
    const n = normaliseColumns({
      visible: ["title", "bogus", "key"],
      order: ["title", "key", "bogus"],
      sizes: { title: 300, bogus: 99 },
    });
    expect(n.visible).toEqual(["title", "key"]);
    expect(n.order.slice(0, 3)).toEqual(["title", "key", "status"]);
    expect(n.order).toHaveLength(DEFAULT_COLUMNS.order.length);
    expect(n.sizes).toEqual({ title: 300 });
  });
});
