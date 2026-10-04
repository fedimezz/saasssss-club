// lib/website-themes.ts
//
// The 5 built-in "professional themes" offered in the website setup wizard
// (and the standalone /admin/theme picker). Picking one just sets
// GymSettings.primaryColor / secondaryColor / themeId — there's no separate
// theming engine, so every page that already reads those two colors (the
// public site, via ClubSettingsContext) picks the new look up immediately.
//
// Pure data, no server-only imports — safe to import from client components.

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  primaryColor: string;
  secondaryColor: string;
  // Used for the picker's mini "browser" preview background, so a light
  // theme doesn't render dark text on a dark card and vice versa.
  previewBg: string;
  previewText: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "classic",
    name: "Classique",
    description: "Indigo sobre et professionnel — polyvalent, adapté à tout type de club.",
    primaryColor: "#4f46e5",
    secondaryColor: "#3b82f6",
    previewBg: "#f8fafc",
    previewText: "#0f172a",
  },
  {
    id: "energetic",
    name: "Énergique",
    description: "Orange et rouge vifs — pour un club fitness, crossfit ou boxe dynamique.",
    primaryColor: "#f97316",
    secondaryColor: "#ef4444",
    previewBg: "#fff7ed",
    previewText: "#1c1917",
  },
  {
    id: "nature",
    name: "Nature & Bien-être",
    description: "Vert et turquoise apaisants — yoga, piscine, spa, bien-être.",
    primaryColor: "#10b981",
    secondaryColor: "#14b8a6",
    previewBg: "#f0fdfa",
    previewText: "#134e4a",
  },
  {
    id: "midnight",
    name: "Midnight Premium",
    description: "Bleu nuit et violet — image haut de gamme, club premium.",
    primaryColor: "#4338ca",
    secondaryColor: "#8b5cf6",
    previewBg: "#0f0b24",
    previewText: "#f5f3ff",
  },
  {
    id: "minimal",
    name: "Minimaliste",
    description: "Noir et gris épurés — design sobre, orienté performance.",
    primaryColor: "#18181b",
    secondaryColor: "#71717a",
    previewBg: "#fafafa",
    previewText: "#18181b",
  },
];

export function findTheme(themeId: string | null | undefined): ThemePreset | null {
  if (!themeId) return null;
  return THEME_PRESETS.find((t) => t.id === themeId) ?? null;
}

/** True when the given colors still match one of the presets exactly. */
export function matchingThemeId(primaryColor: string | null, secondaryColor: string | null): string {
  const match = THEME_PRESETS.find(
    (t) =>
      t.primaryColor.toLowerCase() === (primaryColor ?? "").toLowerCase() &&
      t.secondaryColor.toLowerCase() === (secondaryColor ?? "").toLowerCase()
  );
  return match?.id ?? "custom";
}
