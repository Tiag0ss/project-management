/** Canonical app paths (legacy `/old` prefix removed). */
export function oldPath(path: string): string {
  if (!path || path === '/') return '/dashboard';
  const [pathname, query = ''] = path.split('?');
  const q = query ? `?${query}` : '';
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
  if (normalized.startsWith('/old/') || normalized === '/old') {
    const rest = normalized === '/old' ? '/dashboard' : normalized.slice('/old'.length) || '/dashboard';
    return `${rest}${q}`;
  }
  return `${normalized}${q}`;
}

/** Prefer the live shell path; `rebuilt` is kept for call-site compatibility. */
export function appOrOldPath(path: string, _rebuilt = true): string {
  return oldPath(path);
}
