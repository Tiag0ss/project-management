export const DEFAULT_FAVICON_PATH = '/brand-favicon.svg';

export function resolveFaviconUrl(
  storedUrl?: string | null,
  defaultUrl: string = DEFAULT_FAVICON_PATH
): string {
  const custom = String(storedUrl || '').trim();
  return custom || defaultUrl;
}

export function inferFaviconType(url: string): string | undefined {
  const normalized = url.split('?')[0].toLowerCase();
  if (normalized.endsWith('.svg')) return 'image/svg+xml';
  if (normalized.endsWith('.png')) return 'image/png';
  if (normalized.endsWith('.ico')) return 'image/x-icon';
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return 'image/jpeg';
  if (normalized.endsWith('.webp')) return 'image/webp';
  return undefined;
}
