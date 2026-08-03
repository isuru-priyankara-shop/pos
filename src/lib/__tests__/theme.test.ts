import { describe, expect, it } from "vitest";
import {
  applyTheme,
  DEFAULT_THEME,
  hexIsValid,
  hexToRgb,
  isDarkColor,
  readableForeground,
} from "@/lib/theme";

describe("hexToRgb", () => {
  it("parses 6-digit hex with or without #", () => {
    expect(hexToRgb("#ff8800")).toEqual({ r: 255, g: 136, b: 0 });
    expect(hexToRgb("ff8800")).toEqual({ r: 255, g: 136, b: 0 });
  });

  it("is case-insensitive", () => {
    expect(hexToRgb("#FF0088")).toEqual({ r: 255, g: 0, b: 136 });
  });

  it("rejects invalid input", () => {
    expect(hexToRgb("")).toBeNull();
    expect(hexToRgb("#fff")).toBeNull();
    expect(hexToRgb("#gggggg")).toBeNull();
    expect(hexToRgb("blue")).toBeNull();
    expect(hexToRgb("#ff88000")).toBeNull();
  });
});

describe("isDarkColor", () => {
  it("treats black as dark and white as light", () => {
    expect(isDarkColor("#000000")).toBe(true);
    expect(isDarkColor("#ffffff")).toBe(false);
  });

  it("treats navy as dark and yellow as light", () => {
    expect(isDarkColor("#00008b")).toBe(true);
    expect(isDarkColor("#ffff00")).toBe(false);
  });
});

describe("readableForeground", () => {
  it("returns white on dark colors and black on light colors", () => {
    expect(readableForeground("#111111")).toBe("#ffffff");
    expect(readableForeground("#f5f5f5")).toBe("#000000");
    expect(readableForeground("#2563eb")).toBe("#ffffff");
  });
});

describe("hexIsValid", () => {
  it("accepts valid hex and rejects everything else", () => {
    expect(hexIsValid("#abc123")).toBe(true);
    expect(hexIsValid("ABC123")).toBe(true);
    expect(hexIsValid("#abz123")).toBe(false);
    expect(hexIsValid("12")).toBe(false);
  });
});

function fakeRoot(): HTMLElement {
  const styles: Record<string, string> = {};
  return {
    style: {
      setProperty: (name: string, value: string) => {
        styles[name] = value;
      },
      removeProperty: (name: string) => {
        delete styles[name];
      },
      getPropertyValue: (name: string) => styles[name] ?? "",
    },
  } as unknown as HTMLElement;
}

describe("applyTheme", () => {
  it("sets derived CSS variables from the chosen colors", () => {
    const root = fakeRoot();
    applyTheme("#111111", "#f5f5f5", root);

    expect(root.style.getPropertyValue("--primary")).toBe("#111111");
    expect(root.style.getPropertyValue("--primary-foreground")).toBe("#ffffff");
    expect(root.style.getPropertyValue("--secondary")).toBe("#f5f5f5");
    expect(root.style.getPropertyValue("--secondary-foreground")).toBe("#000000");
    expect(root.style.getPropertyValue("--ring")).toBe("#111111");
    expect(root.style.getPropertyValue("--accent")).toBe("#f5f5f5");
    expect(root.style.getPropertyValue("--sidebar-primary")).toBe("#111111");
  });

  it("removes overrides when reset with null", () => {
    const root = fakeRoot();
    applyTheme("#111111", "#f5f5f5", root);
    applyTheme(null, null, root);

    expect(root.style.getPropertyValue("--primary")).toBe("");
    expect(root.style.getPropertyValue("--secondary")).toBe("");
    expect(root.style.getPropertyValue("--ring")).toBe("");
  });
});

describe("DEFAULT_THEME", () => {
  it("matches the app's default palette", () => {
    expect(DEFAULT_THEME.primary).toBe("#2563eb");
    expect(DEFAULT_THEME.secondary).toBe("#eef2f6");
  });
});
