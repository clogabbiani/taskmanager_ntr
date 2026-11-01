import { describe, expect, it } from "vitest";
import { formatDate, formatRelative, isOverdue, parseItalianDate, toIsoDate } from "./dates";

describe("dates", () => {
  it("formats calendar dates as gg/mm/aaaa", () => {
    expect(formatDate("2026-11-30")).toBe("30/11/2026");
    expect(formatDate(null)).toBe("");
    expect(formatDate("not a date")).toBe("");
  });

  it("parses Italian dates", () => {
    expect(parseItalianDate("05/01/2027")).toBe("2027-01-05");
    expect(parseItalianDate("5/1/27")).toBeNull();
    expect(parseItalianDate("31/02/2027")).toBeNull();
  });

  it("round-trips local dates", () => {
    expect(toIsoDate(new Date(2026, 10, 1))).toBe("2026-11-01");
  });

  it("formats relative times in Italian", () => {
    const now = new Date("2026-11-01T12:00:00Z");
    expect(formatRelative("2026-11-01T10:00:00Z", now)).toBe("circa 2 ore fa");
    expect(formatRelative("2026-10-29T12:00:00Z", now)).toBe("3 giorni fa");
  });

  it("detects overdue dates", () => {
    const today = new Date(2026, 10, 15, 9, 0);
    expect(isOverdue("2026-11-14", today)).toBe(true);
    expect(isOverdue("2026-11-15", today)).toBe(false);
    expect(isOverdue(null, today)).toBe(false);
  });
});
