import { it, expect } from 'vitest';
import type { FootballGame } from './advice-types.js';
import {
  prepareDriveTotalSignals,
  validateDriveTotalStats,
  type DriveTotalStats,
} from './drive-total-signals.js';
function fixture() {
  const games: FootballGame[] = [],
    rows: DriveTotalStats[] = [];
  for (let week = 1; week <= 10; week++) {
    const date = new Date(Date.UTC(2025, 8, 1 + 7 * (week - 1))).toISOString().slice(0, 10),
      id = `2025_${String(week).padStart(2, '0')}_BUF_KC`;
    games.push({
      id,
      season: 2025,
      week,
      seasonType: 'REG',
      date,
      kickoffAt: date + 'T18:00:00.000Z',
      home: 'KC',
      away: 'BUF',
      homeScore: 24,
      awayScore: 20,
      totalLine: 44.5,
    });
    for (const [team, opponent] of [
      ['KC', 'BUF'],
      ['BUF', 'KC'],
    ])
      rows.push({
        gameId: id,
        season: 2025,
        week,
        team: team!,
        opponent: opponent!,
        plays: 60,
        epa: 8,
        successes: 30,
        explosives: 6,
        dropbacks: 35,
        passEpa: 9,
        sacks: 2,
        neutralPlays: 30,
        neutralPasses: 20,
        neutralNoHuddle: 3,
        neutralEpa: 5,
        neutralSuccesses: 16,
        drives: 10,
        offensivePoints: 24,
        opportunities: 5,
        redZoneDrives: 3,
        redZoneTouchdowns: 2,
        possessionSeconds: 1700,
        possessionPlays: 60,
      });
  }
  return { games, rows };
}
it('uses completed earlier weeks, not current or future performance', () => {
  const { games, rows } = fixture(),
    origin = games[7]!,
    a = prepareDriveTotalSignals(games, rows).features(origin),
    mutated = rows.map((r) => (r.week >= 8 ? { ...r, epa: -100, offensivePoints: 0 } : r));
  expect(a.supported).toBe(true);
  expect(prepareDriveTotalSignals(games, mutated).features(origin)).toEqual(a);
  expect(
    prepareDriveTotalSignals(
      games,
      rows.map((r) => (r.week < 8 ? { ...r, epa: -100 } : r)),
    ).features(origin).x,
  ).not.toEqual(a.x);
  expect(a.x).toHaveLength(14);
  expect(a.projectedPoints).toBeCloseTo(48);
});
it('fails closed on unpaired schedule joins and sparse histories', () => {
  const { games, rows } = fixture();
  expect(prepareDriveTotalSignals(games, rows).features(games[0]!).supported).toBe(false);
  expect(
    prepareDriveTotalSignals(
      games,
      rows.filter((r) => r.team === 'KC'),
    ).joinedRows,
  ).toBe(0);
  expect(prepareDriveTotalSignals([...games, games[0]!], rows).rejectedJoinRows).toBe(2);
});
it('rejects malformed counts, identities, duplicate rows and nonfinite efficiency', () => {
  const { rows } = fixture();
  expect(() => validateDriveTotalStats([...rows, rows[0]!])).toThrow();
  expect(() => validateDriveTotalStats([{ ...rows[0]!, neutralPasses: 100 }])).toThrow();
  expect(() => validateDriveTotalStats([{ ...rows[0]!, epa: NaN }])).toThrow();
  expect(() => validateDriveTotalStats([{ ...rows[0]!, team: 'LV' }])).toThrow();
});
