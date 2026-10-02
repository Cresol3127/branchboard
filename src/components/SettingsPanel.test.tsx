import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../types";
import { SettingsPanel } from "./SettingsPanel";

describe("SettingsPanel appearance controls", () => {
  it("renders the reading font selector and pixel stepper", () => {
    const html = renderToStaticMarkup(
      <SettingsPanel
        settings={{
          ...structuredClone(DEFAULT_SETTINGS),
          readingFontStyle: "humanist",
          readingFontSizePx: 18,
        }}
        boardName="Board 1"
        onChange={vi.fn()}
        onSave={vi.fn(async () => undefined)}
        onClose={vi.fn()}
        onClearConversations={vi.fn()}
        onClearAnnotations={vi.fn()}
      />,
    );

    expect(html).toContain('id="reading-font-style"');
    expect(html).toContain('<option value="humanist" selected="">Humanist sans</option>');
    expect(html).toContain('id="reading-font-size"');
    expect(html).toContain('value="18"');
    expect(html).toContain('aria-label="Decrease reading text size"');
    expect(html).toContain('aria-label="Increase reading text size"');
    expect(html).toContain("Save settings");
  });
});
