import { expect, it } from 'vitest';
import type { LeagueConnection, RosterPlayer } from './domain-types.js';
import type { FootballDataSnapshot, FootballGame, PlayerGameStats } from './advice-types.js';
import { buildFootballContext } from './football-context.js';

const target = { season: 2026, week: 7, asOf: '2026-10-07T12:00:00Z' };
const player: RosterPlayer = {
  id: 'platform-wr',
  gsisId: 'gsis-wr',
  name: 'Fictional Receiver',
  position: 'WR',
  nflTeam: 'BUF',
};
const league: LeagueConnection = {
  id: 'test',
  name: 'Test',
  displayName: 'Test',
  platform: 'sleeper',
  season: 2026,
  teamCount: 2,
  teams: [],
  settings: {},
  scoring: { rec: 1, rec_yd: 0.1 },
  connectedAt: target.asOf,
};
function fixture(): FootballDataSnapshot {
  const games: FootballGame[] = [],
    players: PlayerGameStats[] = [];
  for (let week = 1; week <= 6; week++) {
    const gameId = `played-${week}`;
    games.push({
      id: gameId,
      season: 2026,
      week,
      seasonType: 'REG',
      date: `2026-09-${9 + week}`,
      home: 'BUF',
      away: 'MIA',
      homeScore: 20 + week,
      awayScore: 17,
    });
    players.push({
      playerId: 'gsis-wr',
      name: player.name,
      position: 'WR',
      team: 'BUF',
      opponent: 'MIA',
      gameId,
      season: 2026,
      week,
      seasonType: 'REG',
      stats: {
        targets: week <= 4 ? 4 : week === 5 ? 10 : 14,
        receiving_yards: 60 + week * 10,
        receptions: 5,
      },
    });
    players.push({
      playerId: 'gsis-peer',
      name: 'Fictional Teammate',
      position: 'WR',
      team: 'BUF',
      opponent: 'MIA',
      gameId,
      season: 2026,
      week,
      seasonType: 'REG',
      stats: { targets: 6, receiving_yards: 30, receptions: 3 },
    });
  }
  games.push({
    id: 'next',
    season: 2026,
    week: 7,
    seasonType: 'REG',
    date: '2026-10-11',
    home: 'BUF',
    away: 'MIA',
    totalLine: 43.5,
    spreadLine: 3,
  });
  return { season: 2026, games, players, market: [], sources: [], warnings: [] };
}
function context(data = fixture(), candidates = [player]) {
  return buildFootballContext(data, target, candidates, league);
}
function metric(suffix: string, data = fixture()) {
  return context(data)
    .players.get(player.id)!
    .metrics.find((metric) => metric.id === `${player.id}:${suffix}`);
}
it('adds descriptive kicker attempts and league-scored opponent history without applying a weather multiplier', () => {
  const data = fixture();
  data.players = data.players
    .filter((row) => row.playerId === player.gsisId)
    .map((row) => ({
      ...row,
      position: 'K',
      stats: { fg_made: 2, pat_made: 2, fg_att: row.week <= 4 ? 2 : 3, pat_att: 2 },
    }));
  const kicker = { ...player, position: 'K' };
  const result = buildFootballContext(data, target, [kicker], {
    ...league,
    scoring: { fgm: 3, xpm: 1 },
  });
  const metrics = result.players.get(player.id)!.metrics;
  expect(metrics.find((m) => m.id.endsWith(':recent-fg_att'))?.value).toBe(3);
  expect(metrics.find((m) => m.id.endsWith(':change-fg_att'))?.value).toBe(1);
  expect(metrics.find((m) => m.id.endsWith(':opponent-position-points'))?.value).toBe(8);
  expect(metrics.find((m) => m.id.endsWith(':opponent-fg_made'))?.description).toContain(
    'Not an individual projection',
  );
  expect(metrics.some((m) => /weather/.test(m.id))).toBe(false);
});

it('compares recent role with preceding current-team appearances and recorded team workload', () => {
  expect(metric('recent-targets')).toMatchObject({
    value: 12,
    sampleSize: 2,
    sourceIds: ['stats-2026', 'games'],
  });
  expect(metric('change-targets')).toMatchObject({ value: 8, sampleSize: 6 });
  expect(metric('recorded-targets-share')?.value).toBeCloseTo((100 * 24) / 36);
  expect(metric('recorded-targets-share')?.description).toContain('not snap share');
  expect(metric('history-receiving_yards')).toMatchObject({ value: 95, sampleSize: 6 });
  expect(context().players.get(player.id)?.matchup).toEqual({
    gameId: 'next',
    opponent: 'MIA',
    home: true,
    date: '2026-10-11',
  });
});

it('uses complete position totals across players rather than presenting one player projection', () => {
  expect(metric('opponent-receiving_yards')).toMatchObject({ value: 125, sampleSize: 6 });
  expect(metric('opponent-receiving_yards')?.description).toContain('Not an individual projection');
  expect(metric('opponent-receptions')).toMatchObject({ value: 8, sampleSize: 6 });
  expect(metric('opponent-position-points')).toMatchObject({ value: 20.5, sampleSize: 6 });
  expect(context().warnings.join(' ')).toContain('too small');
});

it('weights recorded NFL reference totals by defense/game and shares repeated game/team metrics', () => {
  const data = fixture();
  for (const defense of ['SEA', 'DEN', 'NYJ'])
    for (let week = 1; week <= 6; week++) {
      const gameId = `${defense}-${week}`;
      data.games.push({ ...data.games[week - 1]!, id: gameId, away: defense });
      data.players.push({
        ...data.players[0]!,
        playerId: `other-${defense}`,
        name: `Other ${defense}`,
        gameId,
        week,
        opponent: defense,
        stats: { receiving_yards: 100, receptions: 6 },
      });
    }
  const result = context(data, [
    player,
    { ...player, id: 'peer', gsisId: 'gsis-peer', name: 'Fictional Teammate' },
  ]);
  expect(
    result.metrics.find((metric) => metric.id === 'nfl-position:WR:receiving_yards'),
  ).toMatchObject({ value: 106.25, sampleSize: 24 });
  expect(
    result.players
      .get(player.id)
      ?.metrics.find((metric) => metric.id.endsWith(':opponent-vs-average'))?.value,
  ).toBe(18.75);
  expect(new Set(result.metrics.map((metric) => metric.id)).size).toBe(result.metrics.length);
  expect(result.metrics.filter((metric) => metric.id.startsWith('nfl-team:'))).toHaveLength(8);
});

it('retains missing denominators and incomplete opponent samples instead of inventing zeroes', () => {
  const data = fixture();
  delete data.players.at(-1)!.stats.targets;
  expect(metric('recorded-targets-share', data)).toBeUndefined();
  expect(context(data).players.get(player.id)?.warnings.join(' ')).toContain(
    'totals are incomplete',
  );
  for (const row of data.players.filter((row) => row.playerId === 'gsis-peer' && row.week <= 3))
    delete row.stats.receiving_yards;
  expect(metric('opponent-receiving_yards', data)).toBeUndefined();
  expect(metric('opponent-position-points', data)).toBeUndefined();
  expect(metric('opponent-receptions', data)?.sampleSize).toBe(6);
});

it('does not count duplicate player-game records as extra appearances or valid position totals', () => {
  const data = fixture();
  data.players.push(structuredClone(data.players.at(-2)!));
  expect(metric('history-receiving_yards', data)).toMatchObject({ value: 90, sampleSize: 5 });
  expect(metric('opponent-receiving_yards', data)).toMatchObject({ value: 120, sampleSize: 5 });
  expect(metric('opponent-position-points', data)?.sampleSize).toBe(5);
  expect(context(data).players.get(player.id)?.warnings.join(' ')).toContain(
    'Duplicate player-game',
  );
});

it('refuses ambiguous player history unless the GSIS identity resolves it', () => {
  const data = fixture();
  data.players.push(
    ...data.players
      .filter((row) => row.playerId === player.gsisId)
      .map((row) => ({ ...row, playerId: 'twin' })),
  );
  const withoutId = { ...player };
  delete withoutId.gsisId;
  const unknown = context(data, [withoutId]).players.get(player.id)!;
  expect(unknown.metrics.some((metric) => metric.id.includes(':recent-'))).toBe(false);
  expect(unknown.warnings.join(' ')).toContain('Ambiguous NFL identity');
  expect(
    context(data)
      .players.get(player.id)
      ?.metrics.find((metric) => metric.id.endsWith(':recent-targets'))?.value,
  ).toBe(12);
});

it('excludes old, future, target-week, postseason and mismatched schedule records', () => {
  const data = fixture();
  const additions: Partial<FootballGame>[] = [
    { id: 'old', season: 2024 },
    { id: 'future-season', season: 2027 },
    { id: 'target-week', week: 7 },
    { id: 'future-date', date: '2026-10-08' },
    { id: 'post', seasonType: 'POST' },
    { id: 'wrong-team', home: 'SEA' },
  ];
  for (const extra of additions) {
    const game = { ...data.games[0]!, ...extra };
    data.games.push(game);
    data.players.push({
      ...data.players[0]!,
      gameId: game.id,
      season: game.season,
      week: game.week,
      stats: { receiving_yards: 9999, receptions: 99, targets: 999 },
    });
    if (game.id === 'target-week') {
      game.home = 'SEA';
      game.away = 'NYJ';
      data.players.at(-1)!.team = 'SEA';
      data.players.at(-1)!.opponent = 'NYJ';
    }
  }
  expect(metric('history-receiving_yards', data)).toMatchObject({ value: 95, sampleSize: 6 });
  expect(metric('opponent-receiving_yards', data)).toMatchObject({ value: 125, sampleSize: 6 });
  expect(
    context(data).metrics.find((metric) => metric.id === 'nfl-team:2026:BUF:points-for')?.value,
  ).toBe(23.5);
});

it('normalizes team aliases while current-team workload excludes prior-team games', () => {
  const data = fixture();
  for (const game of data.games) game.home = 'LA';
  for (const row of data.players) row.team = 'LAR';
  expect(context(data, [{ ...player, nflTeam: 'LAR' }]).players.get(player.id)?.matchup?.home).toBe(
    true,
  );
  const switched = fixture();
  for (const row of switched.players.filter(
    (row) => row.playerId === player.gsisId && row.week < 5,
  )) {
    row.team = 'MIA';
    row.opponent = 'BUF';
  }
  expect(metric('recent-targets', switched)?.value).toBe(12);
  expect(metric('change-targets', switched)).toBeUndefined();
  expect(context(switched).players.get(player.id)?.warnings.join(' ')).toContain('spans teams');
});

it('reports pregame team scores and reference lines without treating them as current odds or forecasts', () => {
  const metrics = context().metrics;
  expect(metrics.find((metric) => metric.id === 'nfl-team:2026:BUF:margin')).toMatchObject({
    value: 6.5,
    sampleSize: 6,
  });
  expect(metrics.find((metric) => metric.id === 'nfl-game:next:spreadLine')).toMatchObject({
    value: 3,
    sourceIds: ['games'],
  });
  expect(metrics.find((metric) => metric.id === 'nfl-game:next:spreadLine')?.description).toContain(
    'not current sportsbook odds',
  );
  const data = fixture();
  data.games.at(-1)!.homeScore = 10;
  const result = buildFootballContext(data, target, [player], league, data.games.at(-1));
  expect(result.players.get(player.id)?.matchup).toBeUndefined();
  expect(result.metrics).toEqual([]);
});

it('does not infer offensive league scoring from unsupported provider rules', () => {
  const result = buildFootballContext(fixture(), target, [player], {
    ...league,
    platform: 'espn',
    scoring: { '999': 1 },
  });
  expect(
    result.players
      .get(player.id)
      ?.metrics.find((metric) => metric.id.endsWith(':opponent-position-points')),
  ).toBeUndefined();
});

it('uses recorded QB attempts and prop stats while absent passing volume stays unknown', () => {
  const data = fixture();
  const qb = { ...player, position: 'QB' };
  for (const row of data.players.filter((row) => row.playerId === player.gsisId)) {
    row.position = 'QB';
    row.stats = {
      passing_yards: 200,
      passing_tds: 2,
      attempts: row.week <= 4 ? 25 : 35,
      completions: 20,
    };
  }
  const result = buildFootballContext(data, { ...target, stat: 'completions' }, [qb]).players.get(
    player.id,
  )!;
  expect(result.metrics.find((metric) => metric.id.endsWith(':recent-attempts'))).toMatchObject({
    value: 35,
    sampleSize: 2,
  });
  expect(result.metrics.find((metric) => metric.id.endsWith(':change-attempts'))?.value).toBe(10);
  expect(result.metrics.find((metric) => metric.id.endsWith(':history-completions'))?.value).toBe(
    20,
  );
  for (const row of data.players) delete row.stats.attempts;
  expect(
    buildFootballContext(data, target, [qb])
      .players.get(player.id)
      ?.metrics.some((metric) => metric.id.endsWith(':recent-attempts')),
  ).toBe(false);
});

it('does not assign a workload share when recorded team totals are zero', () => {
  const data = fixture();
  for (const row of data.players) row.stats.targets = 0;
  expect(metric('recent-targets', data)?.value).toBe(0);
  expect(metric('recorded-targets-share', data)).toBeUndefined();
});

it('does not expose another player’s production or workload through an explicit GSIS conflict', () => {
  const conflicting = { ...player, gsisId: 'another-player' };
  const result = buildFootballContext(fixture(), target, [conflicting], league).players.get(
    player.id,
  )!;
  expect(
    result.metrics.some((metric) => /:(history-|recent-|change-|recorded-)/.test(metric.id)),
  ).toBe(false);
  expect(result.warnings.join(' ')).toContain('GSIS identity conflicts');
  // Verified team matchup context does not depend on assigning individual history.
  expect(result.matchup?.opponent).toBe('MIA');
});
