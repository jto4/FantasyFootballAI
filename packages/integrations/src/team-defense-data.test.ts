import { expect, it } from 'vitest';
import {
  PublicTeamDefenseData,
  defenseStatsUrl,
  parseTeamDefenseStats,
  parseTeamDefenseTotals,
  teamStatsUrl,
} from './team-defense-data.js';
import { scoreHistoricalGame, type FootballGame } from '@sidekick/core';
import { readFileSync } from 'node:fs';
import { parseOffensiveFumbleProof } from './defense-offense-proof.js';

const asOf = '2026-10-09T12:00:00Z';
const offenseFixtures = JSON.parse(
  readFileSync(new URL('./fixtures/defense-offense-games.json', import.meta.url), 'utf8'),
) as {
  game: FootballGame;
  team: string;
  summary: unknown;
}[];
const game: FootballGame = {
  id: '2025_07_HOU_SEA',
  season: 2025,
  week: 7,
  seasonType: 'REG',
  date: '2025-10-20',
  home: 'SEA',
  away: 'HOU',
  homeScore: 27,
  awayScore: 19,
};
function vendor(team = 'SEA', stats: Record<string, number> = {}) {
  return {
    category: 'stat',
    sport: 'nfl',
    season: '2025',
    season_type: 'regular',
    week: 7,
    date: game.date,
    team,
    player_id: team,
    opponent: team === 'SEA' ? 'HOU' : 'SEA',
    player: { position: 'DEF', team },
    stats: { gp: 1, ...stats },
  };
}
const totalFields = [
  'def_sacks',
  'def_interceptions',
  'def_safeties',
  'def_fumbles_forced',
  'fumble_recovery_opp',
  'def_tds',
  'special_teams_tds',
  'fumble_recovery_tds',
  'def_punt_blocks',
  'def_pat_blocks',
  'def_fg_blocks',
];
function csv(season = 2025, fields: Record<string, number> = {}) {
  const header = [
    'season',
    'week',
    'season_type',
    'team',
    'opponent_team',
    'game_id',
    ...totalFields,
  ];
  return `${header.join(',')}\n${[season, 7, 'REG', 'SEA', 'HOU', game.id, ...totalFields.map((k) => fields[k] ?? 0)].join(',')}\n`;
}
it('uses published fantasy points allowed instead of the final score, retaining PAT after a defensive TD', () => {
  const [sea, hou] = parseTeamDefenseStats(
    [
      vendor('SEA', { pts_allow: 13, yds_allow: 254, sack: 3, int: 1 }),
      vendor('HOU', { pts_allow: 27, yds_allow: 316, def_td: 1, fum_rec: 2 }),
    ],
    2025,
    7,
    [game],
    [],
    asOf,
  );
  expect(sea!.stats.dst_points_allowed).toBe(13);
  expect(hou!.stats.dst_points_allowed).toBe(27);
  expect(
    scoreHistoricalGame(
      { platform: 'sleeper', scoring: { pts_allow_7_13: 4, pts_allow_14_20: 1 } },
      sea!,
    ).points,
  ).toBe(4);
  expect(hou!.stats.dst_touchdowns).toBe(1);
  expect(sea!.gameId).toBe(game.id);
  expect(sea!.sourceIds).toEqual(['dst-2025-7']);
});
it('proves sparse zero events from independent totals without copying ambiguous positive values', () => {
  const totals = parseTeamDefenseTotals(csv(2025, { fumble_recovery_opp: 1 }), 2025);
  const row = parseTeamDefenseStats(
    [vendor('SEA', { pts_allow: 0, yds_allow: 190, def_st_fum_rec: 1 })],
    2025,
    7,
    [game],
    totals,
    asOf,
  )[0]!;
  expect(row.stats.dst_fumble_recoveries).toBe(0);
  expect(row.stats.dst_special_teams_fumble_recoveries).toBe(1);
  expect(row.stats.dst_safeties).toBe(0);
  expect(row.stats.dst_touchdowns).toBe(0);
  expect(row.sourceIds).toEqual(['dst-2025-7', 'dst-totals-2025']);
  const unknown = parseTeamDefenseStats(
    [vendor('SEA', { pts_allow: 13 })],
    2025,
    7,
    [game],
    totals,
    asOf,
  )[0]!;
  expect(unknown.stats.dst_fumble_recoveries).toBeUndefined();
  expect(unknown.stats.dst_special_teams_fumble_recoveries).toBeUndefined();
  expect(
    scoreHistoricalGame({ platform: 'sleeper', scoring: { fum_rec: 2 } }, unknown).points,
  ).toBeUndefined();
});
it('keeps fumble touchdowns unknown when aggregate counts cannot separate offense, defense and returns', () => {
  const row = parseTeamDefenseStats(
    [vendor()],
    2025,
    7,
    [game],
    parseTeamDefenseTotals(csv(2025, { fumble_recovery_tds: 1 }), 2025),
    asOf,
  )[0]!;
  expect(row.stats.dst_touchdowns).toBeUndefined();
  expect(row.stats.dst_special_teams_touchdowns).toBeUndefined();
});
it('requires all three explicit block totals to prove zero and retains source-specific counts', () => {
  const totals = parseTeamDefenseTotals(csv(), 2025);
  delete totals[0]!.stats.def_pat_blocks;
  const row = parseTeamDefenseStats([vendor()], 2025, 7, [game], totals, asOf)[0]!;
  expect(row.stats.dst_blocked_kicks).toBeUndefined();
  expect(
    parseTeamDefenseStats([vendor('SEA', { blk_kick: 1 })], 2025, 7, [game], [], asOf)[0]!.stats
      .dst_blocked_kicks,
  ).toBe(1);
});
it('accepts a shutout proof but rejects contradictory, negative, fractional and oversized stats', () => {
  expect(
    parseTeamDefenseStats([vendor('SEA', { pts_allow_0: 1 })], 2025, 7, [game], [], asOf)[0]!.stats
      .dst_points_allowed,
  ).toBe(0);
  for (const stats of [
    { pts_allow: 13, pts_allow_0: 1 },
    { sack: -1 },
    { sack: 0.5 },
    { yds_allow: 2001 },
    { pts_allow: 151 },
    { gp: 2 },
  ])
    expect(() =>
      parseTeamDefenseStats([vendor('SEA', stats)], 2025, 7, [game], [], asOf),
    ).toThrow();
});
it('rejects conflicting identities, duplicates and incorrect scope; excludes byes, incomplete and future games', () => {
  for (const patch of [
    { season: '2024' },
    { week: 8 },
    { team: 'XXX' },
    { player_id: 'HOU' },
    { player: { team: 'SEA', position: 'WR' } },
    { date: '2025-02-30' },
    { sport: 'nba' },
    { season_type: 'post' },
  ])
    expect(() =>
      parseTeamDefenseStats([{ ...vendor(), ...patch }], 2025, 7, [game], [], asOf),
    ).toThrow();
  expect(() => parseTeamDefenseStats([vendor(), vendor()], 2025, 7, [game], [], asOf)).toThrow();
  expect(parseTeamDefenseStats([{ ...vendor(), stats: {} }], 2025, 7, [game], [], asOf)).toEqual(
    [],
  );
  const incomplete = { ...game };
  delete incomplete.awayScore;
  expect(parseTeamDefenseStats([vendor()], 2025, 7, [incomplete], [], asOf)).toEqual([]);
  expect(parseTeamDefenseStats([vendor()], 2025, 7, [game, game], [], asOf)).toEqual([]);
  expect(parseTeamDefenseStats([vendor()], 2025, 7, [game], [], game.date + 'T23:00:00Z')).toEqual(
    [],
  );
});
it('rejects corrupt, mismatched and duplicate team totals without converting empty fields to zero', () => {
  expect(() => parseTeamDefenseTotals(csv(2024), 2025)).toThrow();
  expect(() => parseTeamDefenseTotals(csv().replace(',0,0,0,', ',-1,0,0,'), 2025)).toThrow();
  expect(() => parseTeamDefenseTotals(csv() + csv().split('\n')[1] + '\n', 2025)).toThrow();
  const missing = csv().replace(',0,0,0,', ',,0,0,');
  expect(parseTeamDefenseTotals(missing, 2025)[0]!.stats.def_sacks).toBeUndefined();
});
it('bounds URLs, response bytes and weekly read concurrency while coalescing resource loads', async () => {
  for (const year of [2009, 2100, 2025.5]) expect(() => teamStatsUrl(year)).toThrow();
  for (const week of [0, 19, 1.5]) expect(() => defenseStatsUrl(2025, week)).toThrow();
  let active = 0,
    maximum = 0;
  const urls: string[] = [];
  const many = Array.from({ length: 10 }, (_, i) => ({
    ...game,
    id: 'g' + i,
    week: i + 1,
    date: `2025-10-${String(i + 1).padStart(2, '0')}`,
  }));
  const fetcher: typeof fetch = async (url, init) => {
    expect(init?.signal).toBeDefined();
    expect(JSON.stringify(init?.headers)).not.toContain('authorization');
    urls.push(String(url));
    if (String(url).includes('stats_team')) return new Response(csv());
    active++;
    maximum = Math.max(maximum, active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
    return Response.json([]);
  };
  const adapter = new PublicTeamDefenseData(fetcher, () => Date.parse(asOf));
  await Promise.all([adapter.get(2025, many), adapter.get(2025, many)]);
  expect(maximum).toBeLessThanOrEqual(4);
  expect(urls).toHaveLength(11);
  expect(urls.filter((u) => u.includes('position[]=DEF'))).toHaveLength(10);
  const tooLarge = new PublicTeamDefenseData(
    async () => new Response('x', { headers: { 'content-length': '256001' } }),
    () => Date.parse(asOf),
  );
  const result = await tooLarge.get(2025, [game]);
  expect(result.players).toEqual([]);
  expect(result.refreshFailed).toBe(true);
});
it('preserves original raw evidence dates after a failed refresh, retries after backoff, and isolates resources', async () => {
  let now = Date.parse(asOf),
    fail = false,
    calls = 0;
  const fetcher: typeof fetch = async (url) => {
    calls++;
    if (fail) return new Response('', { status: 503 });
    return String(url).includes('stats_team')
      ? new Response(csv())
      : Response.json([vendor('SEA', { pts_allow: 13, yds_allow: 254 })]);
  };
  const adapter = new PublicTeamDefenseData(fetcher, () => now);
  const first = await adapter.get(2025, [game]);
  now += 7 * 3600000;
  fail = true;
  const stale = await adapter.get(2025, [game]);
  expect(stale.players).toEqual(first.players);
  expect(stale.sources).toEqual(first.sources);
  expect(stale.refreshFailed).toBe(true);
  expect(stale.warnings.join(' ')).toContain('original date');
  const before = calls;
  await adapter.get(2025, [game]);
  expect(calls).toBe(before);
  now += 6 * 60000;
  fail = false;
  const fresh = await adapter.get(2025, [game]);
  expect(fresh.refreshFailed).toBe(false);
  expect(fresh.sources.every((s) => s.retrievedAt === new Date(now).toISOString())).toBe(true);
});
it('a malformed refresh retains valid old raw rows and source dates', async () => {
  let now = Date.parse(asOf),
    broken = false;
  const adapter = new PublicTeamDefenseData(
    async (url) =>
      String(url).includes('stats_team')
        ? new Response(csv())
        : Response.json([vendor('SEA', { sack: broken ? -1 : 3, pts_allow: 13 })]),
    () => now,
  );
  const first = await adapter.get(2025, [game]);
  now += 7 * 3600000;
  broken = true;
  const next = await adapter.get(2025, [game]);
  expect(next.players[0]!.stats.dst_sacks).toBe(3);
  expect(next.sources.find((s) => s.id === 'dst-2025-7')!.retrievedAt).toBe(
    first.sources.find((s) => s.id === 'dst-2025-7')!.retrievedAt,
  );
});

it('proves touchdown partitions only when the known unit exhausts every separate fumble touchdown', () => {
  const totals = parseTeamDefenseTotals(csv(2025, { fumble_recovery_tds: 1 }), 2025);
  const defense = parseTeamDefenseStats(
    [vendor('SEA', { def_td: 1 })],
    2025,
    7,
    [game],
    totals,
    asOf,
  )[0]!;
  expect(defense.stats.dst_special_teams_touchdowns).toBe(0);
  const special = parseTeamDefenseStats(
    [vendor('SEA', { def_st_td: 1 })],
    2025,
    7,
    [game],
    totals,
    asOf,
  )[0]!;
  expect(special.stats.dst_touchdowns).toBe(0);
  totals[0]!.stats.def_tds = 1;
  const unknown = parseTeamDefenseStats(
    [vendor('SEA', { def_td: 1 })],
    2025,
    7,
    [game],
    totals,
    asOf,
  )[0]!;
  expect(unknown.stats.dst_special_teams_touchdowns).toBeUndefined();
  const conflict = parseTeamDefenseStats(
    [vendor('SEA', { fum_rec: 1, ff: 1 })],
    2025,
    7,
    [game],
    parseTeamDefenseTotals(csv(), 2025),
    asOf,
  )[0]!;
  expect(conflict.stats.dst_special_teams_fumble_recoveries).toBeUndefined();
  expect(conflict.stats.dst_special_teams_forced_fumbles).toBeUndefined();
});

it('limits concurrent remote reads globally across different season requests', async () => {
  let active = 0,
    maximum = 0;
  const fetcher: typeof fetch = async (url) => {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
    const season = Number(String(url).match(/(?:week_|nfl\/)(\d{4})/)![1]);
    return String(url).includes('stats_team') ? new Response(csv(season)) : Response.json([]);
  };
  const adapter = new PublicTeamDefenseData(fetcher, () => Date.parse(asOf));
  const games = Array.from({ length: 10 }, (_, i) => ({
    ...game,
    id: 'g' + i,
    week: i + 1,
    date: `2025-10-${String(i + 1).padStart(2, '0')}`,
  }));
  await Promise.all([
    adapter.get(2025, games),
    adapter.get(
      2024,
      games.map((g) => ({ ...g, season: 2024, date: g.date.replace('2025', '2024') })),
    ),
  ]);
  expect(maximum).toBeLessThanOrEqual(4);
});

it('does not use an independent touchdown total contradicted by a published positive component', () => {
  const totals = parseTeamDefenseTotals(csv(), 2025);
  const row = parseTeamDefenseStats(
    [vendor('SEA', { def_td: 1 })],
    2025,
    7,
    [game],
    totals,
    asOf,
  )[0]!;
  expect(row.stats.dst_touchdowns).toBe(1);
  expect(row.stats.dst_special_teams_touchdowns).toBeUndefined();
});

function offenseInputs(f = offenseFixtures[0]!) {
  const totals = parseTeamDefenseTotals(csv(2025, { fumble_recovery_tds: 1 }), 2025);
  const t = totals[0]!;
  Object.assign(t, { team: f.team, opponent: f.game.away, gameId: f.game.id, week: f.game.week });
  const raw = {
    ...vendor(f.team, { pts_allow: f.game.awayScore!, yds_allow: 250 }),
    season: String(f.game.season),
    week: f.game.week,
    date: f.game.date,
    opponent: f.game.away,
  };
  return { totals, raw };
}

it('scores all five formerly unknown games only after the independent fumble total is exhausted by offensive plays', () => {
  for (const f of offenseFixtures) {
    const { totals, raw } = offenseInputs(f);
    const opponent = f.team === f.game.home ? f.game.away : f.game.home;
    totals[0]!.opponent = opponent;
    raw.opponent = opponent;
    const proofs = parseOffensiveFumbleProof(f.summary, f.game);
    const unknown = parseTeamDefenseStats(
      [raw],
      f.game.season,
      f.game.week,
      [f.game],
      totals,
      asOf,
    )[0]!;
    expect(unknown.stats.dst_touchdowns).toBeUndefined();
    const row = parseTeamDefenseStats(
      [raw],
      f.game.season,
      f.game.week,
      [f.game],
      totals,
      asOf,
      proofs,
    )[0]!;
    expect(row.stats.dst_touchdowns).toBe(0);
    expect(row.stats.dst_special_teams_touchdowns).toBe(0);
    expect(row.sourceIds).toEqual([
      `dst-${f.game.season}-${f.game.week}`,
      `dst-totals-${f.game.season}`,
      `dst-offense-${f.game.espnId}`,
    ]);
    expect(
      scoreHistoricalGame({ platform: 'sleeper', scoring: { def_td: 6, def_st_td: 6 } }, row)
        .points,
    ).toBe(0);
    totals[0]!.stats.fumble_recovery_tds = 2;
    expect(
      parseTeamDefenseStats([raw], f.game.season, f.game.week, [f.game], totals, asOf, proofs)[0]!
        .stats.dst_touchdowns,
    ).toBeUndefined();
  }
});

it('does not use offensive proofs from another game/team, duplicate proofs or contradicted vendor touchdowns', () => {
  const f = offenseFixtures[0]!,
    { totals, raw } = offenseInputs(f);
  const proof = parseOffensiveFumbleProof(f.summary, f.game)[0]!;
  for (const proofs of [
    [{ ...proof, gameId: 'other' }],
    [{ ...proof, team: 'BUF' }],
    [{ ...proof, sourceId: 'dst-offense-401000000' }],
    [proof, proof],
    [{ ...proof, touchdowns: -1 }],
  ]) {
    expect(
      parseTeamDefenseStats([raw], f.game.season, f.game.week, [f.game], totals, asOf, proofs)[0]!
        .stats.dst_touchdowns,
    ).toBeUndefined();
  }
  Object.assign(raw.stats, { def_td: 1 });
  const conflicted = parseTeamDefenseStats(
    [raw],
    f.game.season,
    f.game.week,
    [f.game],
    totals,
    asOf,
    [proof],
  )[0]!;
  expect(conflicted.stats.dst_touchdowns).toBe(1);
  expect(conflicted.stats.dst_special_teams_touchdowns).toBeUndefined();
  expect(conflicted.sourceIds).not.toContain(proof.sourceId);
});

it('fetches only unresolved positive totals and preserves summary proof dates through malformed refreshes and backoff', async () => {
  const f = offenseFixtures[0]!,
    { raw } = offenseInputs(f);
  const totalsCsv = csv(2025, { fumble_recovery_tds: 1 }).replace(
    '2025,7,REG,SEA,HOU,2025_07_HOU_SEA',
    `${f.game.season},${f.game.week},REG,${f.team},${f.game.away},${f.game.id}`,
  );
  let now = Date.parse(asOf),
    malformed = false,
    calls = 0;
  const adapter = new PublicTeamDefenseData(
    async (url) => {
      if (String(url).includes('stats_team')) return new Response(totalsCsv);
      if (String(url).includes('espn.com')) {
        calls++;
        return Response.json(malformed ? {} : f.summary);
      }
      return Response.json([raw]);
    },
    () => now,
  );
  const first = await adapter.get(f.game.season, [f.game]);
  expect(first.players[0]!.stats.dst_touchdowns).toBe(0);
  expect(calls).toBe(1);
  await adapter.get(f.game.season, [f.game]);
  expect(calls).toBe(1);
  now += 7 * 3600000;
  malformed = true;
  const stale = await adapter.get(f.game.season, [f.game]);
  expect(stale.players).toEqual(first.players);
  expect(stale.sources.find((s) => s.id.startsWith('dst-offense-'))).toEqual(
    first.sources.find((s) => s.id.startsWith('dst-offense-')),
  );
  expect(stale.refreshFailed).toBe(true);
  await adapter.get(f.game.season, [f.game]);
  expect(calls).toBe(2);
  now += 6 * 60000;
  malformed = false;
  expect((await adapter.get(f.game.season, [f.game])).refreshFailed).toBe(false);
  expect(calls).toBe(3);
});

it('withholds zeroes when summary responses exceed one megabyte instead of treating an outage as an offensive score', async () => {
  const f = offenseFixtures[0]!,
    { raw } = offenseInputs(f);
  const totalsCsv = csv(2025, { fumble_recovery_tds: 1 }).replace(
    '2025,7,REG,SEA,HOU,2025_07_HOU_SEA',
    `${f.game.season},${f.game.week},REG,${f.team},${f.game.away},${f.game.id}`,
  );
  const adapter = new PublicTeamDefenseData(
    async (url) =>
      String(url).includes('stats_team')
        ? new Response(totalsCsv)
        : String(url).includes('espn.com')
          ? new Response('x', { headers: { 'content-length': '1000001' } })
          : Response.json([raw]),
    () => Date.parse(asOf),
  );
  const result = await adapter.get(f.game.season, [f.game]);
  expect(result.players[0]!.stats.dst_touchdowns).toBeUndefined();
  expect(result.refreshFailed).toBe(true);
  expect(result.sources.find((s) => s.id.startsWith('dst-offense-'))!.status).toBe('unavailable');
});

it('bounds summary selection to twelve recent games and shares the four request permits', async () => {
  const many = Array.from({ length: 13 }, (_, i) => ({
    ...game,
    id: `g${i}`,
    week: i + 1,
    date: `2025-09-${String(i + 1).padStart(2, '0')}`,
    espnId: String(401000000 + i),
  }));
  const header = csv().split('\n')[0]!;
  const totals =
    header +
    '\n' +
    many
      .map((g) =>
        csv(2025, { fumble_recovery_tds: 1 })
          .split('\n')[1]!
          .replace('2025,7,REG,SEA,HOU,2025_07_HOU_SEA', `2025,${g.week},REG,SEA,HOU,${g.id}`),
      )
      .join('\n') +
    '\n';
  const urls: string[] = [];
  let active = 0,
    maximum = 0;
  const adapter = new PublicTeamDefenseData(
    async (url) => {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      const value = String(url);
      urls.push(value);
      if (value.includes('stats_team')) return new Response(totals);
      if (value.includes('espn.com')) return new Response('', { status: 503 });
      const week = Number(value.match(/2025\/(\d+)\?/)![1]);
      return Response.json([{ ...vendor(), week, date: many[week - 1]!.date }]);
    },
    () => Date.parse(asOf),
  );
  const result = await adapter.get(2025, many);
  const summaries = urls.filter((u) => u.includes('espn.com'));
  expect(summaries).toHaveLength(12);
  expect(summaries.some((u) => u.endsWith('401000000'))).toBe(false);
  expect(maximum).toBeLessThanOrEqual(4);
  expect(result.warnings.join(' ')).toContain('twelve most recent');
  expect(result.players.every((p) => p.stats.dst_touchdowns === undefined)).toBe(true);
});
