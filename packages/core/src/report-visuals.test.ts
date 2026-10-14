import { describe, expect, it } from 'vitest';
import { isReportVisuals, isSavedReport, reportVisuals, type LeagueConnection } from './index.js';

const league: LeagueConnection = {
  id: 'league',
  platform: 'sleeper',
  name: 'Test',
  displayName: 'Test',
  teamCount: 2,
  scoring: {},
  settings: { currentWeek: 3 },
  connectedAt: '2026-10-01T12:00:00.000Z',
  teams: [
    {
      id: 'a',
      name: 'First',
      wins: 0,
      pointsFor: 0,
      owner: 'Private owner',
      roster: [{ id: 'private-player', name: 'Private player', position: 'QB' }],
    },
    { id: 'b', name: 'Second', wins: 1, pointsFor: -2 },
  ],
  matchups: [
    {
      week: 3,
      teams: [{ teamId: 'a', points: 0, playerIds: ['private-player'] }, { teamId: 'b' }],
    },
  ],
};
describe('report chart evidence', () => {
  it('keeps the selected week even when older matchup rows exceed the snapshot limit', () => {
    const input = structuredClone(league);
    input.matchups = [
      ...Array.from({ length: 40 }, () => ({ week: 2, teams: [{ teamId: 'a', points: 999 }] })),
      ...input.matchups!,
    ];
    const visuals = reportVisuals(input);
    expect(visuals.matchups).toHaveLength(1);
    expect(visuals.matchups[0]!.week).toBe(3);
    expect(visuals.matchups[0]!.teams[0]!.points).toBe(0);
  });
  it('freezes recorded zero, negative, and missing scores without keeping roster or owner data', () => {
    const input = structuredClone(league);
    const snapshot = reportVisuals(input);
    input.teams[0]!.pointsFor = 200;
    input.matchups![0]!.teams[0]!.points = 120;
    expect(snapshot.teams[0]!.pointsFor).toBe(0);
    expect(snapshot.teams[1]!.pointsFor).toBe(-2);
    expect(snapshot.matchups[0]!.teams[0]!.points).toBe(0);
    expect(snapshot.matchups[0]!.teams[1]!.points).toBeUndefined();
    expect(JSON.stringify(snapshot)).not.toMatch(/Private|private-player|roster|playerIds|owner/);
    expect(isReportVisuals(snapshot)).toBe(true);
  });
  it('rejects unbounded or malformed chart evidence at report and import boundaries', () => {
    const visuals = reportVisuals(league);
    const saved = {
      id: 'r',
      leagueId: 'league',
      kind: 'power-rankings',
      title: 'Test',
      body: 'Test',
      createdAt: '2026-10-01T12:00:00.000Z',
      citations: [],
      status: 'draft',
      evidence: { guidance: 'Test', visuals },
    };
    expect(isSavedReport(saved)).toBe(true);
    for (const invalid of [
      { ...visuals, teams: Array(65).fill(visuals.teams[0]) },
      { ...visuals, teams: [{ ...visuals.teams[0], pointsFor: Infinity }] },
      { ...visuals, matchups: [{ week: 99, teams: [] }] },
      { ...visuals, matchups: [{ week: 3, teams: [{ teamId: 'a', points: '0' }] }] },
    ])
      expect(isSavedReport({ ...saved, evidence: { guidance: 'Test', visuals: invalid } })).toBe(
        false,
      );
    expect(isSavedReport({ ...saved, evidence: { guidance: 'Legacy report' } })).toBe(true);
  });
});
