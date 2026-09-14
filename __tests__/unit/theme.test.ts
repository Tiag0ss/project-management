import {
  DEFAULT_THEME_PALETTE,
  THEME_PALETTES,
  applyThemePalette,
  applyThemePreferences,
  getStoredThemePalette,
  setThemePalette,
} from '@/lib/theme';

describe('theme', () => {
  const originalLocalStorage = globalThis.localStorage;
  let mockRoot: {
    classList: { toggle: jest.Mock };
    setAttribute: jest.Mock;
    removeAttribute: jest.Mock;
    className: string;
  };

  beforeEach(() => {
    const store = new Map<string, string>();
    const mockStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      get length() {
        return store.size;
      },
    };

    Object.defineProperty(globalThis, 'localStorage', {
      value: mockStorage,
      configurable: true,
    });

    Object.defineProperty(globalThis, 'window', {
      value: {
        localStorage: mockStorage,
        dispatchEvent: jest.fn(),
        matchMedia: jest.fn(() => ({
          matches: false,
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
        })),
      },
      configurable: true,
    });

    mockRoot = {
      className: '',
      classList: {
        toggle: jest.fn(),
      },
      setAttribute: jest.fn(),
      removeAttribute: jest.fn(),
    };

    Object.defineProperty(globalThis, 'document', {
      value: {
        documentElement: mockRoot,
      },
      configurable: true,
    });
  });

  afterAll(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: originalLocalStorage,
      configurable: true,
    });
  });

  describe('getStoredThemePalette', () => {
    it('returns synapse by default', () => {
      expect(getStoredThemePalette()).toBe('synapse');
    });

    it('returns stored palette when valid', () => {
      localStorage.setItem('themePalette', 'catppuccin');
      expect(getStoredThemePalette()).toBe('catppuccin');
    });

    it('falls back to synapse for invalid values', () => {
      localStorage.setItem('themePalette', 'invalid');
      expect(getStoredThemePalette()).toBe(DEFAULT_THEME_PALETTE);
    });
  });

  describe('applyThemePalette', () => {
    it('sets data-theme-palette on documentElement', () => {
      applyThemePalette('ocean');
      expect(mockRoot.setAttribute).toHaveBeenCalledWith('data-theme-palette', 'ocean');
    });

    it.each(THEME_PALETTES)('applies palette %s', (palette) => {
      mockRoot.setAttribute.mockClear();
      applyThemePalette(palette);
      expect(mockRoot.setAttribute).toHaveBeenCalledWith('data-theme-palette', palette);
    });
  });

  describe('setThemePalette', () => {
    it('persists and applies palette', () => {
      setThemePalette('forest');
      expect(localStorage.getItem('themePalette')).toBe('forest');
      expect(mockRoot.setAttribute).toHaveBeenCalledWith('data-theme-palette', 'forest');
    });
  });

  describe('applyThemePreferences', () => {
    it('applies both mode and palette from storage', () => {
      localStorage.setItem('themeMode', 'dark');
      localStorage.setItem('themePalette', 'catppuccin');

      applyThemePreferences();

      expect(mockRoot.classList.toggle).toHaveBeenCalledWith('dark', true);
      expect(mockRoot.classList.toggle).toHaveBeenCalledWith('light', false);
      expect(mockRoot.setAttribute).toHaveBeenCalledWith('data-theme-mode', 'dark');
      expect(mockRoot.setAttribute).toHaveBeenCalledWith('data-theme-palette', 'catppuccin');
    });
  });
});
