import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownContent } from "./MarkdownContent";

describe("MarkdownContent", () => {
  it("renders GFM and LaTeX for conversation content", () => {
    const html = renderToStaticMarkup(
      <MarkdownContent
        variant="response"
        content={[
          "# Result",
          "",
          "Use **bold text**, ~~old text~~, and $x^2 + y^2$.",
          "",
          "| Name | Value |",
          "| --- | ---: |",
          "| Radius | 4 |",
          "",
          "[Reference](https://example.com)",
        ].join("\n")}
      />,
    );

    expect(html).toContain('<div class="markdown-content markdown-response">');
    expect(html).toContain("<h1>Result</h1>");
    expect(html).toContain("<strong>bold text</strong>");
    expect(html).toContain("<del>old text</del>");
    expect(html).toContain('class="katex"');
    expect(html).toContain("<table>");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer noopener"');
  });

  it("renders prompt content through the same formatter", () => {
    const html = renderToStaticMarkup(
      <MarkdownContent variant="prompt" content={"- First\n- Second\n\n`code`"} />,
    );

    expect(html).toContain("markdown-prompt");
    expect(html).toContain("<ul>");
    expect(html).toContain("<code>code</code>");
  });

  it("blocks raw HTML, unsafe links, and remote image loading", () => {
    const html = renderToStaticMarkup(
      <MarkdownContent
        variant="response"
        content={[
          '<script>alert("unsafe")</script>',
          '<img src="https://tracker.invalid/raw.png" onerror="alert(1)">',
          "[unsafe](javascript:alert(1))",
          "![diagram](https://tracker.invalid/markdown.png)",
        ].join("\n\n")}
      />,
    );

    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("tracker.invalid");
    expect(html).toContain("[Image: diagram]");
  });
});
