import { expect, it } from 'vitest';
import type { FootballGame, PlayerGameStats } from './advice-types.js';
import { scoreHistoricalGame } from './advice-math.js';
import {
  projectFantasyPoints,
  projectPlayerStats,
  projectSpecialTeamsPoints,
  matchupWinProbability,
  projectionContext,
  projectionRange,
  ruledOutKeys,
  teamGame,
  vacatedCarryShare,
  windFactor,
} from './fantasy-projection.js';
import { propModelSettings } from './prop-model-settings.js';

const game = (week: number, extra: Partial<FootballGame> = {}): FootballGame => ({
  id: `2026_0${week}_LA_SEA`,
  season: 2026,
  week,
  seasonType: 'REG',
  date: `2026-10-0${week}`,
  home: 'SEA',
  away: 'LA',
  homeScore: 24,
  awayScore: 20,
  ...extra,
});
const games = [1, 2, 3, 4].map((w) => game(w));
const receiver = (week: number, receiving_yards: number): PlayerGameStats => ({
  playerId: '00-0000001',
  name: 'Fictional Receiver',
  position: 'WR',
  team: 'SEA',
  opponent: 'LA',
  gameId: game(week).id,
  season: 2026,
  week,
  seasonType: 'REG',
  stats: { receptions: 5, receiving_yards, receiving_tds: week === 2 ? 1 : 0, targets: 8 },
});
const halfPpr = {
  platform: 'sleeper' as const,
  scoring: {
    rec: 0.5,
    rec_yd: 0.1,
    rec_td: 6,
    rush_yd: 0.1,
    rush_td: 6,
    pass_yd: 0.04,
    pass_td: 4,
  },
};

it('projects every scoring stat and scores it with the league’s own rules', () => {
  const history = [receiver(1, 60), receiver(2, 80), receiver(3, 70)];
  const context = projectionContext({ players: history, games });
  const input = { position: 'WR', team: 'SEA', game: games[3]!, history };
  const projected = projectPlayerStats(input, context, propModelSettings)!;
  expect(projected.sampleGames).toBe(3);
  expect(projected.stats.receiving_yards).toBeGreaterThan(55);
  expect(projected.stats.receiving_yards).toBeLessThan(85);
  expect(projected.stats.receiving_tds).toBeGreaterThan(0);
  const fantasy = projectFantasyPoints(
    halfPpr,
    { ...input, playerId: '00-0000001' },
    context,
    propModelSettings,
  )!;
  const expected = scoreHistoricalGame(halfPpr, { ...history[0]!, stats: fantasy.stats }).points;
  expect(fantasy.points).toBeCloseTo(expected!);
  // Two games are not enough history.
  expect(
    projectPlayerStats({ ...input, history: history.slice(0, 2) }, context, propModelSettings),
  ).toBeUndefined();
  expect(teamGame(games, 2026, 4, 'LA')?.id).toBe(games[3]!.id);
  expect(teamGame(games, 2026, 5, 'LA')).toBeUndefined();
});

it('projects kickers and defenses from scored history and the betting total', () => {
  const context = projectionContext({
    players: [],
    games: [...games, game(5, { totalLine: 40, spreadLine: 6 })],
  });
  const history = [1, 2, 3, 4].map((w) => ({ gameId: game(w).id, points: 8 }));
  const target = game(5, { totalLine: 40, spreadLine: 6 });
  const flat = { halfLife: 8, kickerEnvExponent: 0, defenseOpponentCoefficient: 0 };
  expect(
    projectSpecialTeamsPoints('DST', 'SEA', target, history, context, flat)?.points,
  ).toBeCloseTo(8);
  // SEA is a 6-point favorite in a 40 total, so LA is expected to score 17, below the 22 average.
  const adjusted = projectSpecialTeamsPoints('DST', 'SEA', target, history, context, {
    ...flat,
    defenseOpponentCoefficient: 0.4,
  });
  expect(adjusted!.points).toBeCloseTo(8 + 0.4 * (22 - 17));
  expect(projectSpecialTeamsPoints('WR', 'SEA', target, history, context, flat)).toBeUndefined();
  expect(
    projectSpecialTeamsPoints('K', 'SEA', target, history.slice(0, 2), context, flat),
  ).toBeUndefined();
});

it('gives a running back the carries of a teammate back ruled out this week', () => {
  const back = (id: string, week: number, carries: number): PlayerGameStats => ({
    playerId: id,
    name: `Fictional Back ${id}`,
    position: 'RB',
    team: 'SEA',
    opponent: 'LA',
    gameId: game(week).id,
    season: 2026,
    week,
    seasonType: 'REG',
    stats: { carries, rushing_yards: carries * 4, rushing_tds: 0, receptions: 2 },
  });
  const starter = [1, 2, 3].map((w) => back('00-0000010', w, 15));
  const backup = [1, 2, 3].map((w) => back('00-0000011', w, 5));
  const ruledOut = ruledOutKeys([
    { gsisId: '00-0000010', season: 2026, week: 4, seasonType: 'REG', reportStatus: 'Out' },
    { gsisId: '00-0000012', season: 2026, week: 4, reportStatus: 'Questionable' },
    { gsisId: '00-0000013', season: 2026, week: 4, seasonType: 'POST', reportStatus: 'Out' },
  ]);
  expect([...ruledOut]).toEqual(['2026:4:00-0000010']);
  const data = { players: [...starter, ...backup], games };
  const context = projectionContext(data, { snaps: new Map(), depth: new Map(), ruledOut });
  // The starter had 45 of the backs' 60 recent carries; his own projection is not adjusted.
  expect(vacatedCarryShare(context, '00-0000011', 'SEA', games[3]!)).toBeCloseTo(0.6);
  expect(vacatedCarryShare(context, '00-0000010', 'SEA', games[3]!)).toBe(0);
  const input = {
    playerId: '00-0000011',
    position: 'RB',
    team: 'SEA',
    game: games[3]!,
    history: backup,
  };
  const plain = projectFantasyPoints(halfPpr, input, context, propModelSettings)!;
  const adjusted = projectFantasyPoints(
    halfPpr,
    input,
    context,
    propModelSettings,
    undefined,
    0.75,
  )!;
  expect(adjusted.vacatedCarryShare).toBeCloseTo(0.6);
  expect(adjusted.stats.carries! / plain.stats.carries!).toBeCloseTo(2.5 ** 0.75);
  expect(adjusted.stats.receptions).toBe(plain.stats.receptions);
  expect(adjusted.points).toBeGreaterThan(plain.points);
  // Without an injury list nothing changes.
  const healthy = projectionContext({ players: [...starter, ...backup], games });
  expect(vacatedCarryShare(healthy, '00-0000011', 'SEA', games[3]!)).toBe(0);
});

it('gives fitted ranges and a matchup win probability', () => {
  const spreads = {
    WR: { sdIntercept: 2, sdSlope: 0.5, low: -1.2, high: 1.3 },
    DST: { sdIntercept: 5, sdSlope: 0, low: -1.2, high: 1.4 },
  };
  // SD = 2 + 0.5 × 10 = 7; 10 − 1.2 × 7 and 10 + 1.3 × 7.
  expect(projectionRange('WR', 10, spreads)).toEqual({ low: 1.6, high: 19.1, sd: 7 });
  expect(projectionRange('WR', 2, spreads)?.low).toBe(0);
  expect(projectionRange('DST', 3, spreads)?.low).toBe(-3);
  expect(projectionRange('QB', 20, spreads)).toBeUndefined();
  const side = (estimate?: number) => ({
    settled: 0,
    remaining: [{ position: 'WR', ...(estimate !== undefined ? { estimate } : {}) }],
  });
  expect(matchupWinProbability([side(10), side(10)], spreads, 1)).toBe(0.5);
  // Lead 4, SD √(49 + 25) ≈ 8.60: Φ(0.465) ≈ 0.679.
  expect(matchupWinProbability([side(10), side(6)], spreads, 1)).toBeCloseTo(0.679, 2);
  expect(matchupWinProbability([side(10), side(6)], spreads, 2)!).toBeLessThan(0.679);
  expect(matchupWinProbability([side(10), side()], spreads, 1)).toBeUndefined();
  expect(
    matchupWinProbability(
      [
        { settled: 100, remaining: [] },
        { settled: 90, remaining: [] },
      ],
      spreads,
      1,
    ),
  ).toBe(1);
});

it('lowers offensive and kicker projections in forecast wind, not defenses', () => {
  const history = [receiver(1, 60), receiver(2, 80), receiver(3, 70)];
  const windy = projectionContext(
    { players: history, games },
    { snaps: new Map(), depth: new Map(), windKph: new Map([[games[3]!.id, 30]]) },
  );
  const calm = projectionContext({ players: history, games });
  const weather = { windThresholdKph: 10, windCoefficient: -0.1 };
  // 20 km/h over the threshold: 20% off; bounded at half.
  expect(windFactor(windy, games[3]!, weather)).toBeCloseTo(0.8);
  expect(windFactor(windy, games[3]!, { ...weather, windCoefficient: -1 })).toBe(0.5);
  expect(windFactor(calm, games[3]!, weather)).toBe(1);
  expect(windFactor(windy, games[3]!, undefined)).toBe(1);
  const input = { playerId: '00-0000001', position: 'WR', team: 'SEA', game: games[3]!, history };
  const still = projectFantasyPoints(halfPpr, input, windy, propModelSettings)!;
  const blown = projectFantasyPoints(
    halfPpr,
    input,
    windy,
    propModelSettings,
    undefined,
    0,
    weather,
  )!;
  expect(blown.points / still.points).toBeCloseTo(0.8, 2);
  // The stat lines carry the same reduction as the total.
  expect(blown.stats.receiving_yards! / still.stats.receiving_yards!).toBeCloseTo(0.8, 5);
  expect(blown.windFactor).toBeCloseTo(0.8);
  const scored = [1, 2, 3].map((w) => ({ gameId: games[w - 1]!.id, points: 8 }));
  const dst = projectSpecialTeamsPoints(
    'DST',
    'SEA',
    games[3]!,
    scored,
    windy,
    {
      halfLife: 8,
      kickerEnvExponent: 0,
      defenseOpponentCoefficient: 0,
    },
    weather,
  )!;
  expect(dst.windFactor).toBe(1);
  const kicker = projectSpecialTeamsPoints(
    'K',
    'SEA',
    games[3]!,
    scored,
    windy,
    {
      halfLife: 8,
      kickerEnvExponent: 0,
      defenseOpponentCoefficient: 0,
    },
    weather,
  )!;
  expect(kicker.points).toBeCloseTo(6.4);
});
