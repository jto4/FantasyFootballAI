import type { Platform } from './index.js';

/** Accept only league links on the selected provider's own hosts; never fetch pasted URLs. */
export function parseLeagueInput(
  platform: Platform,
  input: string,
): { leagueId: string; season?: number } {
  const value = input.trim();
  if (!value || value.length > 2048 || /[\u0000-\u001f\u007f]/.test(value))
    throw new Error('Enter a league ID or a supported league URL.');
  if (!/^https?:\/\//i.test(value)) {
    if (value.length > 128 || /[/?#]/.test(value))
      throw new Error('Enter a league ID or the complete HTTPS league URL.');
    return { leagueId: value };
  }
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port)
    throw new Error('Use an HTTPS league link without credentials or a custom port.');
  if (
    platform === 'sleeper' &&
    ['sleeper.com', 'sleeper.app', 'app.sleeper.com'].includes(url.hostname)
  ) {
    const id = /^\/(?:leagues?|football)\/(\d{1,128})(?:\/|$)/.exec(url.pathname)?.[1];
    if (id) return { leagueId: id };
  }
  if (
    platform === 'espn' &&
    url.hostname === 'fantasy.espn.com' &&
    url.pathname.startsWith('/football/')
  ) {
    const id = url.searchParams.get('leagueId');
    const season = url.searchParams.get('seasonId');
    if (id && /^\d{1,128}$/.test(id)) {
      if (season && !/^20\d\d$/.test(season))
        throw new Error('The ESPN link has an invalid season.');
      return { leagueId: id, ...(season ? { season: Number(season) } : {}) };
    }
  }
  if (platform === 'yahoo' && url.hostname === 'football.fantasysports.yahoo.com') {
    const id = /^\/f1\/(\d{1,128})(?:\/|$)/.exec(url.pathname)?.[1];
    if (id) return { leagueId: id };
  }
  throw new Error('Use a league URL from the selected fantasy platform or paste its league ID.');
}
