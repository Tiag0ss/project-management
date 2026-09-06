import {
  isNavHrefAllowedForCustomer,
  isNavHrefAllowedForInternalUser,
} from '../../lib/customerNav';

describe('customerNav', () => {
  it('allows only dashboard, tickets, and notifications for customer users', () => {
    expect(isNavHrefAllowedForCustomer('/dashboard', { internalTicketsEnabled: true })).toBe(true);
    expect(isNavHrefAllowedForCustomer('/tickets', { internalTicketsEnabled: true })).toBe(true);
    expect(isNavHrefAllowedForCustomer('/tickets', { internalTicketsEnabled: false })).toBe(false);
    expect(isNavHrefAllowedForCustomer('/notifications', { internalTicketsEnabled: true })).toBe(true);
    expect(isNavHrefAllowedForCustomer('/projects', { internalTicketsEnabled: true })).toBe(false);
    expect(isNavHrefAllowedForCustomer('/portal', { internalTicketsEnabled: true })).toBe(false);
    expect(isNavHrefAllowedForCustomer('/reporting', { internalTicketsEnabled: true })).toBe(false);
  });

  it('hides portal from internal users', () => {
    expect(isNavHrefAllowedForInternalUser('/dashboard')).toBe(true);
    expect(isNavHrefAllowedForInternalUser('/portal')).toBe(false);
  });
});
