import { spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
// extras/scripts → repository root (where root package.json / node_modules live)
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function getElectronDir() {
  try {
    return dirname(require.resolve('electron/package.json', { paths: [projectRoot] }));
  } catch {
    console.error('Electron is not installed. Run: pnpm install');
    process.exit(1);
  }
}

function getPlatformBinaryName() {
  if (process.platform === 'win32') return 'electron.exe';
  if (process.platform === 'darwin') return join('Electron.app', 'Contents', 'MacOS', 'Electron');
  return 'electron';
}

function isElectronReady(electronDir) {
  const binaryName = getPlatformBinaryName();
  const pathFile = join(electronDir, 'path.txt');
  const binaryPath = join(electronDir, 'dist', binaryName);

  if (!existsSync(pathFile) || !existsSync(binaryPath)) {
    return false;
  }

  const configuredPath = readFileSync(pathFile, 'utf8').trim();
  return configuredPath === binaryName || configuredPath.replace(/\\/g, '/') === binaryName.replace(/\\/g, '/');
}

function runInstallScript(electronDir) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;

  const result = spawnSync(process.execPath, [join(electronDir, 'install.js')], {
    cwd: electronDir,
    stdio: 'inherit',
    env,
  });

  return result.status === 0 && isElectronReady(electronDir);
}

async function downloadAndExtract(electronDir) {
  const { downloadArtifact } = require('@electron/get');
  const extract = require('extract-zip');
  const { version } = require(join(electronDir, 'package.json'));

  const zipPath = await downloadArtifact({
    version,
    artifactName: 'electron',
    platform: process.platform,
    arch: process.arch,
    force: true,
  });

  const distDir = join(electronDir, 'dist');
  rmSync(distDir, { recursive: true, force: true });
  mkdirSync(distDir, { recursive: true });
  await extract(zipPath, { dir: distDir });

  const binaryName = getPlatformBinaryName();
  await new Promise((resolve, reject) => {
    const stream = createWriteStream(join(electronDir, 'path.txt'));
    stream.on('error', reject);
    stream.on('finish', resolve);
    stream.end(binaryName);
  });
}

async function main() {
  const electronDir = getElectronDir();

  if (isElectronReady(electronDir)) {
    return;
  }

  console.log('Electron binary missing. Installing...');

  if (runInstallScript(electronDir)) {
    console.log('Electron installed successfully.');
    return;
  }

  try {
    await downloadAndExtract(electronDir);
  } catch (error) {
    console.error('Failed to install Electron:', error instanceof Error ? error.message : error);
    process.exit(1);
  }

  if (!isElectronReady(electronDir)) {
    console.error('Electron install completed but binary is still missing.');
    process.exit(1);
  }

  console.log('Electron installed successfully.');
}

await main();
