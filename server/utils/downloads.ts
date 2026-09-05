import path from 'path';
import { promises as fsPromises } from 'fs';
import fs from 'fs';

export type DesktopPlatform = 'win' | 'linux';
export type IdeExtensionKind = 'vscode' | 'rider' | 'visualstudio';

type ReleaseCandidate = {
  fileName: string;
  absolutePath: string;
  mtimeMs: number;
};

export function getReleaseDir(): string {
  return path.join(process.cwd(), 'extras', 'release');
}

export function getTampermonkeyScriptPath(): string {
  return path.join(process.cwd(), 'extras', 'scripts', 'tampermonkey', 'pm-task-commit-links.user.js');
}

export function isDesktopInstallerFile(fileName: string, platform: DesktopPlatform): boolean {
  const lower = fileName.toLowerCase();
  const extension = platform === 'linux' ? '.appimage' : '.exe';
  return lower.endsWith(extension) && lower.includes('desktop timer');
}

export function isIdeExtensionFile(fileName: string, kind: IdeExtensionKind): boolean {
  const lower = fileName.toLowerCase();
  if (kind === 'vscode') {
    return (
      lower.endsWith('.vsix') &&
      (lower.includes('project-management-pending-tasks') ||
        lower.includes('pending-tasks') ||
        lower.includes('vscode') ||
        lower.includes('cursor'))
    );
  }
  if (kind === 'rider') {
    return (
      (lower.endsWith('.zip') || lower.endsWith('.jar')) &&
      (lower.includes('rider') || lower.includes('pendingtasks') || lower.includes('pending-tasks'))
    );
  }
  // Visual Studio VSIX — avoid claiming the VS Code package name
  if (!lower.endsWith('.vsix')) return false;
  if (lower.includes('project-management-pending-tasks') || lower.includes('vscode') || lower.includes('cursor')) {
    return false;
  }
  return (
    lower.includes('visualstudio') ||
    lower.includes('visual-studio') ||
    lower.includes('vs2022') ||
    lower.includes('projectmanagement.pendingtasks') ||
    lower.includes('pendingtasks')
  );
}

async function listReleaseCandidates(
  predicate: (fileName: string) => boolean
): Promise<ReleaseCandidate[]> {
  const releaseDir = getReleaseDir();
  if (!fs.existsSync(releaseDir)) return [];

  const entries = await fsPromises.readdir(releaseDir);
  const matched = entries.filter(predicate);
  const withStats = await Promise.all(
    matched.map(async (fileName) => {
      const absolutePath = path.join(releaseDir, fileName);
      const stats = await fsPromises.stat(absolutePath);
      if (!stats.isFile()) return null;
      return { fileName, absolutePath, mtimeMs: stats.mtimeMs };
    })
  );

  return withStats
    .filter((entry): entry is ReleaseCandidate => entry !== null)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

export async function findLatestDesktopInstaller(platform: DesktopPlatform): Promise<ReleaseCandidate | null> {
  const candidates = await listReleaseCandidates((fileName) => isDesktopInstallerFile(fileName, platform));
  return candidates[0] || null;
}

export async function findLatestIdeExtension(kind: IdeExtensionKind): Promise<ReleaseCandidate | null> {
  const candidates = await listReleaseCandidates((fileName) => isIdeExtensionFile(fileName, kind));
  return candidates[0] || null;
}

export async function getDownloadsCatalog(): Promise<{
  desktop: { win: boolean; linux: boolean };
  ide: { vscode: boolean; rider: boolean; visualstudio: boolean };
  tampermonkey: boolean;
}> {
  const [win, linux, vscode, rider, visualstudio] = await Promise.all([
    findLatestDesktopInstaller('win'),
    findLatestDesktopInstaller('linux'),
    findLatestIdeExtension('vscode'),
    findLatestIdeExtension('rider'),
    findLatestIdeExtension('visualstudio'),
  ]);

  return {
    desktop: { win: !!win, linux: !!linux },
    ide: { vscode: !!vscode, rider: !!rider, visualstudio: !!visualstudio },
    tampermonkey: fs.existsSync(getTampermonkeyScriptPath()),
  };
}
