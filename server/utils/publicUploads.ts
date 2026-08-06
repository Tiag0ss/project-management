import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const PUBLIC_ROOT = path.join(process.cwd(), 'public');

export const BRANDING_UPLOAD_DIR = path.join(PUBLIC_ROOT, 'uploads', 'branding');
export const APPLICATION_UPLOAD_DIR = path.join(PUBLIC_ROOT, 'uploads', 'applications');

export const BRANDING_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'image/x-icon',
  'image/vnd.microsoft.icon',
]);

export const APPLICATION_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
]);

const EXT_BY_TYPE: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/x-icon': '.ico',
  'image/vnd.microsoft.icon': '.ico',
};

export function ensureUploadDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function extensionForMime(fileType: string, fileName?: string): string {
  const fromMime = EXT_BY_TYPE[fileType];
  if (fromMime) return fromMime;
  const fromName = path.extname(fileName || '').toLowerCase();
  if (fromName && fromName.length <= 5) return fromName;
  return '.bin';
}

export function decodeBase64FileData(fileData: string): Buffer {
  const raw = String(fileData || '');
  const comma = raw.indexOf(',');
  const payload = raw.startsWith('data:') && comma >= 0 ? raw.slice(comma + 1) : raw;
  return Buffer.from(payload, 'base64');
}

export function writePublicUpload(options: {
  dir: string;
  publicPrefix: string;
  fileType: string;
  fileName?: string;
  fileData: string;
  namePrefix: string;
}): { absolutePath: string; publicPath: string } {
  ensureUploadDir(options.dir);
  const ext = extensionForMime(options.fileType, options.fileName);
  const hash = crypto.randomBytes(6).toString('hex');
  const safePrefix = String(options.namePrefix || 'file').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  const diskName = `${safePrefix}-${hash}${ext}`;
  const absolutePath = path.join(options.dir, diskName);
  const buffer = decodeBase64FileData(options.fileData);
  fs.writeFileSync(absolutePath, buffer);
  const publicPath = `${options.publicPrefix.replace(/\/$/, '')}/${diskName}`;
  return { absolutePath, publicPath };
}

/** Delete a previously stored public upload if it lives under the expected uploads folder. */
export function deletePublicUploadIfOwned(publicPath: string | null | undefined, ownedDir: string): void {
  if (!publicPath || typeof publicPath !== 'string') return;
  if (!publicPath.startsWith('/uploads/')) return;
  const absolute = path.join(PUBLIC_ROOT, publicPath.replace(/^\//, ''));
  const normalizedOwned = path.resolve(ownedDir);
  const normalizedFile = path.resolve(absolute);
  if (!normalizedFile.startsWith(normalizedOwned + path.sep) && normalizedFile !== normalizedOwned) {
    return;
  }
  try {
    if (fs.existsSync(normalizedFile)) {
      fs.unlinkSync(normalizedFile);
    }
  } catch {
    // best-effort cleanup
  }
}
