'use client';

import { useEffect } from 'react';
import { applyThemeMode, getStoredThemeMode } from '@/lib/theme';

export default function ThemeRuntime() {
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyFromStorage = () => {
      const mode = getStoredThemeMode();
      applyThemeMode(mode);
    };

    applyFromStorage();

    const handleSystemThemeChange = () => {
      if (getStoredThemeMode() === 'system') {
        applyFromStorage();
      }
    };

    mediaQuery.addEventListener('change', handleSystemThemeChange);
    window.addEventListener('storage', applyFromStorage);

    return () => {
      mediaQuery.removeEventListener('change', handleSystemThemeChange);
      window.removeEventListener('storage', applyFromStorage);
    };
  }, []);

  return null;
}
