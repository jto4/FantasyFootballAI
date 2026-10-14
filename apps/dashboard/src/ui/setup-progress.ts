import { parseLeagueInput, type Platform } from '@sidekick/core';
type SetupProgress = {
  version: 1;
  inProgress: boolean;
  step: number;
  platform: Platform;
  season: number;
  leagueInput: string;
};
const key = 'sidekick.setupProgress';
export function readSetupProgress(): SetupProgress | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (
      value?.version === 1 &&
      typeof value.inProgress === 'boolean' &&
      Number.isInteger(value.step) &&
      value.step >= 0 &&
      value.step <= 2 &&
      ['sleeper', 'espn', 'yahoo'].includes(value.platform) &&
      Number.isInteger(value.season) &&
      value.season >= 2000 &&
      value.season <= 2100 &&
      typeof value.leagueInput === 'string' &&
      value.leagueInput.length <= 256 &&
      (value.leagueInput === '' ||
        /^\d{1,128}$/.test(value.leagueInput) ||
        (value.platform === 'yahoo' && /^\d+\.l\.\d+$/.test(value.leagueInput)))
    )
      return value;
  } catch {
    /* Setup still works when storage is unavailable or an old record is invalid. */
  }
  return undefined;
}
export function saveSetupProgress(progress: Omit<SetupProgress, 'version'>) {
  let leagueInput = '';
  // Store only a validated league ID, never arbitrary pasted URLs, session values, or credentials.
  try {
    const id = parseLeagueInput(progress.platform, progress.leagueInput).leagueId;
    if (/^\d{1,128}$/.test(id) || (progress.platform === 'yahoo' && /^\d+\.l\.\d+$/.test(id)))
      leagueInput = id;
  } catch {
    /* Incomplete input is kept only in the current form. */
  }
  try {
    localStorage.setItem(key, JSON.stringify({ ...progress, leagueInput, version: 1 }));
  } catch {
    /* Optional local progress does not block setup. */
  }
}
