'use client';

import {
  COLOR_VISION_MODES,
  ColorVisionMode,
  setColorVisionMode,
} from '@/lib/colorVision';

const MODE_LABELS: Record<ColorVisionMode, { short: string; full: string }> = {
  default: { short: 'Default', full: 'Default color vision' },
  deuteranopia: { short: 'Deuter', full: 'Deuteranopia (red-green)' },
  protanopia: { short: 'Protan', full: 'Protanopia (red-green)' },
  tritanopia: { short: 'Tritan', full: 'Tritanopia (blue-yellow)' },
};

interface ColorVisionPickerProps {
  colorVisionMode: ColorVisionMode;
  onChange: (mode: ColorVisionMode) => void;
}

export default function ColorVisionPicker({ colorVisionMode, onChange }: ColorVisionPickerProps) {
  return (
    <div className="px-4 py-2">
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
        Color vision
      </p>
      <div className="grid grid-cols-2 gap-1">
        {COLOR_VISION_MODES.map((mode) => {
          const labels = MODE_LABELS[mode];
          return (
            <button
              key={mode}
              type="button"
              onClick={() => {
                setColorVisionMode(mode);
                onChange(mode);
              }}
              aria-label={`Set color vision to ${labels.full}`}
              title={labels.full}
              className={`px-2 py-1 text-xs rounded border transition-colors ${colorVisionMode === mode
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
            >
              {labels.short}
            </button>
          );
        })}
      </div>
    </div>
  );
}
