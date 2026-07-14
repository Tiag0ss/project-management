'use client';

import { useEffect } from 'react';
import { applyColorVisionMode, getStoredColorVisionMode } from '@/lib/colorVision';
import { applyThemeMode, getStoredThemeMode } from '@/lib/theme';

export default function PreferencesRuntime() {
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyFromStorage = () => {
      applyThemeMode(getStoredThemeMode());
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
        || event.key === 'colorVisionMode'
        || event.key === null
      ) {
        applyFromStorage();
      }
    };

    const handleColorVisionChange = () => {
      applyColorVisionMode(getStoredColorVisionMode());
    };

    mediaQuery.addEventListener('change', handleSystemThemeChange);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('color-vision-change', handleColorVisionChange);

    return () => {
      mediaQuery.removeEventListener('change', handleSystemThemeChange);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('color-vision-change', handleColorVisionChange);
    };
  }, []);

  return null;
}
