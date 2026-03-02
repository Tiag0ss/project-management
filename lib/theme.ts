export type ThemeMode = 'system' | 'light' | 'dark';

const THEME_STORAGE_KEY = 'themeMode';

const isThemeMode = (value: string): value is ThemeMode => {
  return value === 'system' || value === 'light' || value === 'dark';
};

export const getStoredThemeMode = (): ThemeMode => {
  if (typeof window === 'undefined') {
    return 'system';
  }

  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (!stored || !isThemeMode(stored)) {
    return 'system';
  }

  return stored;
};

const getResolvedTheme = (mode: ThemeMode): 'light' | 'dark' => {
  if (mode === 'dark') return 'dark';
  if (mode === 'light') return 'light';

  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }

  return 'light';
};

export const applyThemeMode = (mode: ThemeMode): void => {
  if (typeof document === 'undefined') {
    return;
  }

  const resolvedTheme = getResolvedTheme(mode);
  const root = document.documentElement;

  root.classList.toggle('dark', resolvedTheme === 'dark');
  root.classList.toggle('light', resolvedTheme === 'light');
  root.setAttribute('data-theme-mode', mode);
};

export const setThemeMode = (mode: ThemeMode): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  }

  applyThemeMode(mode);
};
