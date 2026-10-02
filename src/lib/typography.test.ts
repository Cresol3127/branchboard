import { describe, expect, it } from "vitest";
import {
  MAX_READING_FONT_SIZE_PX,
  MIN_READING_FONT_SIZE_PX,
  normalizeReadingFontSize,
  normalizeReadingFontStyle,
} from "./typography";

describe("reading typography settings", () => {
  it("accepts supported font styles and defaults unknown values", () => {
    expect(normalizeReadingFontStyle("humanist")).toBe("humanist");
    expect(normalizeReadingFontStyle("comic-sans")).toBe("branchboard");
    expect(normalizeReadingFontStyle(null)).toBe("branchboard");
  });

  it("rounds and clamps reading font sizes", () => {
    expect(normalizeReadingFontSize(16.6)).toBe(17);
    expect(normalizeReadingFontSize(1)).toBe(MIN_READING_FONT_SIZE_PX);
    expect(normalizeReadingFontSize(99)).toBe(MAX_READING_FONT_SIZE_PX);
    expect(normalizeReadingFontSize("18")).toBe(12);
    expect(normalizeReadingFontSize(Number.NaN)).toBe(12);
  });
});
