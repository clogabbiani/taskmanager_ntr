import { describe, expect, it } from "vitest";
import { markdownToPlainText } from "./markdown";

describe("markdownToPlainText", () => {
  it("strips common syntax and keeps the words", () => {
    const md = [
      "## Obiettivo",
      "",
      "Verificare **la calibrazione** dei _sensori_ con `pytest`.",
      "",
      "- primo punto",
      "1. [link al lotto](https://example.com/lotto)",
      "> nota di @[Nicola Ferrante](user:123)",
      "",
      "```",
      "codice",
      "```",
    ].join("\n");
    expect(markdownToPlainText(md)).toBe(
      "Obiettivo\n\nVerificare la calibrazione dei sensori con pytest.\n\nprimo punto\nlink al lotto\nnota di Nicola Ferrante\n\ncodice",
    );
  });

  it("returns null for empty input", () => {
    expect(markdownToPlainText(null)).toBeNull();
    expect(markdownToPlainText("  \n ")).toBeNull();
  });
});
