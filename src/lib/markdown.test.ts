import { describe, expect, it } from "vitest";
import { normalizeLatexDelimiters } from "./markdown";

describe("normalizeLatexDelimiters", () => {
  it("normalizes common inline and display LaTeX delimiters", () => {
    expect(
      normalizeLatexDelimiters("Before \\(x + y\\) after\n\\[\nx^2\n\\]"),
    ).toBe("Before $x + y$ after\n$$\nx^2\n$$");
  });

  it("preserves delimiters inside inline and fenced code", () => {
    const markdown = [
      "Use `\\(literal\\)` here.",
      "",
      "```tex",
      "\\[not rendered\\]",
      "```",
      "",
      "Render \\(this\\).",
    ].join("\n");

    expect(normalizeLatexDelimiters(markdown)).toBe(
      [
        "Use `\\(literal\\)` here.",
        "",
        "```tex",
        "\\[not rendered\\]",
        "```",
        "",
        "Render $this$.",
      ].join("\n"),
    );
  });

  it("leaves escaped backslashes unchanged", () => {
    expect(normalizeLatexDelimiters(String.raw`Literal \\(parenthesis\\)`)).toBe(
      String.raw`Literal \\(parenthesis\\)`,
    );
  });
});
