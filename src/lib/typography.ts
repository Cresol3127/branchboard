import type { ReadingFontStyle } from "../types";

export const MIN_READING_FONT_SIZE_PX = 10;
export const MAX_READING_FONT_SIZE_PX = 24;

export const READING_FONT_OPTIONS: ReadonlyArray<{
  value: ReadingFontStyle;
  label: string;
}> = [
  { value: "branchboard", label: "Branchboard default" },
  { value: "sans", label: "Modern sans" },
  { value: "humanist", label: "Humanist sans" },
  { value: "serif", label: "Classic serif" },
  { value: "mono", label: "Monospace" },
];

const READING_FONT_STYLES = new Set<ReadingFontStyle>(
  READING_FONT_OPTIONS.map(({ value }) => value),
);

export function normalizeReadingFontStyle(value: unknown): ReadingFontStyle {
  return typeof value === "string" && READING_FONT_STYLES.has(value as ReadingFontStyle)
    ? value as ReadingFontStyle
    : "branchboard";
}

export function normalizeReadingFontSize(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(numeric)) return 12;
  return Math.min(
    MAX_READING_FONT_SIZE_PX,
    Math.max(MIN_READING_FONT_SIZE_PX, Math.round(numeric)),
  );
}
