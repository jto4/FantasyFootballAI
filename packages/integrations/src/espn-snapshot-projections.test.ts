import { expect, it } from 'vitest';
import { normalizeEspnLeague } from './platforms/espn.js';
import { espnSnapshotWeeklyProjections } from './espn-snapshot-projections.js';
const at = '2026-10-16T00:30:00Z';
function snapshot() {
  return {
    id: 123,
    seasonId: 2026,
    status: { currentMatchupPeriod: 4, currentScoringPeriod: 6 },
    settings: {
      name: 'Custom scoring',
      scoringSettings: {
        scoringItems: [
          { statId: 53, points: 0.5 },
          { statId: 42, points: 0.1 },
          { statId: 99, points: 0, pointsOverrides: { 16: 2 } },
        ],
      },
    },
    teams: [
      {
        id: 1,
        name: 'Team',
        roster: {
          entries: [
            {
              playerId: 10,
              lineupSlotId: 4,
              playerPoolEntry: {
                player: {
                  id: 10,
                  fullName: 'Example Receiver',
                  injuryStatus: 'INJURY_RESERVE',
                  defaultPositionId: 3,
                  proTeamId: 26,
                  stats: [
                    {
                      seasonId: 2026,
                      scoringPeriodId: 6,
                      statSourceId: 1,
                      statSplitTypeId: 1,
                      stats: { 53: 4, 42: 50 },
                      appliedStats: { 53: 2, 42: 5 },
                      appliedTotal: 7,
                    },
                  ],
                },
              },
            },
            {
              playerId: 20,
              lineupSlotId: 16,
              playerPoolEntry: {
                player: {
                  id: 20,
                  fullName: 'Seattle D/ST',
                  defaultPositionId: 16,
                  proTeamId: 26,
                  stats: [
                    {
                      seasonId: 2026,
                      scoringPeriodId: 6,
                      statSourceId: 1,
                      statSplitTypeId: 1,
                      stats: { 99: 3 },
                      appliedStats: { 99: 6 },
                      appliedTotal: 6,
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    ],
    schedule: [
      {
        matchupPeriodId: 4,
        home: { teamId: 1, totalPoints: 0 },
        away: { teamId: 2, totalPoints: 0 },
      },
    ],
  };
}
it('uses exact league position overrides, current scoring week and recorded starter/team identities', () => {
  const raw = snapshot(),
    league = normalizeEspnLeague(raw, '123', 2026, raw),
    rows = espnSnapshotWeeklyProjections(raw, league, at);
  expect(rows.map((r) => r.projectedPoints)).toEqual([7, 6]);
  expect(rows.every((r) => r.week === 6 && r.scoringMatched)).toBe(true);
  expect(league.settings.currentWeek).toBe(6);
  expect(league.matchups?.[0]?.week).toBe(6);
  expect(league.matchups?.[0]?.teams[0]?.starters).toEqual(['10', '20']);
  expect(league.teams[0]?.roster?.[0]?.nflTeam).toBe('SEA');
  expect(league.teams[0]?.roster?.[0]?.status).toBe('Injured Reserve');
});
it('rejects actual stats, duplicate forecasts, wrong periods/identities and inconsistent arithmetic', () => {
  for (const mutate of [
    (r: ReturnType<typeof snapshot>) => {
      r.teams[0]!.roster.entries[0]!.playerPoolEntry.player.stats[0]!.statSourceId = 0;
    },
    (r: ReturnType<typeof snapshot>) => {
      r.teams[0]!.roster.entries[0]!.playerPoolEntry.player.stats[0]!.scoringPeriodId = 5;
    },
    (r: ReturnType<typeof snapshot>) => {
      r.teams[0]!.roster.entries[0]!.playerPoolEntry.player.stats[0]!.appliedTotal = 8;
    },
    (r: ReturnType<typeof snapshot>) => {
      const row = r.teams[0]!.roster.entries[0]!.playerPoolEntry.player.stats[0]!;
      row.stats = { 53: -4, 42: 0 };
      row.appliedStats = { 53: -2, 42: 0 };
      row.appliedTotal = -2;
    },
    (r: ReturnType<typeof snapshot>) => {
      const rows = r.teams[0]!.roster.entries[0]!.playerPoolEntry.player.stats;
      Object.assign(rows, { [rows.length]: structuredClone(rows[0]) });
    },
  ]) {
    const raw = snapshot();
    mutate(raw);
    const l = normalizeEspnLeague(raw, '123', 2026, raw);
    expect(espnSnapshotWeeklyProjections(raw, l, at).some((p) => p.playerId === '10')).toBe(false);
  }
  const raw = snapshot(),
    l = normalizeEspnLeague(raw, '123', 2026, raw);
  expect(espnSnapshotWeeklyProjections({ ...raw, id: 456 }, l, at)).toEqual([]);
});
