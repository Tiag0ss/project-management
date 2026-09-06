import { getNavIcon, NAV_ICONS } from '../../lib/navIcons';

describe('navIcons', () => {
  it('exposes Lucide icons for every sidebar module path', () => {
    const expected = [
      '/dashboard',
      '/projects',
      '/planning',
      '/timesheet',
      '/expenses',
      '/call-records',
      '/work-summary',
      '/tickets',
      '/memos',
      '/customers',
      '/applications',
      '/approvals',
      '/dev-support',
      '/reporting',
      '/portal',
    ];

    expect(Object.keys(NAV_ICONS).sort()).toEqual([...expected].sort());
    for (const href of expected) {
      const icon = getNavIcon(href);
      expect(icon).toBe(NAV_ICONS[href as keyof typeof NAV_ICONS]);
      expect(icon).toBeTruthy();
    }
  });

  it('returns null for unknown paths', () => {
    expect(getNavIcon('/unknown')).toBeNull();
  });
});
