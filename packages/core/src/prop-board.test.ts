import { expect, it } from 'vitest';
import type { FootballGame, PlayerGameStats } from './advice-types.js';
import {
  buildPropBoard,
  gradePropLean,
  propLean,
  summarizePropLeans,
  type PropLeanRecord,
} from './prop-board.js';

const game: FootballGame = {
  id: '2026_07_KC_SEA',
  season: 2026,
  week: 7,
  seasonType: 'REG',
  date: '2026-10-25',
  home: 'SEA',
  away: 'KC',
  kickoffAt: '2026-10-26T00:20:00.000Z',
};
const log = (week: number, receiving_yards: number, season = 2026): PlayerGameStats => ({
  playerId: '00-1',
  name: 'Fictional Receiver',
  position: 'WR',
  team: 'SEA',
  opponent: 'X',
  gameId: `${season}_0${week}_X_SEA`,
  season,
  week,
  seasonType: 'REG',
  stats: { receiving_yards },
});

it('adjusts the projection to a typical game before comparing with the line', () => {
  // 80 average → 69.6 typical receiving yards.
  const lean = propLean('receiving_yards', 60.5, 80, []);
  expect(lean.median).toBeCloseTo(69.6);
  // 9.1 yards over a 48.7-yard usual swing (70% of the typical game).
  expect(lean.lean).toMatchObject({ side: 'over', strength: 'slight', score: 0.19 });
  // The same average against a 66.5 line no longer leans once skew is removed.
  expect(propLean('receiving_yards', 66.5, 80, []).lean).toBeUndefined();
  // A steady quarterback's own spread narrows the swing, so the same gap leans harder.
  const steady = [270, 280, 290, 300, 285, 295];
  expect(propLean('passing_yards', 265.5, 290, steady).lean).toMatchObject({
    side: 'over',
    strength: 'moderate',
  });
  expect(propLean('passing_yards', 265.5, 290, []).lean).toMatchObject({ strength: 'slight' });
});

it('joins lines with ESPN projections, this season’s log and fantasy owners', () => {
  const [row] = buildPropBoard({
    lines: [
      {
        id: 'espn:2026_07_KC_SEA:4426515:receiving_yards:60.5',
        gameId: game.id,
        playerName: 'Fictional Receiver',
        stat: 'receiving_yards',
        line: 60.5,
        sportsbook: 'DraftKings',
        source: 'espn',
        observedAt: '2026-10-23T00:00:00Z',
      },
    ],
    games: [game],
    forecasts: [
      {
        espnId: '4426515',
        name: 'Fictional Receiver',
        position: 'WR',
        team: 'SEA',
        season: 2026,
        week: 7,
        issuedWeek: 7,
        stats: { receiving_yards: 95 },
        sourceId: 'espn-forecasts-2026-0',
      },
    ],
    stats: [log(1, 70), log(2, 50), log(3, 90), log(5, 100), log(7, 300), log(4, 999, 2025)],
    week: 7,
    rosters: [{ teamName: 'Horses', players: [{ name: 'Fictional Receiver', espnId: '4426515' }] }],
  });
  expect(row).toMatchObject({
    espnId: '4426515',
    team: 'SEA',
    matchup: 'KC at SEA',
    projection: 95,
    typicalGame: 82.7,
    gap: 22.2,
    recent: [70, 50, 90, 100],
    overGames: 3,
    average: 77.5,
    lean: { side: 'over' },
    fantasyTeam: 'Horses',
  });
});

it('grades a saved lean from the game’s stats and summarizes against break-even', () => {
  const lean: PropLeanRecord = {
    key: 'k',
    gameId: '2026_06_X_SEA',
    playerName: 'Fictional Receiver',
    team: 'SEA',
    stat: 'receiving_yards',
    line: 60.5,
    side: 'over',
    strength: 'strong',
    projection: 80,
    observedAt: '2026-10-18T00:00:00Z',
  };
  const stats = [log(6, 75)];
  expect(gradePropLean(lean, stats, 'now')).toEqual({
    actual: 75,
    outcome: 'win',
    gradedAt: 'now',
  });
  expect(gradePropLean({ ...lean, side: 'under' }, stats, 'now')?.outcome).toBe('loss');
  expect(gradePropLean({ ...lean, line: 75 }, stats, 'now')?.outcome).toBe('push');
  expect(gradePropLean({ ...lean, gameId: 'other' }, stats, 'now')).toBeUndefined();
  const summary = summarizePropLeans([
    { ...lean, result: { actual: 75, outcome: 'win', gradedAt: 'x' } },
    { ...lean, strength: 'slight', result: { actual: 10, outcome: 'loss', gradedAt: 'x' } },
    lean,
  ]);
  expect(summary).toMatchObject({
    pending: 1,
    breakEven: 0.524,
    overall: { wins: 1, losses: 1, pushes: 0, winRate: 0.5 },
    byStrength: { strong: { wins: 1, losses: 0 }, slight: { wins: 0, losses: 1 } },
  });
});
