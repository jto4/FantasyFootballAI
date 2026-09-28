import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
} from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { constants } from 'node:fs';

const execFileAsync = promisify(execFile);

/** Resolve persisted and explicitly supplied data locations without consulting the process cwd. */
export function resolveDataDirectory({ environmentOverride, savedDirectory, defaultDirectory }) {
  const selected = environmentOverride || savedDirectory || defaultDirectory;
  if (typeof selected !== 'string' || !selected.trim() || !isAbsolute(selected)) {
    throw new Error('The local data directory must be an absolute path.');
  }
  return resolve(selected);
}

export function parseSavedDataDirectory(contents) {
  try {
    const value = JSON.parse(contents);
    return typeof value?.directory === 'string' && isAbsolute(value.directory)
      ? resolve(value.directory)
      : undefined;
  } catch {
    return undefined;
  }
}

/** Copy private local data with a same-volume staging directory, publishing it only when complete. */
export async function copyLocalDirectory(
  source,
  destination,
  { platform = process.platform, runCommand = execFileAsync } = {},
) {
  const details = await lstat(source).catch((error) => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  });
  if (!details) return false;
  if (!details.isDirectory() || details.isSymbolicLink())
    throw new Error('Local data source must be a directory.');
  const sourcePath = await realpath(source);
  const requestedDestination = resolve(destination);
  const destinationEntry = await lstat(requestedDestination).catch((error) => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  });
  if (destinationEntry)
    throw new Error('The destination folder already exists. Choose a new folder for this copy.');
  const destinationPath = await canonicalizePath(requestedDestination);
  if (isSameOrInside(sourcePath, destinationPath))
    throw new Error(
      'The destination cannot be inside the source data folder. Choose another folder.',
    );
  const parent = dirname(destinationPath);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const existingDestination = await lstat(destinationPath).catch((error) => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  });
  if (existingDestination)
    throw new Error('The destination folder already exists. Choose a new folder for this copy.');
  const staged = `${destinationPath}.copy-${randomUUID()}`;
  try {
    await mkdir(staged, { mode: 0o700 });
    if (platform === 'win32') await restrictWindowsAcl(staged, runCommand);
    await copyPrivateContents(source, staged);
    await rename(staged, destinationPath);
    return true;
  } catch (error) {
    await rm(staged, { recursive: true, force: true });
    throw error;
  }
}

async function canonicalizePath(path) {
  let current = resolve(path);
  const missingParts = [];
  for (;;) {
    try {
      return resolve(await realpath(current), ...missingParts.reverse());
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
      const parent = dirname(current);
      if (parent === current) throw error;
      missingParts.push(basename(current));
      current = parent;
    }
  }
}

function isSameOrInside(source, destination) {
  const pathFromSource = relative(source, destination);
  return (
    pathFromSource === '' ||
    (!isAbsolute(pathFromSource) &&
      pathFromSource !== '..' &&
      !pathFromSource.startsWith(`..${sep}`))
  );
}

async function restrictWindowsAcl(directory, runCommand) {
  const { stdout } = await runCommand('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    '[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value',
  ]);
  const sid = stdout.trim();
  if (!/^S-1-(?:\d+-){1,14}\d+$/.test(sid))
    throw new Error(
      'Could not determine the current Windows account for private data-folder access.',
    );
  await runCommand('icacls.exe', [directory, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`]);
}

async function copyPrivateContents(source, destination) {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const sourcePath = join(source, entry.name);
    const destinationPath = join(destination, entry.name);
    const details = await lstat(sourcePath);
    if (details.isSymbolicLink())
      throw new Error(
        'Local data folders cannot contain symbolic links. Remove the link and retry.',
      );
    if (details.isDirectory()) {
      await mkdir(destinationPath, { mode: 0o700 });
      await copyPrivateContents(sourcePath, destinationPath);
    } else if (details.isFile()) {
      // Do not clobber another file if two source names collapse on the destination filesystem.
      await copyFile(sourcePath, destinationPath, constants.COPYFILE_EXCL);
      await chmod(destinationPath, 0o600);
    } else {
      throw new Error('Local data folders can contain only regular files and directories.');
    }
  }
}

export async function isDataDirectoryActive(dataDirectory, request = fetch) {
  try {
    const portText = (await readFile(join(dataDirectory, 'service-port'), 'utf8')).trim();
    if (!/^\d{1,5}$/.test(portText)) return false;
    const port = Number(portText);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) return false;
    const response = await request(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(1_000),
    });
    if (!response.ok) return false;
    const health = await response.json();
    return (
      Boolean(health) &&
      typeof health === 'object' &&
      !Array.isArray(health) &&
      health.status === 'ok' &&
      health.localOnly === true
    );
  } catch {
    return false;
  }
}
