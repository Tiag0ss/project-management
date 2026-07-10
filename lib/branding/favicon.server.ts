import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_FAVICON_PATH, resolveFaviconUrl as resolveSharedFaviconUrl } from './favicon.shared';

const FAVICON_FILE = 'brand-favicon.svg';

export function getDefaultFaviconVersion(): string {
  try {
    const stat = fs.statSync(path.join(process.cwd(), 'public', FAVICON_FILE));
    return String(Math.floor(stat.mtimeMs));
  } catch {
    return '1';
  }
}

export function getDefaultFaviconPath(): string {
  return `${DEFAULT_FAVICON_PATH}?v=${getDefaultFaviconVersion()}`;
}

export function resolveFaviconUrl(storedUrl?: string | null): string {
  return resolveSharedFaviconUrl(storedUrl, getDefaultFaviconPath());
}

export function getBrandFaviconFilePath(): string {
  return path.join(process.cwd(), 'public', FAVICON_FILE);
}
