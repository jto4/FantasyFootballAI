import { expect, it } from 'vitest';
import type { FootballGame, PlayerGameStats } from './advice-types.js';
import { scoreHistoricalGame } from './advice-math.js';
import {
  projectFantasyPoints,
  projectPlayerStats,
  projectSpecialTeamsPoints,
  projectionContext,
  teamGame,
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
