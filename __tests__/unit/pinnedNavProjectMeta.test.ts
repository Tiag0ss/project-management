import {
  isPlaceholderPinnedNavLabel,
  parsePinnedNavProjectMeta,
  pickPinnedNavLabel,
  pinnedNavProjectMetaStorageKey,
  resolvePinnedNavProjects,
} from '../../lib/pinnedNavProjectMeta';

describe('pinnedNavProjectMeta', () => {
  it('scopes storage keys by user', () => {
    expect(pinnedNavProjectMetaStorageKey(7)).toBe('pm:pinned-nav-project-meta:u7');
    expect(pinnedNavProjectMetaStorageKey(null)).toBe('pm:pinned-nav-project-meta');
  });

  it('parses valid meta and drops junk', () => {
    expect(parsePinnedNavProjectMeta(null)).toEqual({});
    expect(
      parsePinnedNavProjectMeta(
        JSON.stringify({
          3: { id: 3, label: 'Alpha', href: '/projects/3' },
          bad: { label: 'x', href: '/projects/1' },
          4: { label: '', href: '/projects/4' },
          5: { label: 'Beta', href: '/projects/5' },
        })
      )
    ).toEqual({
      3: { id: 3, label: 'Alpha', href: '/projects/3' },
      5: { id: 5, label: 'Beta', href: '/projects/5' },
    });
  });

  it('picks real labels over Project #id placeholders', () => {
    expect(isPlaceholderPinnedNavLabel(1, 'Project #1')).toBe(true);
    expect(isPlaceholderPinnedNavLabel(1, 'Internal')).toBe(false);
    expect(pickPinnedNavLabel(1, 'Project #1', 'Internal Projects')).toBe('Internal Projects');
    expect(pickPinnedNavLabel(9, undefined, 'Project #9')).toBe('Project #9');
  });

  it('resolves many pinned rows preferring meta over placeholder recent', () => {
    const rows = resolvePinnedNavProjects(
      [5, 2, 9, 1],
      [
        { id: 2, label: 'From recent', href: '/projects/2' },
        { id: 1, label: 'Project #1', href: '/projects/1' },
      ],
      {
        5: { id: 5, label: 'From meta', href: '/projects/5' },
        1: { id: 1, label: 'Internal Projects', href: '/projects/1' },
      }
    );
    expect(rows).toEqual([
      { id: 5, label: 'From meta', href: '/projects/5' },
      { id: 2, label: 'From recent', href: '/projects/2' },
      { id: 9, label: 'Project #9', href: '/projects/9' },
      { id: 1, label: 'Internal Projects', href: '/projects/1' },
    ]);
  });
});
