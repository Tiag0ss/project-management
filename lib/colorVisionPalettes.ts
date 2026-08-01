import type { CSSProperties } from 'react';
import type { ColorVisionMode } from './colorVision';

const DEUTERANOPIA_PALETTE = [
  '#0072B2',
  '#D55E00',
  '#56B4E9',
  '#E69F00',
  '#CC79A7',
  '#009E73',
  '#F0E442',
  '#332288',
] as const;

const PROTANOPIA_PALETTE = [
  '#0173B2',
  '#DE8F05',
  '#029E73',
  '#CC78BC',
  '#56B4E9',
  '#ECE133',
  '#D55E00',
  '#332288',
] as const;

const TRITANOPIA_PALETTE = [
  '#E69F00',
  '#D55E00',
  '#009E73',
  '#CC79A7',
  '#0072B2',
  '#F0E442',
  '#56B4E9',
  '#000000',
] as const;

export const PALETTES: Record<Exclude<ColorVisionMode, 'default'>, readonly string[]> = {
  deuteranopia: DEUTERANOPIA_PALETTE,
  protanopia: PROTANOPIA_PALETTE,
  tritanopia: TRITANOPIA_PALETTE,
};

/** Semantic event colors — shared across Planning and Calendar. */
export const SEMANTIC_EVENT_COLORS = {
  timeEntry: '#10b981',
  task: '#3b82f6',
  call: '#8b5cf6',
  lunch: '#f59e0b',
  recurring: '#ec4899',
  holiday: '#d97706',
  vacation: '#06b6d4',
  outOfOffice: '#f43f5e',
  devSupport: '#6366f1',
  outlook: '#0ea5e9',
} as const;

export type SemanticEventColorKey = keyof typeof SEMANTIC_EVENT_COLORS;

type Rgb = { r: number; g: number; b: number };

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const normalizeHex = (hex: string): string | null => {
  const trimmed = hex.trim();
  const match = trimmed.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!match) return null;

  const raw = match[1];
  if (raw.length === 3) {
    return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`.toLowerCase();
  }
  return `#${raw.toLowerCase()}`;
};

export const hexToRgb = (hex: string): Rgb | null => {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;

  const value = normalized.slice(1);
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
};

export const rgbToHex = ({ r, g, b }: Rgb): string => {
  const toHex = (channel: number) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const colorDistanceSq = (a: Rgb, b: Rgb): number => {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
};

export const snapToPalette = (hex: string, palette: readonly string[]): string => {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;

  let best = palette[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of palette) {
    const candidateRgb = hexToRgb(candidate);
    if (!candidateRgb) continue;
    const distance = colorDistanceSq(rgb, candidateRgb);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  return best;
};

/** Map a hex color to the nearest safe palette color for the given vision mode. */
export const mapColorForVision = (hex: string | null | undefined, mode: ColorVisionMode): string => {
  if (!hex || mode === 'default') return hex ?? '';

  const normalized = normalizeHex(hex);
  if (!normalized) return hex;

  const palette = PALETTES[mode];
  return snapToPalette(normalized, palette);
};

export const mapSemanticEventColor = (
  key: SemanticEventColorKey,
  mode: ColorVisionMode,
): string => mapColorForVision(SEMANTIC_EVENT_COLORS[key], mode);

const darkenHex = (hex: string, amount = 0.15): string => {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return rgbToHex({
    r: rgb.r * (1 - amount),
    g: rgb.g * (1 - amount),
    b: rgb.b * (1 - amount),
  });
};

export type CalendarEventType =
  | 'timeEntry'
  | 'task'
  | 'call'
  | 'lunch'
  | 'recurring'
  | 'holiday'
  | 'vacation'
  | 'outOfOffice'
  | 'devSupport'
  | 'outlook';

export const getCalendarEventColors = (
  type: CalendarEventType,
  mode: ColorVisionMode,
): { backgroundColor: string; borderColor: string } => {
  const backgroundColor = mapSemanticEventColor(type, mode);
  return {
    backgroundColor,
    borderColor: darkenHex(backgroundColor),
  };
};

/** Build rgba-style alpha suffix for hex backgrounds (e.g. '20' -> 12% opacity in 8-digit hex). */
export const withAlphaSuffix = (hex: string, suffix: string): string => {
  const normalized = normalizeHex(hex);
  if (!normalized) return hex;
  return `${normalized}${suffix}`;
};

export const buildPillStyle = (
  hex: string | null | undefined,
  mode: ColorVisionMode,
  options?: { alpha?: string; borderAlpha?: string },
): CSSProperties | undefined => {
  if (!hex) return undefined;

  const mapped = mapColorForVision(hex, mode);
  const alpha = options?.alpha ?? '22';
  const style: React.CSSProperties = {
    backgroundColor: withAlphaSuffix(mapped, alpha),
    color: mapped,
  };

  if (options?.borderAlpha) {
    style.border = `1px solid ${withAlphaSuffix(mapped, options.borderAlpha)}`;
  }

  return style;
};

export const buildBorderLeftStyle = (
  hex: string | null | undefined,
  mode: ColorVisionMode,
  width = '4px',
): CSSProperties | undefined => {
  if (!hex) return undefined;
  const mapped = mapColorForVision(hex, mode);
  return { borderLeft: `${width} solid ${mapped}` };
};

export const buildBackgroundStyle = (
  hex: string | null | undefined,
  mode: ColorVisionMode,
): CSSProperties | undefined => {
  if (!hex) return undefined;
  return { background: mapColorForVision(hex, mode) };
};
