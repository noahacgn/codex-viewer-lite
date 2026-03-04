import { describe, expect, it } from "vitest";
import { resolveThemePreference } from "$lib/theme/store";

describe("resolveThemePreference", () => {
  it("returns the stored dark theme when storage value is valid", () => {
    expect(resolveThemePreference("dark", false)).toBe("dark");
  });

  it("returns the stored light theme when storage value is valid", () => {
    expect(resolveThemePreference("light", true)).toBe("light");
  });

  it("falls back to system dark preference for invalid values", () => {
    expect(resolveThemePreference("invalid", true)).toBe("dark");
  });

  it("falls back to system light preference when storage is empty", () => {
    expect(resolveThemePreference(null, false)).toBe("light");
  });
});
