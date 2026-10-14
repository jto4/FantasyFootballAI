import type { NFLDraftProfile } from '@sidekick/core';
import { csvRecords } from './football-csv.js';

export const nflDraftPicksUrl =
  'https://github.com/nflverse/nflverse-data/releases/download/draft_picks/draft_picks.csv';

function integer(raw: string | undefined, minimum: number, maximum: number) {
  if (!raw || !/^\d+$/.test(raw) || Number(raw) < minimum || Number(raw) > maximum)
    throw new Error('Invalid NFL draft number.');
  return Number(raw);
}
function label(raw: string | undefined, maximum: number) {
  if (!raw || raw.length > maximum || /[\u0000-\u001f\u007f]/.test(raw))
    throw new Error('Invalid NFL draft text.');
  return raw;
}

/** Retain draft identity/facts only, never retrospective career totals or honors. */
export function parseNFLDraftPicks(csv: string, season: number): NFLDraftProfile[] {
  if (!Number.isInteger(season) || season < 2010 || season > 2099)
    throw new Error('Invalid NFL draft season.');
  const rows = csvRecords(csv, [
    'season',
    'round',
    'pick',
    'team',
    'gsis_id',
    'pfr_player_id',
    'pfr_player_name',
    'position',
    'college',
  ]);
  if (rows.length > 20000) throw new Error('Too many NFL draft records.');
  const seen = new Set<string>(),
    identities = new Set<string>();
  return rows.flatMap((row) => {
    const year = integer(row.season, 1980, 2099);
    if (year > season) return [];
    const round = integer(row.round, 1, year >= 2010 ? 7 : 17),
      pick = integer(row.pick, 1, 500);
    const key = `${year}:${pick}`;
    if (seen.has(key)) throw new Error('Duplicate NFL draft pick.');
    seen.add(key);
    const position = label(row.position, 12);
    if (!['QB', 'RB', 'WR', 'TE', 'K'].includes(position)) return [];
    const pfrId =
      row.pfr_player_id && row.pfr_player_id !== 'NA' ? label(row.pfr_player_id, 20) : undefined;
    if (pfrId && (pfrId.length < 4 || !/^[A-Za-z0-9]+(?:[.'][A-Za-z0-9]+)?$/.test(pfrId)))
      throw new Error('Invalid NFL draft identity.');
    const gsisId = row.gsis_id && row.gsis_id !== 'NA' ? row.gsis_id : undefined;
    if (gsisId && !/^(?:00-\d{7}|[A-Z]{3}\d{6})$/.test(gsisId))
      throw new Error('Invalid NFL draft GSIS identity.');
    const identity = `${year}:${gsisId ?? pfrId ?? `pick-${pick}`}`;
    if (identities.has(identity)) throw new Error('Duplicate NFL draftee identity.');
    identities.add(identity);
    const draftTeam = label(row.team, 8);
    if (!/^[A-Z]{2,3}$/.test(draftTeam)) throw new Error('Invalid NFL draft team.');
    const college = row.college && row.college !== 'NA' ? label(row.college, 120) : undefined;
    return [
      {
        ...(pfrId ? { pfrId } : {}),
        ...(gsisId ? { gsisId } : {}),
        name: label(row.pfr_player_name, 120),
        position,
        season: year,
        round,
        pick,
        draftTeam,
        ...(college ? { college } : {}),
      },
    ];
  });
}
