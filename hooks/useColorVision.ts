'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ColorVisionMode,
  applyColorVisionMode,
  getStoredColorVisionMode,
  setColorVisionMode,
} from '@/lib/colorVision';
import {
  buildBackgroundStyle,
  buildBorderLeftStyle,
  buildPillStyle,
  mapColorForVision,
  mapSemanticEventColor,
  type SemanticEventColorKey,
  withAlphaSuffix,
} from '@/lib/colorVisionPalettes';

export const useColorVision = () => {
  const [mode, setModeState] = useState<ColorVisionMode>('default');

  useEffect(() => {
    const sync = () => {
      const stored = getStoredColorVisionMode();
      setModeState(stored);
      applyColorVisionMode(stored);
    };

    sync();

    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'colorVisionMode' || event.key === null) {
        sync();
      }
    };

    const handleCustom = () => sync();

    window.addEventListener('storage', handleStorage);
    window.addEventListener('color-vision-change', handleCustom);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('color-vision-change', handleCustom);
    };
  }, []);

  const setMode = useCallback((next: ColorVisionMode) => {
    setColorVisionMode(next);
    setModeState(next);
  }, []);

  const mapColor = useCallback(
    (hex: string | null | undefined) => mapColorForVision(hex, mode),
    [mode],
  );

  const mapSemanticColor = useCallback(
    (key: SemanticEventColorKey) => mapSemanticEventColor(key, mode),
    [mode],
  );

  const pillStyle = useCallback(
    (
      hex: string | null | undefined,
      options?: { alpha?: string; borderAlpha?: string },
    ) => buildPillStyle(hex, mode, options),
    [mode],
  );

  const borderLeftStyle = useCallback(
    (hex: string | null | undefined, width?: string) => buildBorderLeftStyle(hex, mode, width),
    [mode],
  );

  const backgroundStyle = useCallback(
    (hex: string | null | undefined) => buildBackgroundStyle(hex, mode),
    [mode],
  );

  const alphaColor = useCallback(
    (hex: string | null | undefined, suffix: string) => withAlphaSuffix(mapColor(hex), suffix),
    [mapColor],
  );

  return {
    mode,
    setMode,
    mapColor,
    mapSemanticColor,
    pillStyle,
    borderLeftStyle,
    backgroundStyle,
    alphaColor,
  };
};
