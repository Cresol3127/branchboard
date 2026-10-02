import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("canvas trays", () => {
  it("keeps both tray contents collapsed until their open state is applied", () => {
    expect(stylesheet).toMatch(
      /\.annotation-tray-content,\s*\.conversation-color-tray-content\s*\{[^}]*max-width:\s*0;/s,
    );
    expect(stylesheet).toContain(
      ".annotation-tray.is-open .annotation-tray-content",
    );
    expect(stylesheet).toContain(
      ".conversation-color-tray.is-open .conversation-color-tray-content",
    );
  });

  it("styles the token marquee and selected conversation independently", () => {
    expect(stylesheet).toContain(
      ".board-canvas.tool-compare .react-flow__selection",
    );
    expect(stylesheet).toContain(".conversation-card.is-token-selected");
  });

  it("styles family movement and N-parent merge states independently", () => {
    expect(stylesheet).toContain(".conversation-card.is-family-selected");
    expect(stylesheet).toContain(".family-selection-summary");
    expect(stylesheet).toContain(".conversation-card.merge-selected");
    expect(stylesheet).not.toContain(".conversation-card.merge-source");
  });

  it("styles mixed annotation selection and its drag handle", () => {
    expect(stylesheet).toContain(".sticky-note.is-group-selected");
    expect(stylesheet).toContain(".ink-stroke.is-selected");
    expect(stylesheet).toContain(".group-selection-drag-handle");
    expect(stylesheet).toContain(".family-selection-metrics");
  });

  it("styles the explicit sibling retry route chooser", () => {
    expect(stylesheet).toContain(".retry-route-heading");
    expect(stylesheet).toContain(".retry-route-actions");
    expect(stylesheet).toContain(
      ':root[data-theme="light"] .retry-route-actions button:last-child',
    );
  });

  it("does not retain the removed priority marker", () => {
    expect(stylesheet).not.toContain(".conversation-card.is-highlighted");
  });

  it("applies configurable typography only to reading surfaces", () => {
    expect(stylesheet).toContain(':root[data-reading-font="humanist"]');
    expect(stylesheet).toMatch(
      /\.markdown-content\s*\{[^}]*font-family:\s*var\(--reading-body-font\);[^}]*font-size:\s*var\(--reading-font-size\);/s,
    );
    expect(stylesheet).toMatch(
      /\.sticky-note textarea\s*\{[^}]*font-family:\s*var\(--reading-display-font\);/s,
    );
    expect(stylesheet).toMatch(
      /\.markdown-content code\s*\{[^}]*ui-monospace/s,
    );
  });
});
