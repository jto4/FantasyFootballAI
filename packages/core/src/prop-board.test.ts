import { expect, it } from 'vitest';
import type { FootballGame, PlayerGameStats } from './advice-types.js';
import {
  buildPropBoard,
  gradePropLean,
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

it('joins lines with the model projection, this season’s log and fantasy owners', () => {
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
    predict: () => ({ mean: 95, median: 82.7, overChance: 0.7, sampleGames: 6 }),
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
    fantasyTeam: 'Horses',
  });
  expect(row!.lean).toMatchObject({ side: 'over', strength: 'strong' });
});

it('takes the lean from the model’s chance against break-even and skips unpriced TD lines', () => {
  const line = (stat: 'receiving_yards' | 'passing_tds', overOdds?: number) => ({
    id: `espn:${game.id}:1:${stat}:0.5`,
    gameId: game.id,
    playerName: 'Fictional Receiver',
    stat,
    line: 0.5,
    sportsbook: 'DraftKings',
    source: 'espn' as const,
    observedAt: '2026-10-23T00:00:00Z',
    ...(overOdds !== undefined ? { overOdds } : {}),
  });
  const rows = buildPropBoard({
    lines: [line('receiving_yards'), line('passing_tds'), line('passing_tds', -150)],
    games: [game],
    stats: [],
    week: 7,
    predict: () => ({ mean: 1, median: 1, overChance: 0.62, sampleGames: 5 }),
  });
  expect(rows[0]!.model).toMatchObject({ side: 'over', breakEven: 0.524, edge: 0.096 });
  expect(rows[0]!.lean).toMatchObject({ side: 'over', strength: 'strong', score: 0.096 });
  expect(rows[1]!.lean).toBeUndefined();
  // At −150 the over needs 60%, so 62% is only a slight lean.
  expect(rows[2]!.lean).toMatchObject({ strength: 'slight', score: 0.02 });
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
    overChance: 0.6,
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
    // (0.6 − 1)² for the over that hit and (0.6 − 0)² for the over that missed.
    brier: 0.26,
    pricedGames: 2,
  });
  // Leans the model didn't price (the earlier gap method) are left out of the record.
  const unpriced: PropLeanRecord = { ...lean };
  delete unpriced.overChance;
  expect(summarizePropLeans([unpriced]).pending).toBe(0);
});
