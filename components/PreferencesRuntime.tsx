'use client';

import { useEffect } from 'react';
import { applyColorVisionMode, getStoredColorVisionMode } from '@/lib/colorVision';
import { applyThemePreferences, getStoredThemeMode } from '@/lib/theme';

export default function PreferencesRuntime() {
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyFromStorage = () => {
      applyThemePreferences();
      applyColorVisionMode(getStoredColorVisionMode());
    };

    applyFromStorage();

    const handleSystemThemeChange = () => {
      if (getStoredThemeMode() === 'system') {
        applyFromStorage();
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (
        event.key === 'themeMode'
        || event.key === 'themePalette'
        || event.key === 'colorVisionMode'
        || event.key === null
      ) {
        applyFromStorage();
      }
    };

    const handleColorVisionChange = () => {
      applyColorVisionMode(getStoredColorVisionMode());
    };

    const handleThemePaletteChange = () => {
      applyFromStorage();
    };

    mediaQuery.addEventListener('change', handleSystemThemeChange);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('color-vision-change', handleColorVisionChange);
    window.addEventListener('theme-palette-change', handleThemePaletteChange);

    return () => {
      mediaQuery.removeEventListener('change', handleSystemThemeChange);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('color-vision-change', handleColorVisionChange);
      window.removeEventListener('theme-palette-change', handleThemePaletteChange);
    };
  }, []);

  return null;
}
