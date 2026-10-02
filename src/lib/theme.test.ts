import { describe, expect, it } from "vitest";
import { oppositeTheme, resolveTheme, themeColor } from "./theme";

describe("theme helpers", () => {
  it("follows the operating system only in system mode", () => {
    expect(resolveTheme("system", "light")).toBe("light");
    expect(resolveTheme("system", "dark")).toBe("dark");
    expect(resolveTheme("dark", "light")).toBe("dark");
    expect(resolveTheme("light", "dark")).toBe("light");
  });

  it("creates an explicit opposite theme and matching browser color", () => {
    expect(oppositeTheme("dark")).toBe("light");
    expect(oppositeTheme("light")).toBe("dark");
    expect(themeColor("light")).toBe("#fef7ff");
    expect(themeColor("dark")).toBe("#141218");
  });
});
