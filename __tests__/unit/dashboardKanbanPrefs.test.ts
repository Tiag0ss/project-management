import {
  filterVisibleStatuses,
  parseHiddenStatusesByOrg,
  parseKanbanOrgFilter,
  withHiddenStatusToggled,
} from '../../lib/dashboardKanbanPrefs';

describe('parseKanbanOrgFilter', () => {
  it('defaults to all for empty or invalid values', () => {
    expect(parseKanbanOrgFilter(null)).toBe('all');
    expect(parseKanbanOrgFilter('')).toBe('all');
    expect(parseKanbanOrgFilter('all')).toBe('all');
    expect(parseKanbanOrgFilter('0')).toBe('all');
    expect(parseKanbanOrgFilter('abc')).toBe('all');
  });

  it('parses positive organization ids', () => {
    expect(parseKanbanOrgFilter('12')).toBe(12);
  });
});

describe('hidden status preferences', () => {
  it('parses a per-org map and ignores bad entries', () => {
    expect(parseHiddenStatusesByOrg('{"3":[1,2],"x":"no"}')).toEqual({ '3': [1, 2] });
    expect(parseHiddenStatusesByOrg('not-json')).toEqual({});
  });

  it('toggles hidden status ids per organization', () => {
    const withHidden = withHiddenStatusToggled({}, 3, 10, true);
    expect(withHidden).toEqual({ '3': [10] });
    const cleared = withHiddenStatusToggled(withHidden, 3, 10, false);
    expect(cleared).toEqual({});
  });

  it('filters visible statuses', () => {
    const statuses = [{ Id: 1 }, { Id: 2 }, { Id: 3 }];
    expect(filterVisibleStatuses(statuses, [2]).map((s) => s.Id)).toEqual([1, 3]);
  });
});
