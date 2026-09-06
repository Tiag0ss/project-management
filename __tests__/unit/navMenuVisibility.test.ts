import {
  isNavItemUserVisible,
  isNavMenuAlwaysVisible,
  navMenuVisibilityStorageKey,
  parseNavMenuHidden,
  setNavMenuItemHidden,
} from '../../lib/navMenuVisibility';

describe('navMenuVisibility', () => {
  it('scopes storage keys by user', () => {
    expect(navMenuVisibilityStorageKey(7)).toBe('pm:nav-menu-hidden:u7');
    expect(navMenuVisibilityStorageKey(null)).toBe('pm:nav-menu-hidden');
  });

  it('parses hidden hrefs and drops dashboard / invalid entries', () => {
    expect(parseNavMenuHidden(null)).toEqual([]);
    expect(
      parseNavMenuHidden(
        JSON.stringify(['/projects', '/dashboard', 'projects', '/projects', 3, '/reporting'])
      )
    ).toEqual(['/projects', '/reporting']);
    expect(parseNavMenuHidden('nope')).toEqual([]);
  });

  it('keeps always-visible menus visible even when listed as hidden', () => {
    expect(isNavMenuAlwaysVisible('/dashboard')).toBe(true);
    expect(isNavItemUserVisible('/dashboard', ['/dashboard', '/projects'])).toBe(true);
    expect(isNavItemUserVisible('/projects', ['/projects'])).toBe(false);
    expect(isNavItemUserVisible('/planning', [])).toBe(true);
  });
});

describe('navMenuVisibility write helpers', () => {
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
        clear: () => store.clear(),
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: originalLocalStorage,
    });
  });

  it('toggles hide state without allowing dashboard to be hidden', () => {
    expect(setNavMenuItemHidden('/dashboard', true, 1)).toEqual([]);
    expect(setNavMenuItemHidden('/projects', true, 1)).toEqual(['/projects']);
    expect(setNavMenuItemHidden('/projects', false, 1)).toEqual([]);
  });
});
