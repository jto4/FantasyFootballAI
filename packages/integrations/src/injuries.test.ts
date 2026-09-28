import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LeagueConnection } from '@sidekick/core';
import {
  fetchNFLInjuryReports,
  matchRosterInjuries,
  NFLInjuryReportCache,
  nflInjuryReportUrl,
  parseNFLInjuryReports,
} from './injuries.js';

const csv = [
  'season,season_type,game_type,team,week,gsis_id,position,full_name,first_name,last_name,report_primary_injury,report_secondary_injury,report_status,practice_primary_injury,practice_secondary_injury,practice_status',
  '2026,REG,REG,BUF,4,00-0000001,RB,James Cook,James,Cook,Toe,,Questionable,Toe,,Limited Participation in Practice',
  '2026,REG,REG,JAC,4,00-0000002,QB,Trevor Lawrence,Trevor,Lawrence,"","","","","",Full Participation in Practice',
  '2026,REG,REG,BUF,3,00-0000001,RB,James Cook,James,Cook,Toe,,Out,Toe,,Did Not Participate In Practice',
  '2025,REG,REG,BUF,4,00-0000001,RB,James Cook,James,Cook,Toe,,Out,Toe,,Did Not Participate In Practice',
  '2026,REG,REG,BUF,4,00-0000003,WR,"A.J. Brown",A.J.,Brown,"Ankle, foot",,Doubtful,Ankle,,Limited Participation in Practice',
].join('\n');

afterEach(() => vi.unstubAllGlobals());

describe('NFL injury report source', () => {
  it('parses bounded, season-scoped rows while preserving quoted CSV values', () => {
    expect(parseNFLInjuryReports(csv, 2026)).toEqual([
      expect.objectContaining({
        week: 4,
        team: 'BUF',
        fullName: 'James Cook',
        reportStatus: 'Questionable',
        reportInjury: 'Toe',
        practiceStatus: 'Limited Participation in Practice',
      }),
      expect.objectContaining({
        week: 4,
        team: 'JAC',
        fullName: 'Trevor Lawrence',
        practiceStatus: 'Full Participation in Practice',
      }),
      expect.objectContaining({ week: 3, fullName: 'James Cook', reportStatus: 'Out' }),
      expect.objectContaining({
        fullName: 'A.J. Brown',
        reportInjury: 'Ankle, foot',
        reportStatus: 'Doubtful',
      }),
    ]);
  });

  it('fetches the season release with a timeout and rejects unsupported seasons', async () => {
    const fetcher = vi.fn(async () => new Response(csv, { status: 200 }));
    const reports = await fetchNFLInjuryReports(2026, fetcher as typeof fetch);
    expect(reports).toHaveLength(4);
    expect(fetcher).toHaveBeenCalledWith(
      nflInjuryReportUrl(2026),
      expect.objectContaining({
        redirect: 'follow',
        headers: { accept: 'text/csv, text/plain;q=0.9' },
      }),
    );
    await expect(fetchNFLInjuryReports(2008, fetcher as typeof fetch)).rejects.toThrow(
      'between 2009 and 2099',
    );
    expect(nflInjuryReportUrl(2026)).toBe(
      'https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_2026.csv',
    );
  });

  it('matches only current-week roster players by exact normalized name and NFL team', () => {
    const league: LeagueConnection = {
      id: 'league-1',
      platform: 'sleeper',
      name: 'League',
      displayName: 'League',
      season: 2026,
      teamCount: 2,
      scoring: {},
      settings: { currentWeek: 4 },
      teams: [
        {
          id: 'roster-1',
          name: 'First team',
          roster: [
            { id: '1', name: 'James Cook', position: 'RB', nflTeam: 'BUF' },
            { id: '2', name: 'Trevor Lawrence', position: 'QB', nflTeam: 'JAX' },
            { id: '3', name: 'A.J. Brown', position: 'WR', nflTeam: 'PHI' },
          ],
        },
      ],
      connectedAt: '2026-01-01T00:00:00.000Z',
    };

    expect(matchRosterInjuries(league, parseNFLInjuryReports(csv, 2026), 4)).toEqual([
      expect.objectContaining({
        playerName: 'James Cook',
        team: 'BUF',
        reportStatus: 'Questionable',
        practiceStatus: 'Limited Participation in Practice',
      }),
    ]);
  });

  it('ignores healthy rest-day labels and rows without a meaningful availability signal', () => {
    const restDayCsv = csv.replace(
      '2026,REG,REG,JAC,4,00-0000002,QB,Trevor Lawrence,Trevor,Lawrence,"","","","","",Full Participation in Practice',
      '2026,REG,REG,JAC,4,00-0000002,QB,Trevor Lawrence,Trevor,Lawrence,"","","","Not injury related - resting player","",Full Participation in Practice',
    );
    const league: LeagueConnection = {
      id: 'league-1',
      platform: 'sleeper',
      name: 'League',
      displayName: 'League',
      season: 2026,
      teamCount: 1,
      scoring: {},
      settings: {},
      teams: [
        {
          id: 'r1',
          name: 'Team',
          roster: [{ id: '2', name: 'Trevor Lawrence', position: 'QB', nflTeam: 'JAX' }],
        },
      ],
      connectedAt: '2026-01-01T00:00:00.000Z',
    };

    const lawrence = parseNFLInjuryReports(restDayCsv, 2026).find(
      (row) => row.fullName === 'Trevor Lawrence',
    );
    expect(lawrence?.practiceInjury).toBe('');
    expect(matchRosterInjuries(league, [lawrence!], 4)).toEqual([]);
  });

  it('coalesces concurrent season refreshes and caches successful results', async () => {
    let now = Date.UTC(2026, 8, 1);
    let resolve!: (rows: Awaited<ReturnType<typeof fetchNFLInjuryReports>>) => void;
    const load = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<typeof fetchNFLInjuryReports>>>((done) => {
          resolve = done;
        }),
    );
    const cache = new NFLInjuryReportCache(load, () => now, 60_000);
    const first = cache.get(2026);
    const second = cache.get(2026);
    await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
    resolve(parseNFLInjuryReports(csv, 2026));
    const [one, two] = await Promise.all([first, second]);
    expect(load).toHaveBeenCalledOnce();
    expect(one).toEqual(two);
    expect(one.retrievedAt).toBe(new Date(now).toISOString());
    await cache.get(2026);
    expect(load).toHaveBeenCalledOnce();
    now += 60_001;
    const refresh = cache.get(2026);
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    resolve(parseNFLInjuryReports(csv, 2026));
    await refresh;
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('rejects malformed CSV and non-success provider responses', async () => {
    expect(() => parseNFLInjuryReports('wrong,columns\n1,2', 2026)).toThrow(
      'unexpected CSV schema',
    );
    const fetcher = vi.fn(async () => new Response('unavailable', { status: 503 }));
    await expect(fetchNFLInjuryReports(2026, fetcher as typeof fetch)).rejects.toThrow('(503)');
  });
});
