import { parser, GFM } from "@lezer/markdown";
import { describe, expect, it } from "vitest";
import {
  buildLivePreviewDecorations,
  findLatexExpressions,
} from "./live-markdown";

const markdownParser = parser.configure(GFM);

function decorations(markdown: string, cursor?: number) {
  return buildLivePreviewDecorations(
    markdown,
    markdownParser.parse(markdown),
    cursor === undefined ? [] : [{ from: cursor, to: cursor }],
  );
}

describe("live Markdown decorations", () => {
  it("hides inactive inline markers while preserving formatted content", () => {
    const markdown = "Use **bold**, *italic*, ~~old~~, and `code`.";
    const result = decorations(markdown);

    expect(result.filter((item) => item.type === "hide")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: 4, to: 6 }),
        expect.objectContaining({ from: 10, to: 12 }),
      ]),
    );
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "mark", className: "cm-live-strong" }),
        expect.objectContaining({ type: "mark", className: "cm-live-emphasis" }),
        expect.objectContaining({ type: "mark", className: "cm-live-strikethrough" }),
        expect.objectContaining({ type: "mark", className: "cm-live-inline-code" }),
      ]),
    );
  });

  it("reveals all markers when the cursor enters a formatted construct", () => {
    const markdown = "Use **bold** now";
    const result = decorations(markdown, markdown.indexOf("bold") + 2);

    expect(result.some((item) => item.type === "hide")).toBe(false);
    expect(result).toContainEqual({
      type: "mark",
      from: 6,
      to: 10,
      className: "cm-live-strong",
    });
  });

  it("hides inactive link destinations and never previews remote images", () => {
    const markdown = "[Docs](https://example.com) ![chart](https://tracker.invalid/x.png)";
    const result = decorations(markdown);

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "mark", className: "cm-live-link" }),
        expect.objectContaining({
          type: "image",
          alt: "chart",
        }),
      ]),
    );
    expect(result.some((item) => item.type === "image" && "src" in item)).toBe(false);
  });

  it("keeps angle-bracket autolink text visible while hiding only its brackets", () => {
    const markdown = "Visit <https://example.com>";
    const result = decorations(markdown);
    const urlFrom = markdown.indexOf("https://");
    const urlTo = urlFrom + "https://example.com".length;

    expect(result).toContainEqual({
      type: "mark",
      from: urlFrom,
      to: urlTo,
      className: "cm-live-link",
    });
    expect(
      result.some(
        (item) => item.type === "hide" && item.from <= urlFrom && item.to >= urlTo,
      ),
    ).toBe(false);
  });

  it("styles block structures without replacing their source markers", () => {
    const markdown = "# Heading\n\n> Quote\n\n- [x] Task\n\n```js\nconst x = 1\n```";
    const result = decorations(markdown);

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "line", className: "cm-live-heading cm-live-heading-1" }),
        expect.objectContaining({ type: "line", className: "cm-live-blockquote" }),
        expect.objectContaining({ type: "line", className: "cm-live-code-block" }),
        expect.objectContaining({ type: "mark", className: "cm-live-structure-mark" }),
      ]),
    );
  });
});

describe("findLatexExpressions", () => {
  it("finds inline and display delimiters without altering source", () => {
    const markdown = "Inline $x^2$ and \\(y + 1\\).\n\n$$z = 3$$\n\n\\[w = 4\\]";

    expect(findLatexExpressions(markdown)).toEqual([
      expect.objectContaining({ content: "x^2", displayMode: false }),
      expect.objectContaining({ content: "y + 1", displayMode: false }),
      expect.objectContaining({ content: "z = 3", displayMode: true }),
      expect.objectContaining({ content: "w = 4", displayMode: true }),
    ]);
  });

  it("ignores math delimiters in protected code ranges", () => {
    const markdown = "`$literal$` and $rendered$";
    const tree = markdownParser.parse(markdown);
    const codeNode = tree.topNode.getChild("Paragraph")?.getChild("InlineCode");
    expect(codeNode).not.toBeNull();

    expect(
      findLatexExpressions(markdown, [
        { name: "InlineCode", from: codeNode!.from, to: codeNode!.to },
      ]),
    ).toEqual([
      expect.objectContaining({ content: "rendered", displayMode: false }),
    ]);
  });

  it("leaves incomplete, empty, escaped, and multiline inline expressions raw", () => {
    expect(findLatexExpressions("$open only and $$ $$ and \\$escaped$ and $a\nb$")).toEqual([]);
  });
});
