import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export function shouldStartHidden({ platform, argumentsList, startHidden, wasOpenedAtLogin }) {
  return (
    argumentsList.includes('--sidekick-start-hidden') ||
    (platform === 'darwin' && wasOpenedAtLogin === true && startHidden === true)
  );
}

export async function getStartHiddenPreference(path) {
  try {
    const preference = JSON.parse(await readFile(path, 'utf8'));
    return typeof preference?.startHidden === 'boolean' ? preference.startHidden : false;
  } catch {
    return false;
  }
}

/** Persist the sign-in launch preference privately and publish it atomically. */
export async function setStartHiddenPreference(path, enabled) {
  if (typeof enabled !== 'boolean') throw new TypeError('Start-hidden preference must be boolean.');
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify({ startHidden: enabled })}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
  return enabled;
}
