'use client';

import {
  THEME_PALETTE_META,
  THEME_PALETTES,
  ThemePalette,
  setThemePalette,
} from '@/lib/theme';

interface ThemePalettePickerProps {
  themePalette: ThemePalette;
  onChange: (palette: ThemePalette) => void;
  variant?: 'synapse' | 'legacy';
}

export default function ThemePalettePicker({
  themePalette,
  onChange,
  variant = 'legacy',
}: ThemePalettePickerProps) {
  const isSynapse = variant === 'synapse';

  return (
    <div className="px-4 py-2">
      <p
        className={
          isSynapse
            ? 'mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--pm-muted)]'
            : 'mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400'
        }
      >
        Palette
      </p>
      <div className="grid grid-cols-2 gap-1">
        {THEME_PALETTES.map((palette) => {
          const meta = THEME_PALETTE_META[palette];
          const isSelected = themePalette === palette;

          return (
            <button
              key={palette}
              type="button"
              onClick={() => {
                setThemePalette(palette);
                onChange(palette);
              }}
              aria-label={`Set palette to ${meta.label}`}
              title={meta.label}
              className={
                isSynapse
                  ? `flex items-center gap-1.5 rounded border px-2 py-1.5 text-xs transition-colors ${
                      isSelected
                        ? 'border-[var(--pm-accent)] bg-[var(--pm-accent)] text-[var(--pm-accent-fg)]'
                        : 'border-[var(--pm-border)] bg-[var(--pm-surface)] text-[var(--pm-text)] hover:bg-[var(--pm-surface-2)]'
                    }`
                  : `flex items-center gap-1.5 rounded border px-2 py-1.5 text-xs transition-colors ${
                      isSelected
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                    }`
              }
            >
              <span className="flex shrink-0 gap-0.5" aria-hidden="true">
                <span
                  className="inline-block h-3 w-3 rounded-full border border-black/10"
                  style={{ backgroundColor: meta.swatchLight }}
                />
                <span
                  className="inline-block h-3 w-3 rounded-full border border-white/10"
                  style={{ backgroundColor: meta.swatchDark }}
                />
              </span>
              <span className="truncate">{meta.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
