import fs from 'node:fs';
import path from 'node:path';
import { pool, RowDataPacket } from '../config/database';
import { cachedJson, ENTITY_TTL_SECONDS } from './cachedJson';
import { cacheKeys } from '../services/cacheKeys';

export const DEFAULT_FAVICON_PATH = '/brand-favicon.svg';

const FAVICON_FILE = 'brand-favicon.svg';
const PUBLIC_ROOT = path.join(process.cwd(), 'public');

export function getDefaultFaviconVersion(): string {
  try {
    const stat = fs.statSync(path.join(PUBLIC_ROOT, FAVICON_FILE));
    return String(Math.floor(stat.mtimeMs));
  } catch {
    return '1';
  }
}

export function getDefaultFaviconPath(): string {
  return `${DEFAULT_FAVICON_PATH}?v=${getDefaultFaviconVersion()}`;
}

export function getBrandFaviconFilePath(): string {
  return path.join(PUBLIC_ROOT, FAVICON_FILE);
}

function contentTypeForPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.ico':
      return 'image/x-icon';
    default:
      return 'application/octet-stream';
  }
}

async function getFaviconUrlSetting(): Promise<string> {
  try {
    const settings = await cachedJson(
      cacheKeys.settingsGlobal(),
      ENTITY_TTL_SECONDS,
      async () => {
        const [rows] = await pool.execute<RowDataPacket[]>(
          'SELECT SettingKey, SettingValue FROM SystemSettings'
        );
        const map: Record<string, string> = {};
        rows.forEach((row) => {
          map[String(row.SettingKey)] = String(row.SettingValue ?? '');
        });
        return map;
      }
    );
    return String(settings.faviconUrl || '').trim();
  } catch {
    return '';
  }
}

export type ResolvedFaviconTarget =
  | { kind: 'file'; absolutePath: string; contentType: string; cacheControl: string }
  | { kind: 'redirect'; url: string };

/**
 * Resolve where /favicon.ico (and legacy brand paths) should point:
 * configured SystemSettings.faviconUrl when present, otherwise the built-in SVG.
 */
export async function resolveFaviconTarget(): Promise<ResolvedFaviconTarget> {
  const configured = await getFaviconUrlSetting();

  if (configured) {
    if (/^https?:\/\//i.test(configured)) {
      return { kind: 'redirect', url: configured };
    }

    const relative = configured.startsWith('/') ? configured.slice(1) : configured;
    // Only serve local paths under public/ (uploads or root public assets)
    if (!relative.includes('..')) {
      const absolutePath = path.join(PUBLIC_ROOT, relative);
      const normalizedPublic = path.resolve(PUBLIC_ROOT);
      const normalizedFile = path.resolve(absolutePath);
      if (
        (normalizedFile.startsWith(normalizedPublic + path.sep) || normalizedFile === normalizedPublic)
        && fs.existsSync(normalizedFile)
      ) {
        return {
          kind: 'file',
          absolutePath: normalizedFile,
          contentType: contentTypeForPath(normalizedFile),
          cacheControl: 'public, max-age=3600, must-revalidate',
        };
      }
    }

    // Configured relative URL that we cannot map to disk — let the browser fetch it
    if (configured.startsWith('/')) {
      return { kind: 'redirect', url: configured };
    }
  }

  return {
    kind: 'file',
    absolutePath: getBrandFaviconFilePath(),
    contentType: 'image/svg+xml',
    cacheControl: 'public, max-age=3600, must-revalidate',
  };
}
