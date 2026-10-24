import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureDownloadCache } from './download-cache.js';
import { describe, expect, it } from 'vitest';
import { footballStatKeys, kickingStatKeys } from '@sidekick/core';
import {
  PublicFootballData,
  parseFootballGames,
  parsePlayerGameStats,
  parsePlayerMarket,
  playerStatsUrl,
  nflverseKickoff,
} from './football-data.js';

it('converts documented Eastern kickoff times with daylight saving and keeps unknown/invalid wall times unknown', () => {
  expect(nflverseKickoff('2026-10-11', '13:00')).toBe('2026-10-11T17:00:00.000Z');
  expect(nflverseKickoff('2026-12-20', '13:00')).toBe('2026-12-20T18:00:00.000Z');
  expect(nflverseKickoff('2026-10-11', '20:20')).toBe('2026-10-12T00:20:00.000Z');
  for (const [day, time] of [
    ['2026-02-30', '13:00'],
    ['2026-03-08', '02:30'],
    ['2026-11-01', '01:30'],
    ['2026-10-11', 'TBD'],
    ['2026-10-11', '24:00'],
    ['2026-10-11', 'NA'],
  ])
    expect(nflverseKickoff(day!, time)).toBeUndefined();
});

const headers = [
  'player_id',
  'player_display_name',
  'position',
  'season',
  'week',
  'season_type',
  'game_id',
  'team',
  'opponent_team',
  ...footballStatKeys,
];
const record = [
  '00-fictional',
  'Fictional Receiver',
  'WR',
  '2026',
  '1',
  'REG',
  '2026_01_MIA_BUF',
  'BUF',
  'MIA',
  ...footballStatKeys.map(() => '0'),
];
function statsCsv(values: string[] = record) {
  return `${headers.join(',')}\n${values.join(',')}\n`;
}
const draftCsv =
  'season,round,pick,team,gsis_id,pfr_player_id,pfr_player_name,position,college\n2026,1,20,BUF,00-0040000,FictRe00,Fictional Rookie,WR,Fictional College\n';
const forecasts = {
  seasonId: 2026,
  scoringPeriodId: 5,
  players: [],
  settings: {
    scoringSettings: {
      scoringItems: Object.entries({
        3: 0.04,
        4: 4,
        20: -2,
        24: 0.1,
        25: 6,
        42: 0.1,
        43: 6,
        53: 1,
        72: -2,
      }).map(([key, points]) => ({
        statId: Number(key),
        points,
        pointsOverrides: {},
        isReverseItem: false,
      })),
    },
  },
};
const gamesCsv =
  'game_id,season,week,game_type,gameday,home_team,away_team,home_score,away_score,spread_line,total_line\n2026_01_MIA_BUF,2026,1,REG,2026-09-10,BUF,MIA,24,21,3,45\nfuture,2026,2,REG,2026-09-20,BUF,MIA,,,3.5,46.5\n';
it('preserves explicit neutral venues and leaves missing venue metadata unknown', () => {
  const csv = gamesCsv
    .split('\n')
    .filter(Boolean)
    .map((line, i) => `${line},${i === 0 ? 'location' : i === 1 ? 'Neutral' : 'Home'}`)
    .join('\n');
  expect(parseFootballGames(csv).map((g) => g.neutralSite)).toEqual([true, false]);
  expect(parseFootballGames(gamesCsv)[0]!.neutralSite).toBeUndefined();
  expect(() => parseFootballGames(csv.replace('Neutral', 'Unknown'))).toThrow(
    'Invalid schedule venue',
  );
});

it('keeps optional numeric ESPN event identity separate from canonical game IDs and rejects URLs or injected identifiers', () => {
  const csv =
    gamesCsv
      .split('\n')
      .slice(0, 2)
      .map((line, index) => line + (index === 0 ? ',espn' : ',401772747'))
      .join('\n') + '\n';
  expect(parseFootballGames(csv)[0]!.espnId).toBe('401772747');
  expect(parseFootballGames(gamesCsv)[0]!.espnId).toBeUndefined();
  for (const value of ['401772747&x=1', 'https://example.test', '123'])
    expect(() => parseFootballGames(csv.replace('401772747', value))).toThrow();
});

describe('public NFL trust boundaries', () => {
  it('keeps older offensive snapshots usable without inventing kicking fields', () => {
    const indexes = headers
      .map((_, index) => index)
      .filter((index) => !(kickingStatKeys as readonly string[]).includes(headers[index]!));
    const csv = `${indexes.map((index) => headers[index]).join(',')}\n${indexes.map((index) => record[index]).join(',')}\n`;
    const row = parsePlayerGameStats(csv, 2026)[0]!;
    expect(row.stats.receiving_yards).toBe(0);
    expect(row.stats.fg_made).toBeUndefined();
    expect(row.blockedFieldGoalDistances).toBeUndefined();
    expect(row.madeFieldGoalDistances).toBeUndefined();
  });
  it('parses bounded kick distances and preserves missed-versus-blocked counts', () => {
    const values = [...record];
    values[headers.indexOf('position')] = 'K';
    for (const [key, value] of Object.entries({
      fg_att: 4,
      fg_made: 2,
      fg_blocked: 2,
      fg_made_distance: 80,
    }))
      values[headers.indexOf(key)] = String(value);
    const csv = `${headers.join(',')},fg_made_list,fg_blocked_list\n${values.join(',')},20;60,"36,44"\n`;
    const row = parsePlayerGameStats(csv, 2026)[0]!;
    expect(row.stats.fg_missed).toBe(0);
    expect(row.stats.fg_blocked).toBe(2);
    expect(row.blockedFieldGoalDistances).toEqual([36, 44]);
    expect(row.madeFieldGoalDistances).toEqual([20, 60]);
    const missing = parsePlayerGameStats(statsCsv(values), 2026)[0]!;
    expect(missing.blockedFieldGoalDistances).toBeUndefined();
    expect(missing.madeFieldGoalDistances).toBeUndefined();
    expect(parsePlayerGameStats(statsCsv(), 2026)[0]!.blockedFieldGoalDistances).toEqual([]);
  });
  it('rejects conflicting kick counts, malformed distances and mismatched lists', () => {
    for (const list of ['0', '101', '30;40', '30;garbage', '[30]', '30.5']) {
      const values = [...record];
      values[headers.indexOf('fg_att')] = '1';
      values[headers.indexOf('fg_blocked')] = '1';
      expect(() =>
        parsePlayerGameStats(
          `${headers.join(',')},fg_blocked_list\n${values.join(',')},${list}\n`,
          2026,
        ),
      ).toThrow('Kicking');
    }
    for (const count of ['0.5', '21']) {
      const values = [...record];
      values[headers.indexOf('pat_att')] = count;
      expect(() => parsePlayerGameStats(statsCsv(values), 2026)).toThrow('Kicking');
    }
    const values = [...record];
    values[headers.indexOf('fg_att')] = '1';
    expect(() => parsePlayerGameStats(statsCsv(values), 2026)).toThrow('outcomes');
    values[headers.indexOf('fg_made')] = '1';
    values[headers.indexOf('fg_made_distance')] = '40';
    expect(() =>
      parsePlayerGameStats(`${headers.join(',')},fg_made_list\n${values.join(',')},39\n`, 2026),
    ).toThrow('total');
  });
  it('accepts older snapshots without attempt/completion fields and leaves their volume unknown', () => {
    const indexes = headers
      .map((_, index) => index)
      .filter((index) => !['attempts', 'completions'].includes(headers[index]!));
    const csv = `${indexes.map((index) => headers[index]).join(',')}\n${indexes.map((index) => record[index]).join(',')}\n`;
    const row = parsePlayerGameStats(csv, 2026)[0]!;
    expect(row.stats.attempts).toBeUndefined();
    expect(row.stats.completions).toBeUndefined();
    expect(row.stats.targets).toBe(0);
  });
  it('parses actual weekly schema and keeps empty/NA stats and scores missing', () => {
    const values = [...record];
    values[headers.indexOf('targets')] = '';
    values[headers.indexOf('receptions')] = 'NA';
    const rows = parsePlayerGameStats(statsCsv(values), 2026);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.stats.targets).toBeUndefined();
    expect(rows[0]?.stats.receptions).toBeUndefined();
    expect(rows[0]?.stats.receiving_yards).toBe(0);
    const games = parseFootballGames(gamesCsv);
    expect(games[1]?.homeScore).toBeUndefined();
    expect(games[1]?.spreadLine).toBe(3.5);
    const timed = gamesCsv
      .replace('gameday,', 'gameday,gametime,')
      .replace('2026-09-10,', '2026-09-10,20:20,')
      .replace('2026-09-20,', '2026-09-20,TBD,');
    expect(parseFootballGames(timed)[0]?.kickoffAt).toBe('2026-09-11T00:20:00.000Z');
    expect(parseFootballGames(timed)[1]?.kickoffAt).toBeUndefined();
  });
  it('supports quoted names and excludes unattributed team events without joining blanks', () => {
    const values = [...record];
    values[1] = '"Fictional, Receiver"';
    expect(parsePlayerGameStats(statsCsv(values), 2026)[0]?.name).toBe('Fictional, Receiver');
    const unattributed = [...record];
    unattributed[0] = '';
    unattributed[1] = '';
    unattributed[2] = '';
    expect(parsePlayerGameStats(`${statsCsv()}${unattributed.join(',')}\n`, 2026)).toHaveLength(1);
  });
  it('rejects wrong schemas/seasons, duplicates, malformed quoting and nonfinite values', () => {
    expect(() => parsePlayerGameStats('player_id,week\n1,1', 2026)).toThrow('schema');
    expect(() => parsePlayerGameStats(statsCsv(), 2025)).toThrow('season');
    expect(() => parsePlayerGameStats(`${statsCsv()}${record.join(',')}\n`, 2026)).toThrow(
      'duplicate',
    );
    const invalid = [...record];
    invalid[1] = '"Name"suffix';
    expect(() => parsePlayerGameStats(statsCsv(invalid), 2026)).toThrow('quoting');
    invalid[1] = 'Name';
    invalid[headers.indexOf('targets')] = 'Infinity';
    expect(() => parsePlayerGameStats(statsCsv(invalid), 2026)).toThrow('numeric');
    expect(() => playerStatsUrl(2026.5)).toThrow();
    expect(() => parsePlayerMarket([{ player_id: 'a', count: -1 }], 'add')).toThrow();
    expect(() =>
      parsePlayerMarket(
        [
          { player_id: 'a', count: 1 },
          { player_id: 'a', count: 2 },
        ],
        'add',
      ),
    ).toThrow();
  });
});

it('loads bounded fixed URLs, coalesces requests, merges add/drop counts and reuses the cache', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), ...(init ? { init } : {}) });
    if (String(url).includes('leaguedefaults')) {
      const offset = JSON.parse(new Headers(init?.headers).get('x-fantasy-filter')!).players.offset;
      return Response.json({
        ...forecasts,
        players:
          offset === 0
            ? [
                {
                  id: 12345,
                  player: {
                    id: 12345,
                    active: true,
                    fullName: 'Fictional Rookie',
                    defaultPositionId: 3,
                    proTeamId: 2,
                    stats: [
                      {
                        id: '1120265',
                        externalId: '20265',
                        seasonId: 2026,
                        scoringPeriodId: 5,
                        statSourceId: 1,
                        statSplitTypeId: 1,
                        stats: { 53: 5, 42: 50 },
                        appliedTotal: 10,
                      },
                    ],
                  },
                },
              ]
            : [],
      });
    }
    if (String(url).includes('trending'))
      return Response.json([
        { player_id: 'sleeper-1', count: String(url).includes('/add?') ? 12 : 3 },
      ]);
    if (String(url).endsWith('draft_picks.csv')) return new Response(draftCsv);
    if (String(url).endsWith('games.csv')) return new Response(gamesCsv);
    if (String(url).includes('position[]=DEF')) return Response.json([]);
    if (String(url).includes('stats_team'))
      return new Response(
        'season,week,season_type,team,opponent_team,game_id,def_sacks,def_interceptions,def_safeties,def_fumbles_forced,fumble_recovery_opp,def_tds,special_teams_tds,fumble_recovery_tds,def_punt_blocks,def_pat_blocks,def_fg_blocks\n',
      );
    return new Response(
      statsCsv(
        record.map((value, index) =>
          index === 3 ? String(url).match(/week_(\d{4})\.csv$/)![1]! : value,
        ),
      ),
    );
  };
  const data = new PublicFootballData(fetcher, () => Date.parse('2026-10-07T12:00:00Z'));
  const [one, two] = await Promise.all([data.get(2026), data.get(2026)]);
  expect(one).toBe(two);
  expect(one.players).toHaveLength(3);
  // ESPN forecasts are no longer loaded; the app makes its own projections.
  expect(one.playerForecasts).toBeUndefined();
  expect(one.market).toEqual([{ sleeperId: 'sleeper-1', adds: 12, drops: 3, lookbackHours: 24 }]);
  expect(
    one.sources.every(
      (source) =>
        source.status === 'available' && source.retrievedAt === '2026-10-07T12:00:00.000Z',
    ),
  ).toBe(true);
  await data.get(2026);
  // The five ESPN forecast pages are no longer requested; the app makes its own projections.
  expect(calls).toHaveLength(9);
  expect(
    calls.every(
      ({ url }) =>
        url.startsWith('https://github.com/nflverse/') ||
        url.startsWith('https://api.sleeper.app/') ||
        url.startsWith('https://api.sleeper.com/'),
    ),
  ).toBe(true);
  expect(
    calls.every(
      ({ init }) => init?.signal && !JSON.stringify(init.headers).includes('authorization'),
    ),
  ).toBe(true);
});

it('retains original dates during outages and backs off without disguising stale data', async () => {
  let now = Date.parse('2026-10-07T12:00:00Z'),
    fail = false,
    calls = 0;
  const fetcher: typeof fetch = async (url) => {
    calls++;
    if (fail) return new Response('', { status: 503 });
    if (String(url).includes('leaguedefaults')) return Response.json(forecasts);
    if (String(url).includes('trending'))
      return Response.json([{ player_id: 'sleeper-1', count: 10 }]);
    if (String(url).endsWith('draft_picks.csv')) return new Response(draftCsv);
    if (String(url).endsWith('games.csv')) return new Response(gamesCsv);
    if (String(url).includes('position[]=DEF')) return Response.json([]);
    if (String(url).includes('stats_team'))
      return new Response(
        'season,week,season_type,team,opponent_team,game_id,def_sacks,def_interceptions,def_safeties,def_fumbles_forced,fumble_recovery_opp,def_tds,special_teams_tds,fumble_recovery_tds,def_punt_blocks,def_pat_blocks,def_fg_blocks\n',
      );
    return new Response(
      statsCsv(
        record.map((value, index) =>
          index === 3 ? String(url).match(/week_(\d{4})\.csv$/)![1]! : value,
        ),
      ),
    );
  };
  const data = new PublicFootballData(fetcher, () => now);
  const first = await data.get(2026);
  now += 7 * 60 * 60 * 1_000;
  fail = true;
  const stale = await data.get(2026);
  expect(stale.players).toEqual(first.players);
  expect(stale.draftPicks).toEqual(first.draftPicks);
  expect(stale.market).toEqual(first.market);
  expect(stale.sources.map((source) => source.retrievedAt)).toEqual(
    first.sources.map((source) => source.retrievedAt),
  );
  expect(stale.warnings.join(' ')).toContain('cached values retain their original date');
  const count = calls;
  await data.get(2026);
  expect(calls).toBe(count);
});

it('after a restart with no network, uses saved copies with their own date, warns and retries', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sidekick-football-cache-'));
  configureDownloadCache(directory);
  try {
    let now = Date.parse('2026-10-07T12:00:00Z'),
      fail = false;
    const fetcher: typeof fetch = async (url) => {
      if (fail) throw new TypeError('Failed to fetch');
      const csv = (body: string) => new Response(body, { headers: { etag: '"v1"' } });
      if (String(url).includes('trending')) return Response.json([]);
      if (String(url).endsWith('draft_picks.csv')) return csv(draftCsv);
      if (String(url).endsWith('games.csv')) return csv(gamesCsv);
      if (String(url).includes('position[]=DEF')) return Response.json([]);
      if (String(url).includes('stats_team')) return new Response('', { status: 404 });
      return csv(
        statsCsv(
          record.map((value, index) =>
            index === 3 ? String(url).match(/week_(\d{4})\.csv$/)![1]! : value,
          ),
        ),
      );
    };
    const first = await new PublicFootballData(fetcher, () => now).get(2026);
    now += 60 * 60 * 1_000;
    fail = true;
    const restarted = new PublicFootballData(fetcher, () => now);
    const offline = await restarted.get(2026);
    expect(offline.players.length).toBe(first.players.length);
    const stats = offline.sources.find((source) => source.id === 'stats-2026')!;
    expect(stats.status).toBe('available');
    expect(stats.retrievedAt).toBe(new Date(Date.parse('2026-10-07T12:00:00Z')).toISOString());
    expect(offline.warnings.join(' ')).toContain('could not refresh; using the copy saved');
    // Not treated as fresh for hours: the next request tries the network again soon.
    fail = false;
    now += 6 * 60 * 1_000;
    const recovered = await restarted.get(2026);
    expect(recovered.warnings.join(' ')).not.toContain('could not refresh; using the copy saved');
  } finally {
    configureDownloadCache(undefined);
  }
});

it('rejects oversized streamed/declared responses and reports unavailable sources without raw errors', async () => {
  const data = await new PublicFootballData(
    async () =>
      new Response('secret-provider-error', { headers: { 'content-length': '20000000' } }),
  ).get(2026);
  expect(data.sources.every((source) => source.status === 'unavailable')).toBe(true);
  expect(data.players).toEqual([]);
  expect(JSON.stringify(data)).not.toContain('secret-provider-error');
});
