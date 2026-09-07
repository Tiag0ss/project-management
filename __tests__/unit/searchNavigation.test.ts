import { resolveSearchResultHref } from '../../lib/chrome/searchNavigation';

describe('resolveSearchResultHref', () => {
  it('builds destinations for common entity types', () => {
    expect(resolveSearchResultHref('project', 9)).toBe('/projects/9');
    expect(resolveSearchResultHref('organization', 3)).toBe('/organizations/3');
    expect(resolveSearchResultHref('user', 42)).toBe('/users/42');
    expect(resolveSearchResultHref('task', 5, { projectId: 2 })).toBe('/projects/2?task=5');
    expect(resolveSearchResultHref('task', 5)).toBe('/projects?task=5');
  });

  it('respects tickets feature flag', () => {
    expect(resolveSearchResultHref('ticket', 1)).toBe('/tickets/1');
    expect(resolveSearchResultHref('ticket', 1, { internalTicketsEnabled: false })).toBeNull();
  });
});
