import type { ThemePreference } from "../types";

export type ResolvedTheme = Exclude<ThemePreference, "system">;

export function resolveTheme(
  preference: ThemePreference,
  systemTheme: ResolvedTheme,
): ResolvedTheme {
  return preference === "system" ? systemTheme : preference;
}

export function oppositeTheme(theme: ResolvedTheme): ResolvedTheme {
  return theme === "dark" ? "light" : "dark";
}

export function themeColor(theme: ResolvedTheme): string {
  return theme === "dark" ? "#141218" : "#fef7ff";
}
