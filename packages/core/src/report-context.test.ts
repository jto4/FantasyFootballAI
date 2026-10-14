import { expect, it } from 'vitest';
import { analyzeLeague, reportEvidenceGuidance, type LeagueConnection } from './index.js';
const league: LeagueConnection = {
  id: 'test',
  platform: 'sleeper',
  name: 'Test',
  displayName: 'Test',
  season: 2018,
  scoring: {},
  teams: [],
  teamCount: 12,
  settings: {},
  connectedAt: '2026-10-14T12:00:00Z',
};
it('uses the confirmed draft date/status and cannot title a completed draft as today', () => {
  const completed = {
    ...league,
    draft: { id: 'draft', status: 'complete', scheduledAt: '2018-08-20T01:05:00Z', picks: [] },
  };
  const guidance = reportEvidenceGuidance(completed, 'draft-hype');
  expect(guidance).toContain('League season: 2018');
  expect(guidance).toContain('2018-08-20T01:05:00Z');
  expect(guidance).toContain('status is complete');
  expect(guidance).toContain('do not say this draft is upcoming');
  expect(analyzeLeague(completed, 'draft-hype', '').title).toBe('Test: draft outlook');
  expect(reportEvidenceGuidance(league, 'draft-hype')).toContain('Live draft status is unknown');
});

it('surfaces the separate injury field and withholds active matchup totals for an Out starter', () => {
  const current: LeagueConnection = {
    ...league,
    season: 2026,
    teamCount: 2,
    settings: { currentWeek: 6, playoff_start_week: 14 },
    teams: [
      {
        id: 'a',
        name: 'A',
        rosterSize: 1,
        roster: [{ id: 'p1', name: 'Player One', status: 'Active', injuryStatus: 'Out' }],
      },
      {
        id: 'b',
        name: 'B',
        rosterSize: 1,
        roster: [{ id: 'p2', name: 'Player Two', status: 'Active' }],
      },
    ],
    matchups: [
      {
        week: 6,
        teams: [
          { teamId: 'a', starters: ['p1'] },
          { teamId: 'b', starters: ['p2'] },
        ],
      },
    ],
  };
  const projections = ['p1', 'p2'].map((playerId, index) => ({
    id: playerId,
    playerId,
    playerName: `Player ${index === 0 ? 'One' : 'Two'}`,
    leagueId: current.id,
    week: 6,
    projectedPoints: 20,
    sourceName: 'Test projections',
    scoringMatched: true,
    importedAt: '2026-10-14T12:00:00Z',
  }));
  const blocked = reportEvidenceGuidance(current, 'matchup-preview', projections);
  expect(blocked).toContain('"Player One": "OUT"');
  expect(blocked).toContain('requires an updated lineup');
  expect(blocked).not.toContain('Complete starter-based totals');
  current.teams[0]!.roster![0]!.injuryStatus = 'Questionable';
  const uncertain = reportEvidenceGuidance(current, 'matchup-preview', projections);
  expect(uncertain).toContain('"Player One": "QUESTIONABLE"');
  expect(uncertain).toContain('Complete starter-based totals');
  expect(uncertain).toContain('potentially stale roster data');
});
