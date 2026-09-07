/** Hex color helpers shared by task detail UI (status pills, tag chips). */

export const clampColorChannel = (value: number): number =>
  Math.max(0, Math.min(255, Math.round(value)));

export const normalizeHexColor = (color: string | undefined): string => {
  const fallback = '#6B7280';
  if (!color) return fallback;
  const trimmed = color.trim();
  const hex = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;

  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    return `#${hex
      .split('')
      .map((char) => char + char)
      .join('')}`;
  }

  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return `#${hex}`;
  }

  return fallback;
};

export const hexToRgb = (color: string): { r: number; g: number; b: number } => {
  const normalized = normalizeHexColor(color);
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
};

export const rgbToHex = ({ r, g, b }: { r: number; g: number; b: number }): string => {
  const toHex = (value: number) => clampColorChannel(value).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

export const blendHexColors = (baseColor: string, mixColor: string, ratio: number): string => {
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

export const withAlpha = (color: string, alphaHex: string): string =>
  `${normalizeHexColor(color)}${alphaHex}`;
