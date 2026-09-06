import {
  compareWithPinnedFirst,
  parsePinnedListIds,
  pinnedListStorageKey,
  setListItemPinned,
  toggleListItemPinned,
} from '../../lib/pinnedListItems';

describe('pinnedListItems', () => {
  it('scopes storage keys by kind and user', () => {
    expect(pinnedListStorageKey('projects', 7)).toBe('pm:pinned-projects:u7');
    expect(pinnedListStorageKey('applications', 7)).toBe('pm:pinned-applications:u7');
    expect(pinnedListStorageKey('customers', null)).toBe('pm:pinned-customers');
    expect(pinnedListStorageKey('memos', 3)).toBe('pm:pinned-memos:u3');
  });

  it('parses valid ids and drops junk', () => {
    expect(parsePinnedListIds(null)).toEqual([]);
    expect(parsePinnedListIds(JSON.stringify([3, '12', 3, 0, -1, 'x', 12]))).toEqual([3, 12]);
    expect(parsePinnedListIds('nope')).toEqual([]);
  });

  it('sorts pinned ids first in pin order', () => {
    const items = [{ Id: 1 }, { Id: 2 }, { Id: 3 }, { Id: 4 }];
    const pinned = [4, 2];
    const sorted = [...items].sort((a, b) =>
      compareWithPinnedFirst(a, b, (p) => p.Id, pinned, (x, y) => x.Id - y.Id)
    );
    expect(sorted.map((p) => p.Id)).toEqual([4, 2, 1, 3]);
  });
});

describe('pinnedListItems write helpers', () => {
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

  it('pins to the front and toggles off', () => {
    expect(setListItemPinned('projects', 10, true, 1)).toEqual([10]);
    expect(setListItemPinned('projects', 20, true, 1)).toEqual([20, 10]);
    expect(setListItemPinned('projects', 10, true, 1)).toEqual([10, 20]);
    expect(toggleListItemPinned('projects', 10, 1)).toEqual([20]);
    expect(toggleListItemPinned('projects', 20, 1)).toEqual([]);
  });

  it('keeps pin lists isolated per kind and user', () => {
    setListItemPinned('applications', 1, true, 5);
    setListItemPinned('customers', 2, true, 5);
    setListItemPinned('memos', 3, true, 9);
    expect(JSON.parse(localStorage.getItem(pinnedListStorageKey('applications', 5))!)).toEqual([1]);
    expect(JSON.parse(localStorage.getItem(pinnedListStorageKey('customers', 5))!)).toEqual([2]);
    expect(JSON.parse(localStorage.getItem(pinnedListStorageKey('memos', 9))!)).toEqual([3]);
  });
});
