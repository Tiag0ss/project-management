export type ColorVisionMode = 'default' | 'deuteranopia' | 'protanopia' | 'tritanopia';

export const COLOR_VISION_MODES: ColorVisionMode[] = [
  'default',
  'deuteranopia',
  'protanopia',
  'tritanopia',
];

const COLOR_VISION_STORAGE_KEY = 'colorVisionMode';

const isColorVisionMode = (value: string): value is ColorVisionMode =>
  COLOR_VISION_MODES.includes(value as ColorVisionMode);

export const getStoredColorVisionMode = (): ColorVisionMode => {
  if (typeof window === 'undefined') {
    return 'default';
  }

  const stored = localStorage.getItem(COLOR_VISION_STORAGE_KEY);
  if (!stored || !isColorVisionMode(stored)) {
    return 'default';
  }

  return stored;
};

export const applyColorVisionMode = (mode: ColorVisionMode): void => {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;

  if (mode === 'default') {
    root.removeAttribute('data-color-vision');
  } else {
    root.setAttribute('data-color-vision', mode);
  }
};

export const setColorVisionMode = (mode: ColorVisionMode): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(COLOR_VISION_STORAGE_KEY, mode);
  }

  applyColorVisionMode(mode);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('color-vision-change', { detail: mode }));
  }
};

/** Inline script source for early preference apply (theme + color vision) before paint. */
export const PREFERENCES_EARLY_APPLY_SCRIPT = `
(function () {
  try {
    var themeMode = localStorage.getItem('themeMode');
    var themePalette = localStorage.getItem('themePalette');
    var colorVisionMode = localStorage.getItem('colorVisionMode');
    var resolved = themeMode === 'dark' ? 'dark' : themeMode === 'light' ? 'light'
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var root = document.documentElement;
    root.classList.toggle('dark', resolved === 'dark');
    root.classList.toggle('light', resolved === 'light');
    if (themeMode === 'system' || themeMode === 'light' || themeMode === 'dark') {
      root.setAttribute('data-theme-mode', themeMode);
    }
    if (themePalette === 'synapse' || themePalette === 'catppuccin' || themePalette === 'ocean' || themePalette === 'forest') {
      root.setAttribute('data-theme-palette', themePalette);
    } else {
      root.setAttribute('data-theme-palette', 'synapse');
    }
    if (colorVisionMode && colorVisionMode !== 'default') {
      root.setAttribute('data-color-vision', colorVisionMode);
    }
  } catch (e) {}
})();
`.trim();
