'use client';

interface SegmentedTagBadgeProps {
  name: string;
  color?: string | null;
  size?: 'xs' | 'sm';
  className?: string;
}

const clampColorChannel = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

const normalizeHexColor = (color: string | undefined | null): string => {
  const fallback = '#6B7280';
  if (!color) return fallback;

  const trimmed = color.trim();
  const hex = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;

  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    return `#${hex.split('').map((char) => char + char).join('')}`;
  }

  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return `#${hex}`;
  }

  return fallback;
};

const hexToRgb = (color: string): { r: number; g: number; b: number } => {
  const normalized = normalizeHexColor(color);
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
};

const rgbToHex = ({ r, g, b }: { r: number; g: number; b: number }): string => {
  const toHex = (value: number) => clampColorChannel(value).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const blendHexColors = (baseColor: string, mixColor: string, ratio: number): string => {
  const base = hexToRgb(baseColor);
  const mix = hexToRgb(mixColor);
  const mixRatio = Math.max(0, Math.min(1, ratio));
  const baseRatio = 1 - mixRatio;

  return rgbToHex({
    r: base.r * baseRatio + mix.r * mixRatio,
    g: base.g * baseRatio + mix.g * mixRatio,
    b: base.b * baseRatio + mix.b * mixRatio,
  });
};

const withAlpha = (color: string, alphaHex: string): string => `${normalizeHexColor(color)}${alphaHex}`;

export default function SegmentedTagBadge({
  name,
  color,
  size = 'xs',
  className = '',
}: SegmentedTagBadgeProps) {
  const segments = String(name || '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);

  const fallbackLabel = String(name || '').trim() || 'Tag';
  const label = segments[0] || fallbackLabel;
  const baseColor = normalizeHexColor(color);
  const sizeClass = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[11px]';

  if (segments.length <= 1) {
    return (
      <span
        className={`inline-flex items-center rounded-full border font-medium leading-none ${sizeClass} ${className}`.trim()}
        style={{
          backgroundColor: withAlpha(baseColor, '20'),
          color: baseColor,
          borderColor: withAlpha(baseColor, '55'),
        }}
      >
        {label}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-stretch overflow-hidden rounded-md border shadow-sm ${className}`.trim()}
      style={{ borderColor: withAlpha(baseColor, '66') }}
    >
      {segments.map((segment, index) => {
        const segmentBackground = index === 0
          ? blendHexColors(baseColor, '#111827', 0.18)
          : index === segments.length - 1
            ? baseColor
            : blendHexColors(baseColor, '#ffffff', 0.12 * index);

        const segmentTextColor = index === 0
          ? blendHexColors(baseColor, '#ffffff', 0.72)
          : '#ffffff';

        return (
          <span
            key={`${fallbackLabel}-${segment}-${index}`}
            className={`${sizeClass} font-semibold leading-none`.trim()}
            style={{
              backgroundColor: segmentBackground,
              color: segmentTextColor,
              borderLeft: index === 0 ? 'none' : `1px solid ${withAlpha(baseColor, '88')}`,
            }}
          >
            {segment}
          </span>
        );
      })}
    </span>
  );
}
