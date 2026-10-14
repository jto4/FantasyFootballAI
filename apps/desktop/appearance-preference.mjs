import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function getAppearancePreference(path) {
  try {
    const preference = JSON.parse(await readFile(path, 'utf8'));
    return preference?.theme === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export async function setAppearancePreference(path, theme) {
  if (theme !== 'light' && theme !== 'dark') throw new TypeError('Unknown appearance.');
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify({ theme })}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
  return theme;
}
