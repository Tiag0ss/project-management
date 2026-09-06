import {
  filterSidebarNavBySystem,
  filterSidebarNavByUserPreference,
  isSidebarHrefAllowedBySystem,
  type SidebarNavSystemContext,
} from '../../lib/sidebarNavAccess';

const baseInternal: SidebarNavSystemContext = {
  isCustomerUser: false,
  expensesEnabled: true,
  internalTicketsEnabled: true,
  memosEnabled: true,
  permissionsLoading: false,
  canViewExpenses: true,
  canCreateExpenses: true,
  canManageTickets: true,
  canCreateTickets: true,
  isAdmin: false,
  isSupport: false,
};

describe('sidebarNavAccess', () => {
  it('hides tickets and expenses when feature flags are off even if user prefs would show them', () => {
    const catalog = [
      { href: '/dashboard' },
      { href: '/expenses' },
      { href: '/tickets' },
      { href: '/memos' },
    ];
    const systemAllowed = filterSidebarNavBySystem(catalog, {
      ...baseInternal,
      expensesEnabled: false,
      internalTicketsEnabled: false,
      memosEnabled: false,
    });
    expect(systemAllowed.map((item) => item.href)).toEqual(['/dashboard']);

    // User prefs empty = “show all I am allowed” — still no tickets/expenses/memos.
    const visible = filterSidebarNavByUserPreference(systemAllowed, []);
    expect(visible.map((item) => item.href)).toEqual(['/dashboard']);
  });

  it('lets user prefs hide allowed menus but not revive system-blocked ones', () => {
    const catalog = [
      { href: '/dashboard' },
      { href: '/projects' },
      { href: '/expenses' },
      { href: '/tickets' },
    ];
    const systemAllowed = filterSidebarNavBySystem(catalog, {
      ...baseInternal,
      expensesEnabled: false,
    });
    expect(systemAllowed.map((item) => item.href)).toEqual([
      '/dashboard',
      '/projects',
      '/tickets',
    ]);

    const visible = filterSidebarNavByUserPreference(systemAllowed, ['/projects']);
    expect(visible.map((item) => item.href)).toEqual(['/dashboard', '/tickets']);
  });

  it('keeps customer ticket link gated by the tickets feature flag', () => {
    expect(
      isSidebarHrefAllowedBySystem('/tickets', {
        ...baseInternal,
        isCustomerUser: true,
        internalTicketsEnabled: false,
      })
    ).toBe(false);
    expect(
      isSidebarHrefAllowedBySystem('/tickets', {
        ...baseInternal,
        isCustomerUser: true,
        internalTicketsEnabled: true,
      })
    ).toBe(true);
    expect(
      isSidebarHrefAllowedBySystem('/expenses', {
        ...baseInternal,
        isCustomerUser: true,
        expensesEnabled: true,
      })
    ).toBe(false);
  });

  it('requires ticket/expense permissions for internal users when flags are on', () => {
    expect(
      isSidebarHrefAllowedBySystem('/tickets', {
        ...baseInternal,
        canManageTickets: false,
        canCreateTickets: false,
        isSupport: false,
      })
    ).toBe(false);
    expect(
      isSidebarHrefAllowedBySystem('/expenses', {
        ...baseInternal,
        canViewExpenses: false,
        canCreateExpenses: false,
        isAdmin: false,
        permissionsLoading: false,
      })
    ).toBe(false);
    expect(
      isSidebarHrefAllowedBySystem('/expenses', {
        ...baseInternal,
        canViewExpenses: false,
        canCreateExpenses: false,
        permissionsLoading: true,
      })
    ).toBe(true);
  });
});
