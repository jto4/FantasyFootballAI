import { validateTeamTotalStats, totalSignalTeamKey, type TeamTotalStats } from '@sidekick/core';
import { csvRecords } from '../football-csv.js';
import { teamStatsUrl } from '../team-defense-data.js';
import { readBoundedText } from '../http.js';

export function parseTeamTotalSignals(csv: string, season: number): TeamTotalStats[] {
  teamStatsUrl(season);
  const required = [
    'season',
    'week',
    'season_type',
    'game_id',
    'team',
    'opponent_team',
    'attempts',
    'sacks_suffered',
    'carries',
    'passing_epa',
    'rushing_epa',
    'passing_20',
    'rushing_20',
    'passing_first_downs',
    'rushing_first_downs',
  ];
  const input = csvRecords(csv, required);
  if (input.length > 600) throw new Error('Too many team totals source rows.');
  const rows = input.flatMap((r) => {
    if (r.season !== String(season)) throw new Error('Team totals season mismatch.');
    if (r.season_type === 'POST') return [];
    if (r.season_type !== 'REG') throw new Error('Unknown team totals season type.');
    if (required.some((key) => !r[key]?.trim())) throw new Error('Missing team totals measure.');
    for (const key of ['passing_20', 'rushing_20', 'passing_first_downs', 'rushing_first_downs']) {
      const value = Number(r[key]);
      if (!Number.isInteger(value) || value < 0 || value > 120)
        throw new Error('Invalid team totals count.');
    }
    return [
      {
        season,
        week: Number(r.week),
        gameId: r.game_id!,
        team: totalSignalTeamKey(r.team!),
        opponent: totalSignalTeamKey(r.opponent_team!),
        attempts: Number(r.attempts),
        sacks: Number(r.sacks_suffered),
        carries: Number(r.carries),
        passingEpa: Number(r.passing_epa),
        rushingEpa: Number(r.rushing_epa),
        explosivePlays: Number(r.passing_20) + Number(r.rushing_20),
        firstDowns: Number(r.passing_first_downs) + Number(r.rushing_first_downs),
      },
    ];
  });
  validateTeamTotalStats(rows);
  return rows;
}

export async function loadTeamTotalSignals(season: number, fetcher: typeof fetch = fetch) {
  const url = teamStatsUrl(season),
    capturedAt = new Date().toISOString();
  const response = await fetcher(url, {
    signal: AbortSignal.timeout(15000),
    headers: { accept: 'text/csv' },
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`Team totals source failed (${response.status}).`);
  }
  const csv = await readBoundedText(response, 1000000);
  return { url, capturedAt, csv, rows: parseTeamTotalSignals(csv, season) };
}
