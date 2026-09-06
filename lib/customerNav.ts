/**
 * Customer portal users only see a minimal product nav after login.
 * Dashboard hosts their ticket KPIs; Tickets is the working queue.
 * Notifications stay available from the header (not as a sidebar item).
 * `/portal` redirects to `/dashboard` and is not listed separately.
 */
export function isNavHrefAllowedForCustomer(
  href: string,
  options: { internalTicketsEnabled: boolean }
): boolean {
  if (href === '/dashboard') return true;
  if (href === '/tickets') return options.internalTicketsEnabled;
  if (href === '/notifications') return true;
  return false;
}

/** Portal route is customer-facing only (and currently redirects to dashboard). */
export function isNavHrefAllowedForInternalUser(href: string): boolean {
  return href !== '/portal';
}
