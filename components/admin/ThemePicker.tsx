"use client";
// ThemePicker — grid of the 5 built-in themes (lib/website-themes.ts). Each
// card shows a mini "browser" preview in that theme's colors and a
// selected-state ring. Purely a controlled input: the parent owns the
// selected theme id and decides what to do with it (usually: stage
// primaryColor/secondaryColor/themeId for the next save).
import { Check } from "lucide-react";
import { THEME_PRESETS, type ThemePreset } from "@/lib/website-themes";

interface ThemePickerProps {
  selectedId: string;
  onSelect: (theme: ThemePreset) => void;
  disabled?: boolean;
  clubName?: string;
}

export default function ThemePicker({ selectedId, onSelect, disabled, clubName }: ThemePickerProps) {
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {THEME_PRESETS.map((theme) => {
        const selected = theme.id === selectedId;
        return (
          <button
            key={theme.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(theme)}
            aria-pressed={selected}
            className={`text-left rounded-2xl border-2 overflow-hidden transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
              selected
                ? "border-[var(--primary)] ring-2 ring-[var(--primary)]/30"
                : "border-border hover:border-[var(--primary)]/40"
            }`}
          >
            {/* Mini live preview */}
            <div className="p-3" style={{ backgroundColor: theme.previewBg }}>
              <div className="rounded-lg overflow-hidden shadow-sm" style={{ backgroundColor: theme.previewBg }}>
                <div
                  className="h-8 flex items-center px-3 gap-1.5"
                  style={{ backgroundColor: theme.primaryColor }}
                >
                  <span className="w-2 h-2 rounded-full bg-white/70" />
                  <span className="w-2 h-2 rounded-full bg-white/50" />
                  <span className="w-2 h-2 rounded-full bg-white/30" />
                </div>
                <div className="p-4">
                  <p className="text-sm font-bold truncate" style={{ color: theme.previewText }}>
                    {clubName || "Votre club"}
                  </p>
                  <p className="text-[11px] mt-1 opacity-70" style={{ color: theme.previewText }}>
                    Votre espace sportif, votre identité.
                  </p>
                  <span
                    className="inline-block mt-2.5 px-3 py-1 rounded-full text-[10px] font-semibold text-white"
                    style={{ backgroundColor: theme.secondaryColor }}
                  >
                    Réserver
                  </span>
                </div>
              </div>
            </div>

            {/* Label */}
            <div className="p-3.5 flex items-start justify-between gap-2 bg-card">
              <div className="min-w-0">
                <p className="font-semibold text-primary text-sm">{theme.name}</p>
                <p className="text-xs text-muted mt-0.5">{theme.description}</p>
              </div>
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                  selected ? "border-[var(--primary)] bg-[var(--primary)]" : "border-border"
                }`}
              >
                {selected && <Check size={11} className="text-white" />}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
