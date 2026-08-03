export const THEME_KEYS = {
  primary: "theme_primary",
  secondary: "theme_secondary",
} as const;

/** Swappable accent presets — the app defaults to Blue. */
export const ACCENT_PRESETS = [
  { name: "Blue", hex: "#2563eb" },
  { name: "Green", hex: "#059669" },
  { name: "Red", hex: "#dc2626" },
  { name: "Violet", hex: "#7c3aed" },
  { name: "Amber", hex: "#d97706" },
] as const;

export const DEFAULT_THEME = {
  primary: ACCENT_PRESETS[0].hex,
  secondary: "#eef2f6",
} as const;

export const THEME_EVENT = "pos-theme-changed";

const THEME_CSS_VARS = [
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "accent",
  "accent-foreground",
  "ring",
  "sidebar-primary",
  "sidebar-primary-foreground",
] as const;

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = parseInt(match[1], 16);
  return {
    r: (value >> 16) & 0xff,
    g: (value >> 8) & 0xff,
    b: value & 0xff,
  };
}

export function isDarkColor(hex: string): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luminance < 0.5;
}

export function readableForeground(hex: string): string {
  return isDarkColor(hex) ? "#ffffff" : "#000000";
}

export function hexIsValid(hex: string): boolean {
  return hexToRgb(hex) !== null;
}

export function applyTheme(
  primary: string | null,
  secondary: string | null,
  root: HTMLElement = document.documentElement,
): void {
  const vars: Record<string, string | null> = {
    primary,
    secondary,
  };

  const primaryFg = primary ? readableForeground(primary) : null;
  const secondaryFg = secondary ? readableForeground(secondary) : null;

  for (const name of THEME_CSS_VARS) {
    let value: string | null = null;
    if (name === "primary") value = vars.primary;
    else if (name === "secondary") value = vars.secondary;
    else if (name === "primary-foreground") value = primaryFg;
    else if (name === "secondary-foreground") value = secondaryFg;
    else if (name === "accent") value = vars.secondary;
    else if (name === "accent-foreground") value = secondaryFg;
    else if (name === "ring") value = vars.primary;
    else if (name === "sidebar-primary") value = vars.primary;
    else if (name === "sidebar-primary-foreground") value = primaryFg;

    if (value === null) root.style.removeProperty(`--${name}`);
    else root.style.setProperty(`--${name}`, value);
  }
}
