import {
  emptyRecentNavAccess,
  parseRecentNavAccess,
  pushRecentNavItem,
  recentNavParentHref,
  recentNavStorageKey,
} from '../../lib/recentNavAccess';

describe('recentNavAccess', () => {
  it('scopes storage keys by user', () => {
    expect(recentNavStorageKey(42)).toBe('pm:recent-nav-access:u42');
    expect(recentNavStorageKey(null)).toBe('pm:recent-nav-access');
  });

  it('keeps the newest two items and updates labels for the same id', () => {
    const first = pushRecentNavItem([], { id: 1, label: 'Alpha', href: '/projects/1', accessedAt: 1 });
    const second = pushRecentNavItem(first, { id: 2, label: 'Beta', href: '/projects/2', accessedAt: 2 });
    const third = pushRecentNavItem(second, { id: 3, label: 'Gamma', href: '/projects/3', accessedAt: 3 });
    expect(third.map((item) => item.id)).toEqual([3, 2]);

    const renamed = pushRecentNavItem(third, { id: 2, label: 'Beta Renamed', href: '/projects/2', accessedAt: 4 });
    expect(renamed).toEqual([
      { id: 2, label: 'Beta Renamed', href: '/projects/2', accessedAt: 4 },
      { id: 3, label: 'Gamma', href: '/projects/3', accessedAt: 3 },
    ]);
  });

  it('parses stored JSON and ignores invalid rows', () => {
    const parsed = parseRecentNavAccess(
      JSON.stringify({
        projects: [
          { id: 9, label: 'OK', href: '/projects/9', accessedAt: 10 },
          { id: 'bad', label: 'Nope', href: '/projects/x' },
        ],
        memos: [{ id: 1, label: 'Note', href: '/memos?memoId=1', accessedAt: 2 }],
      })
    );
    expect(parsed.projects).toEqual([{ id: 9, label: 'OK', href: '/projects/9', accessedAt: 10 }]);
    expect(parsed.memos).toHaveLength(1);
    expect(parsed.customers).toEqual([]);
    expect(emptyRecentNavAccess().applications).toEqual([]);
  });

  it('maps kinds to parent hrefs', () => {
    expect(recentNavParentHref('projects')).toBe('/projects');
    expect(recentNavParentHref('memos')).toBe('/memos');
    expect(recentNavParentHref('customers')).toBe('/customers');
    expect(recentNavParentHref('applications')).toBe('/applications');
  });
});
