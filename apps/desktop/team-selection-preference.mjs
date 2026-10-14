import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
export function validateTeamSelections(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length > 100 ||
    !Object.entries(value).every(
      ([league, team]) =>
        league.length > 0 &&
        league.length <= 256 &&
        typeof team === 'string' &&
        team.length > 0 &&
        team.length <= 256 &&
        !/[\u0000-\u001f]/.test(league + team),
    )
  )
    throw new TypeError('Invalid team choices.');
  return Object.fromEntries(Object.entries(value));
}
export async function getTeamSelectionPreference(path) {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 131072) return {};
    const value = JSON.parse(await readFile(path, 'utf8'));
    return value?.version === 1 ? validateTeamSelections(value.teams) : {};
  } catch {
    return {};
  }
}
export async function setTeamSelectionPreference(path, teams) {
  const safe = validateTeamSelections(teams);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify({ version: 1, teams: safe }), {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return safe;
}
