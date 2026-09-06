import {
  optionalNumberArray,
  optionalPositiveNumber,
  parsePersistedFiltersObject,
  persistedFiltersStorageKey,
  readPersistedFilters,
  writePersistedFilters,
} from '../../lib/persistedFilters';

describe('persistedFilters', () => {
  it('builds storage keys with user and optional scope', () => {
    expect(persistedFiltersStorageKey('project-tasks', 7, 42)).toBe('pm:filters:project-tasks:u7:s42');
    expect(persistedFiltersStorageKey('projects', 7)).toBe('pm:filters:projects:u7');
    expect(persistedFiltersStorageKey('projects', null)).toBe('pm:filters:projects:uanon');
  });

  it('parses objects and rejects junk', () => {
    expect(parsePersistedFiltersObject(null)).toBeNull();
    expect(parsePersistedFiltersObject('[]')).toBeNull();
    expect(parsePersistedFiltersObject('{"a":1}')).toEqual({ a: 1 });
    expect(parsePersistedFiltersObject('nope')).toBeNull();
  });

  it('coerces optional ids and id arrays', () => {
    expect(optionalPositiveNumber(undefined)).toBeUndefined();
    expect(optionalPositiveNumber(0)).toBeUndefined();
    expect(optionalPositiveNumber('12')).toBe(12);
    expect(optionalNumberArray([1, '2', 2, 0, 'x'])).toEqual([1, 2]);
  });
});

describe('persistedFilters read/write', () => {
  const originalLocalStorage = globalThis.localStorage;

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
    };
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: mockStorage,
    });
    if (typeof window !== 'undefined') {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: mockStorage,
      });
    }
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: originalLocalStorage,
    });
    if (typeof window !== 'undefined') {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: originalLocalStorage,
      });
    }
  });

  it('round-trips filters with defaults merge', () => {
    const defaults = { hideClosed: true, query: '' };
    writePersistedFilters('projects', { hideClosed: false, query: 'acme' }, { userId: 1 });
    expect(readPersistedFilters('projects', defaults, { userId: 1 })).toEqual({
      hideClosed: false,
      query: 'acme',
    });
  });

  it('isolates scopes and users', () => {
    writePersistedFilters('project-tasks', { hideClosed: true }, { userId: 1, scope: 10 });
    writePersistedFilters('project-tasks', { hideClosed: false }, { userId: 1, scope: 20 });
    expect(
      readPersistedFilters('project-tasks', { hideClosed: false }, { userId: 1, scope: 10 }).hideClosed
    ).toBe(true);
    expect(
      readPersistedFilters('project-tasks', { hideClosed: true }, { userId: 1, scope: 20 }).hideClosed
    ).toBe(false);
  });
});
