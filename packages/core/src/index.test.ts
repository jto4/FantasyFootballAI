import { describe, expect, it } from 'vitest';
import {
  addCalendarDays,
  analyzeLeague,
  applyScheduleRecommendations,
  channelBoundaryForReport,
  isValidChannelBoundaries,
  isValidEspnSeason,
  defaultActionSettings,
  defaultNewsSources,
  scheduleRecommendations,
  defaultLeagueStaleAfterHours,
  isLeagueStaleAfterHours,
  leagueSyncFreshness,
  leagueSeasonPhase,
  scheduledReportPhaseSkipReason,
  leagueSyncStaleAfterMs,
  isValidLeagueCalendarEvent,
  localDateTimeInTimezone,
  leaguesForAction,
  normalizeActionSettings,
  normalizeLeagueCalendarEvents,
  preserveCompletedCalendarEvents,
  normalizeChannelBoundaries,
  normalizeNewsSources,
  normalizeScoring,
  platformDraftCalendarSuggestions,
  rankTeams,
  reportEvidenceGuidance,
  type LeagueConnection,
  type PlayerProjection,
} from './index.js';

const league: LeagueConnection = {
  id: 'x',
  platform: 'sleeper',
  name: 'Test',
  displayName: 'Test League',
  teamCount: 2,
  scoring: { rec: 1 },
  settings: {},
  teams: [
    { id: '1', name: 'B', wins: 1 },
    { id: '2', name: 'A', wins: 2 },
  ],
  connectedAt: '2026-01-01',
};

describe('ESPN fantasy season bounds', () => {
  it('accepts only integer season years in the supported range', () => {
    expect(isValidEspnSeason(2000)).toBe(true);
    expect(isValidEspnSeason(2099)).toBe(true);
    expect(isValidEspnSeason(1999)).toBe(false);
    expect(isValidEspnSeason(2100)).toBe(false);
    expect(isValidEspnSeason(2026.5)).toBe(false);
    expect(isValidEspnSeason('2026')).toBe(false);
  });
});

describe('league analysis', () => {
  it('classifies playoff weeks only when both current week and playoff start are known', () => {
    expect(leagueSeasonPhase({ settings: { seasonStatus: 'pre_draft' } })).toBe('offseason');
    expect(leagueSeasonPhase({ settings: { seasonStatus: 'drafting' } })).toBe('offseason');
    expect(leagueSeasonPhase({ settings: { seasonStatus: 'in_season' } })).toBe('unknown');
    expect(leagueSeasonPhase({ settings: { currentWeek: 14, playoff_week_start: 15 } })).toBe(
      'regular-season',
    );
    expect(leagueSeasonPhase({ settings: { currentWeek: 15, playoff_week_start: 15 } })).toBe(
      'playoffs',
    );
    expect(leagueSeasonPhase({ settings: { currentWeek: 17 } })).toBe('unknown');
    expect(
      leagueSeasonPhase({
        settings: { currentWeek: 17, playoffStartWeek: '15', seasonComplete: true },
      }),
    ).toBe('complete');
    expect(leagueSeasonPhase({ settings: { currentWeek: 31, playoffStartWeek: 15 } })).toBe(
      'unknown',
    );
  });

  it('pauses scheduled report types when confirmed league phase makes them irrelevant', () => {
    expect(scheduledReportPhaseSkipReason('power-rankings', 'offseason')).toContain(
      'pre-draft or draft phase',
    );
    expect(scheduledReportPhaseSkipReason('matchup-preview', 'offseason')).toContain(
      'recurring in-season reports are paused',
    );
    expect(scheduledReportPhaseSkipReason('offseason-update', 'offseason')).toBeUndefined();
    expect(scheduledReportPhaseSkipReason('power-rankings', 'offseason', 'once')).toBeUndefined();
    expect(scheduledReportPhaseSkipReason('offseason-update', 'regular-season')).toContain(
      'still active',
    );
    expect(scheduledReportPhaseSkipReason('offseason-update', 'playoffs')).toContain(
      'still active',
    );
    expect(scheduledReportPhaseSkipReason('power-rankings', 'complete')).toContain(
      'season complete',
    );
    expect(scheduledReportPhaseSkipReason('matchup-preview', 'complete')).toContain(
      'season complete',
    );
    expect(scheduledReportPhaseSkipReason('power-rankings', 'unknown')).toBeUndefined();
    expect(scheduledReportPhaseSkipReason('offseason-update', 'unknown')).toBeUndefined();
    expect(scheduledReportPhaseSkipReason('draft-hype', 'regular-season')).toBeUndefined();
    expect(scheduledReportPhaseSkipReason('offseason-update', 'regular-season', 'once')).toBe(
      undefined,
    );
  });

  it('re-evaluates recurring report eligibility as a league moves through season phases', () => {
    const phaseSequence = [
      { phase: 'offseason' as const, offseason: true, weekly: false },
      { phase: 'regular-season' as const, offseason: false, weekly: true },
      { phase: 'playoffs' as const, offseason: false, weekly: true },
      { phase: 'complete' as const, offseason: true, weekly: false },
      { phase: 'unknown' as const, offseason: true, weekly: true },
    ];

    for (const { phase, offseason, weekly } of phaseSequence) {
      expect(!scheduledReportPhaseSkipReason('offseason-update', phase)).toBe(offseason);
      expect(!scheduledReportPhaseSkipReason('power-rankings', phase)).toBe(weekly);
      expect(!scheduledReportPhaseSkipReason('matchup-preview', phase)).toBe(weekly);
    }
  });

  it('tells report generation when postseason status is confirmed or unknown', () => {
    const playoffLeague = {
      ...league,
      settings: { currentWeek: 16, playoffStartWeek: 15 },
      matchups: [{ week: 16, teams: [{ teamId: '1' }, { teamId: '2' }] }],
    };
    expect(reportEvidenceGuidance(playoffLeague, 'power-rankings')).toContain(
      'platform settings identify playoff week 16',
    );
    expect(reportEvidenceGuidance(playoffLeague, 'matchup-preview')).toContain(
      'do not infer elimination or bracket rules',
    );
    expect(reportEvidenceGuidance(league, 'power-rankings')).toContain(
      'does not confirm season phase',
    );
    expect(
      reportEvidenceGuidance(
        {
          ...playoffLeague,
          settings: { ...playoffLeague.settings, playoffStartWeekSource: 'derived' },
        },
        'power-rankings',
      ),
    ).toContain('Treat this phase as inferred');
  });

  it('classifies league snapshot freshness without guessing when timestamps are unreliable', () => {
    const now = Date.parse('2026-09-27T12:00:00.000Z');
    expect(
      leagueSyncFreshness(
        { lastSyncedAt: new Date(now - leagueSyncStaleAfterMs + 1).toISOString() },
        now,
      ),
    ).toBe('fresh');
    expect(
      leagueSyncFreshness(
        { lastSyncedAt: new Date(now - leagueSyncStaleAfterMs).toISOString() },
        now,
      ),
    ).toBe('stale');
    expect(leagueSyncFreshness({}, now)).toBe('unknown');
    expect(leagueSyncFreshness({ lastSyncedAt: 'not-a-date' }, now)).toBe('unknown');
    expect(leagueSyncFreshness({ lastSyncedAt: new Date(now + 1).toISOString() }, now)).toBe(
      'unknown',
    );
  });

  it('limits configurable stale thresholds to supported hour values', () => {
    expect(isLeagueStaleAfterHours(defaultLeagueStaleAfterHours)).toBe(true);
    expect(isLeagueStaleAfterHours(168)).toBe(true);
    expect(isLeagueStaleAfterHours(24.5)).toBe(false);
    expect(isLeagueStaleAfterHours(0)).toBe(false);
  });

  it('keeps only bounded channel-specific topic boundaries', () => {
    expect(
      normalizeChannelBoundaries({
        email: 'No jokes about someone’s job.',
        sms: 'Keep it under 300 characters.',
        imessage: 'x'.repeat(2_001),
        unknown: 'ignore this key',
      }),
    ).toEqual({
      email: 'No jokes about someone’s job.',
      sms: 'Keep it under 300 characters.',
    });
  });

  it('selects only the boundary matching a report delivery channel', () => {
    const boundaries = {
      email: 'No personal insults.',
      sms: 'Keep it short.',
    };
    expect(channelBoundaryForReport({ channelBoundaries: boundaries }, 'email')).toBe(
      'No personal insults.',
    );
    expect(channelBoundaryForReport({ channelBoundaries: boundaries }, 'sms')).toBe(
      'Keep it short.',
    );
    expect(channelBoundaryForReport({ channelBoundaries: boundaries }, 'dashboard')).toBe('');
  });

  it('rejects invalid channel keys and oversized boundary text', () => {
    expect(isValidChannelBoundaries({ email: 'No personal insults.' })).toBe(true);
    expect(isValidChannelBoundaries({ webhook: 'Unknown channels are rejected.' })).toBe(false);
    expect(isValidChannelBoundaries({ sms: 'x'.repeat(2_001) })).toBe(false);
    expect(isValidChannelBoundaries([])).toBe(false);
  });

  it('orders power rankings by comparable wins and breaks ties with points for', () => {
    expect(analyzeLeague(league, 'power-rankings', 'dry').body.indexOf('1. A')).toBeLessThan(
      analyzeLeague(league, 'power-rankings', 'dry').body.indexOf('2. B'),
    );
    expect(rankTeams(league).basis).toBe('wins');
  });

  it('does not compare incompatible metrics when the team snapshot is incomplete', () => {
    const partial = {
      ...league,
      teams: [
        { id: '1', name: 'One', wins: 3, pointsFor: 200 },
        { id: '2', name: 'Two' },
      ],
    };
    expect(rankTeams(partial).basis).toBeUndefined();
    expect(analyzeLeague(partial, 'power-rankings', 'dry').body).toContain(
      'there is no reliable common metric',
    );
  });

  it('does not treat an all-zero preseason record as played standings', () => {
    const preseason: LeagueConnection = {
      ...league,
      teams: [
        { id: '1', name: 'One', wins: 0, losses: 0, pointsFor: 0 },
        { id: '2', name: 'Two', wins: 0, losses: 0, pointsFor: 0 },
      ],
    };

    expect(rankTeams(preseason).basis).toBeUndefined();
  });

  it('uses complete scoring-confirmed roster projections for preseason power rankings', () => {
    const preseason: LeagueConnection = {
      ...league,
      teams: [
        {
          id: '1',
          name: 'Lower projection',
          rosterSize: 1,
          roster: [{ id: 'player-1', name: 'Player One', position: 'RB' }],
        },
        {
          id: '2',
          name: 'Higher projection',
          rosterSize: 1,
          roster: [{ id: 'player-2', name: 'Player Two', position: 'RB' }],
        },
      ],
    };
    const projections: PlayerProjection[] = [
      {
        id: 'projection-1',
        leagueId: preseason.id,
        sourceId: 'source-1',
        scoringMatched: true,
        playerId: 'player-1',
        playerName: 'Player One',
        projectedPoints: 100,
        sourceName: 'Owner forecast',
        sourceUrl: 'https://example.com/forecast.csv',
        importedAt: '2026-08-30T12:00:00.000Z',
      },
      {
        id: 'projection-2',
        leagueId: preseason.id,
        sourceId: 'source-1',
        scoringMatched: true,
        playerId: 'player-2',
        playerName: 'Player Two',
        projectedPoints: 150,
        sourceName: 'Owner forecast',
        sourceUrl: 'https://example.com/forecast.csv',
        importedAt: '2026-08-30T12:00:00.000Z',
      },
    ];

    const guidance = reportEvidenceGuidance(preseason, 'power-rankings', projections);
    expect(guidance).toContain('clearly labeled AI preseason power ranking');
    expect(guidance.indexOf('"Higher projection"')).toBeLessThan(
      guidance.indexOf('"Lower projection"'),
    );
    expect(guidance).toContain('starting-lineup projection');
    expect(
      reportEvidenceGuidance(preseason, 'power-rankings', [
        { ...projections[0]!, scoringMatched: false },
        projections[1]!,
      ]),
    ).toContain('complete owner-confirmed roster projections are unavailable');
    expect(
      reportEvidenceGuidance(preseason, 'power-rankings', [
        { ...projections[0]!, playerName: 'Different Player' },
        projections[1]!,
      ]),
    ).toContain('complete owner-confirmed roster projections are unavailable');
  });

  it('uses one shared standings metric when teams also have points-for data', () => {
    const mixedScale: LeagueConnection = {
      ...league,
      teams: [
        { id: '1', name: 'Most wins', wins: 3, pointsFor: 100 },
        { id: '2', name: 'Most points', wins: 2, pointsFor: 500 },
      ],
    };

    const ranking = rankTeams(mixedScale);
    expect(ranking.basis).toBe('wins');
    expect(ranking.teams.map((team) => team.name)).toEqual(['Most wins', 'Most points']);
  });

  it('tells each report what connected data can and cannot support', () => {
    expect(reportEvidenceGuidance(league, 'matchup-preview')).toContain('No current matchup data');
    expect(reportEvidenceGuidance(league, 'draft-review')).toContain('no draft pick log');
    expect(
      reportEvidenceGuidance(
        { ...league, matchups: [{ week: 3, teams: [{ teamId: '1' }, { teamId: '2' }] }] },
        'matchup-preview',
      ),
    ).toContain('No owner-imported week-specific projections');
    const withRoster: LeagueConnection = {
      ...league,
      teams: league.teams.map((team) => ({
        ...team,
        roster: [{ id: 'p1', name: 'Avery Runner', position: 'RB' }],
      })),
    };
    expect(reportEvidenceGuidance(withRoster, 'draft-review')).toContain(
      'Current roster players are available',
    );
    expect(reportEvidenceGuidance(withRoster, 'draft-review')).toContain('no draft pick log');
    expect(
      reportEvidenceGuidance(
        {
          ...withRoster,
          draft: {
            id: 'draft-1',
            status: 'complete',
            picks: [{ playerId: 'p1', playerName: 'Avery Runner', round: 1, pickNumber: 1 }],
          },
        },
        'draft-review',
      ),
    ).toContain('draft pick log contains 1 pick');
  });

  it('withholds logged-pick ADP comparisons until three owner sources support a player', () => {
    const guidance = reportEvidenceGuidance(
      {
        ...league,
        draft: {
          id: 'draft-1',
          status: 'complete',
          picks: [{ playerId: 'p1', playerName: 'Avery Runner', teamId: '1', pickNumber: 16 }],
        },
      },
      'draft-review',
      [
        {
          id: 'projection-1',
          leagueId: league.id,
          playerId: 'p1',
          playerName: 'Avery Runner',
          position: 'RB',
          projectedPoints: 200,
          averageDraftPosition: 12.5,
          sourceName: 'Owner CSV',
          scoringMatched: true,
          importedAt: '2026-09-01T00:00:00.000Z',
        },
      ],
    );
    expect(guidance).toContain('Owner-supplied ADP sources: "Owner CSV"');
    expect(guidance).not.toContain('selected 3.5 picks later');
    expect(guidance).toContain('multi-source ADP evidence requires at least 3');
    expect(guidance).toContain('team-level ADP timing summary is withheld');
    expect(guidance).toContain('Do not assign team draft grades');

    const unconfirmed = reportEvidenceGuidance(
      {
        ...league,
        draft: {
          id: 'draft-1',
          status: 'in-progress',
          picks: [{ playerId: 'p1', playerName: 'Avery Runner', teamId: '1', pickNumber: 16 }],
        },
      },
      'draft-review',
      [
        {
          id: 'projection-1',
          leagueId: league.id,
          playerId: 'p1',
          playerName: 'Avery Runner',
          projectedPoints: 200,
          averageDraftPosition: 12.5,
          sourceName: 'Owner CSV',
          scoringMatched: true,
          importedAt: '2026-09-01T00:00:00.000Z',
        },
      ],
    );
    expect(unconfirmed).toContain('summary is withheld');

    const completeEvidence = reportEvidenceGuidance(
      {
        ...league,
        settings: { roster_positions: ['RB'] },
        draft: {
          id: 'draft-complete',
          status: 'complete',
          picks: [
            { playerId: 'p1', playerName: 'Avery Runner', teamId: '1', pickNumber: 1 },
            { playerId: 'p2', playerName: 'Blake Runner', teamId: '2', pickNumber: 2 },
          ],
        },
      },
      'draft-review',
      [
        {
          id: 'projection-1',
          leagueId: league.id,
          playerId: 'p1',
          playerName: 'Avery Runner',
          position: 'RB',
          projectedPoints: 200,
          averageDraftPosition: 3,
          sourceName: 'Owner CSV',
          scoringMatched: true,
          importedAt: '2026-09-01T00:00:00.000Z',
        },
        {
          id: 'projection-2',
          leagueId: league.id,
          playerId: 'p2',
          playerName: 'Blake Runner',
          position: 'RB',
          projectedPoints: 150,
          averageDraftPosition: 1,
          sourceName: 'Owner CSV',
          scoringMatched: true,
          importedAt: '2026-09-01T00:00:00.000Z',
        },
      ],
    );
    expect(completeEvidence).toContain('projected surplus versus positional replacement by team');
    expect(completeEvidence).toContain('three-source ADP matches');
    expect(completeEvidence).toContain('Do not assign team draft grades');
  });

  it('grounds matchup preview guidance in connected pairings without treating scores as projections', () => {
    const connected: LeagueConnection = {
      ...league,
      lastSyncedAt: '2026-09-27T12:00:00.000Z',
      teams: [
        { id: '1', name: 'Alpha' },
        { id: '2', name: 'Beta' },
      ],
      matchups: [
        {
          week: 4,
          teams: [
            { teamId: '1', points: 63.5 },
            { teamId: '2', points: 59.2 },
          ],
        },
      ],
    };

    const guidance = reportEvidenceGuidance(connected, 'matchup-preview');
    expect(guidance).toContain('week 4: "Alpha" (63.5 platform-reported points) vs "Beta"');
    expect(guidance).toContain('does not establish whether they are live or final');
    expect(guidance).toContain('No owner-imported week-specific projections');
    expect(guidance).toContain('No non-active availability tags were supplied');
    expect(guidance).toContain('Do not call platform scores projections');
  });

  it('projects a matchup only when each platform starter ID has that week’s projection', () => {
    const connected: LeagueConnection = {
      ...league,
      lastSyncedAt: '2026-09-27T12:00:00.000Z',
      teams: [
        { id: '1', name: 'Alpha' },
        { id: '2', name: 'Beta' },
      ],
      matchups: [
        {
          week: 4,
          teams: [
            { teamId: '1', starters: ['p1', 'p2'] },
            { teamId: '2', starters: ['p3'] },
          ],
        },
      ],
    };
    const projections: PlayerProjection[] = [
      {
        id: '1',
        leagueId: 'x',
        playerId: 'p1',
        playerName: 'One',
        projectedPoints: 18.5,
        week: 4,
        sourceName: 'Owner weekly CSV',
        scoringMatched: true,
        importedAt: '2026-09-01T00:00:00.000Z',
      },
      {
        id: '2',
        leagueId: 'x',
        playerId: 'p2',
        playerName: 'Two',
        projectedPoints: 12,
        week: 4,
        sourceName: 'Owner weekly CSV',
        scoringMatched: true,
        importedAt: '2026-09-01T00:00:00.000Z',
      },
      {
        id: '3',
        leagueId: 'x',
        playerId: 'p3',
        playerName: 'Three',
        projectedPoints: 15,
        week: 4,
        sourceName: 'Owner weekly CSV',
        scoringMatched: true,
        importedAt: '2026-09-01T00:00:00.000Z',
      },
      {
        id: '4',
        leagueId: 'x',
        playerId: 'p1',
        playerName: 'One',
        projectedPoints: 200,
        sourceName: 'Owner weekly CSV',
        scoringMatched: true,
        importedAt: '2026-09-01T00:00:00.000Z',
      },
    ];

    const guidance = reportEvidenceGuidance(connected, 'matchup-preview', projections);
    expect(guidance).toContain('week 4: "Alpha" 30.5 vs "Beta" 15.0');
    expect(guidance).toContain("model-independent sums of the owner's imported estimates");
    expect(guidance).toContain('Starter assignments came from the platform snapshot last synced');
    expect(guidance).not.toContain('200.0');

    const partialLineup: LeagueConnection = {
      ...connected,
      matchups: [
        {
          week: 4,
          teams: [
            { teamId: '1', starters: ['p1', ''] },
            { teamId: '2', starters: ['p3'] },
          ],
        },
      ],
    };
    expect(reportEvidenceGuidance(partialLineup, 'matchup-preview', projections)).toContain(
      'no matchup has a complete starter-ID and projection match',
    );

    const incomplete = {
      ...connected,
      matchups: [{ week: 5, teams: connected.matchups![0]!.teams }],
    };
    expect(reportEvidenceGuidance(incomplete, 'matchup-preview', projections)).toContain(
      'no matchup has a complete starter-ID and projection match',
    );
  });

  it('uses normalized active roster slots when a connector has no explicit starter array', () => {
    const connected: LeagueConnection = {
      ...league,
      teams: [
        {
          id: '1',
          name: 'Alpha',
          rosterSize: 2,
          roster: [
            { id: 'p1', name: 'Starter One', rosterPosition: 'WR' },
            { id: 'p2', name: 'Bench Two', rosterPosition: 'BENCH' },
          ],
        },
        {
          id: '2',
          name: 'Beta',
          rosterSize: 1,
          roster: [{ id: 'p3', name: 'Starter Three', rosterPosition: 'RB' }],
        },
      ],
      matchups: [{ week: 7, teams: [{ teamId: '1' }, { teamId: '2' }] }],
    };
    const projections: PlayerProjection[] = [
      {
        id: '1',
        leagueId: 'x',
        playerId: 'p1',
        playerName: 'Starter One',
        projectedPoints: 20,
        week: 7,
        sourceName: 'Weekly file',
        scoringMatched: true,
        importedAt: '2026-09-01T00:00:00.000Z',
      },
      {
        id: '2',
        leagueId: 'x',
        playerId: 'p2',
        playerName: 'Bench Two',
        projectedPoints: 99,
        week: 7,
        sourceName: 'Weekly file',
        scoringMatched: true,
        importedAt: '2026-09-01T00:00:00.000Z',
      },
      {
        id: '3',
        leagueId: 'x',
        playerId: 'p3',
        playerName: 'Starter Three',
        projectedPoints: 16,
        week: 7,
        sourceName: 'Weekly file',
        scoringMatched: true,
        importedAt: '2026-09-01T00:00:00.000Z',
      },
    ];

    const guidance = reportEvidenceGuidance(connected, 'matchup-preview', projections);
    expect(guidance).toContain('week 7: "Alpha" 20.0 vs "Beta" 16.0');
    expect(guidance).not.toContain('99.0');

    const incompleteRoster: LeagueConnection = {
      ...connected,
      teams: connected.teams.map((team) =>
        team.id === '1'
          ? {
              ...team,
              rosterSize: 3,
              roster: [...(team.roster ?? []), { id: 'p4', name: 'Unslotted player' }],
            }
          : team,
      ),
    };
    const incompleteGuidance = reportEvidenceGuidance(
      incompleteRoster,
      'matchup-preview',
      projections,
    );
    expect(incompleteGuidance).toContain(
      'no matchup has a complete starter-ID and projection match',
    );

    const truncatedRoster: LeagueConnection = {
      ...connected,
      teams: connected.teams.map((team) => (team.id === '1' ? { ...team, rosterSize: 3 } : team)),
    };
    expect(reportEvidenceGuidance(truncatedRoster, 'matchup-preview', projections)).toContain(
      'no matchup has a complete starter-ID and projection match',
    );
  });

  it('uses only recognized, dated platform availability tags as uncertain evidence', () => {
    const connected: LeagueConnection = {
      ...league,
      lastSyncedAt: '2026-09-25T10:00:00.000Z',
      teams: [
        {
          id: '1',
          name: 'Alpha',
          roster: [
            { id: 'p1', name: 'Player One', position: 'WR', status: 'Questionable' },
            { id: 'p2', name: 'Player Two', status: 'Active' },
            { id: 'p3', name: 'Player Three', status: 'Injured_Reserve' },
            { id: 'p4', name: 'Player Four', status: 'Practice Squad' },
          ],
        },
        { id: '2', name: 'Beta' },
      ],
      matchups: [{ week: 5, teams: [{ teamId: '1' }, { teamId: '2' }] }],
    };

    const guidance = reportEvidenceGuidance(connected, 'matchup-preview');
    expect(guidance).toContain('"Player One": "QUESTIONABLE"');
    expect(guidance).toContain('"Player Three": "INJURED RESERVE"');
    expect(guidance).toContain('2026-09-25T10:00:00.000Z');
    expect(guidance).toContain('not verified injury reports');
    expect(guidance).not.toContain('Player Two');
    expect(guidance).not.toContain('Player Four');
  });

  it('grades logged picks only against imported positional replacement evidence', () => {
    const draftLeague: LeagueConnection = {
      ...league,
      teamCount: 2,
      settings: { roster_positions: ['WR', 'WR'] },
      draft: {
        id: 'draft-1',
        picks: [{ playerId: 'p1', playerName: 'Player One', position: 'WR', pickNumber: 1 }],
      },
    };
    const projections: PlayerProjection[] = [
      {
        id: '1',
        leagueId: 'x',
        playerId: 'p1',
        playerName: 'Player One',
        position: 'WR',
        projectedPoints: 220,
        sourceName: 'Owner CSV',
        scoringMatched: true,
        importedAt: '2026-09-01T00:00:00.000Z',
      },
      {
        id: '2',
        leagueId: 'x',
        playerName: 'Player Two',
        position: 'WR',
        projectedPoints: 180,
        sourceName: 'Owner CSV',
        scoringMatched: true,
        importedAt: '2026-09-01T00:00:00.000Z',
      },
      {
        id: '3',
        leagueId: 'x',
        playerName: 'Player Three',
        position: 'WR',
        projectedPoints: 160,
        sourceName: 'Owner CSV',
        scoringMatched: true,
        importedAt: '2026-09-01T00:00:00.000Z',
      },
      {
        id: '4',
        leagueId: 'x',
        playerName: 'Player Four',
        position: 'WR',
        projectedPoints: 140,
        sourceName: 'Owner CSV',
        scoringMatched: true,
        importedAt: '2026-09-01T00:00:00.000Z',
      },
    ];

    const guidance = reportEvidenceGuidance(draftLeague, 'draft-review', projections);
    expect(guidance).toContain('Owner-imported season projections');
    expect(guidance).toContain('Player One');
    expect(guidance).toContain('+80.0 projected points versus WR replacement (140.0)');
    expect(guidance).toContain('comparable team-level draft total is unavailable');
    expect(guidance).toContain('not ADP or actual outcomes');
  });

  it('allocates Yahoo flex and superflex slots across eligible positional baselines', () => {
    const draftLeague: LeagueConnection = {
      ...league,
      settings: { roster_positions: ['QB', 'RB', 'WR', 'TE', 'W/R/T', 'SUPER_FLEX'] },
      draft: {
        id: 'draft-flex',
        picks: [
          {
            playerId: 'draft-wr',
            playerName: 'Drafted WR',
            position: 'WR',
            pickNumber: 1,
            teamId: '1',
          },
          {
            playerId: 'draft-qb',
            playerName: 'Drafted QB',
            position: 'QB',
            pickNumber: 2,
            teamId: '2',
          },
        ],
      },
    };
    const projections: PlayerProjection[] = [];
    const addPlayers = (position: string, players: Array<[string, number]>) => {
      for (const [playerName, projectedPoints] of players) {
        const playerId =
          playerName === 'Drafted WR'
            ? 'draft-wr'
            : playerName === 'Drafted QB'
              ? 'draft-qb'
              : undefined;
        projections.push({
          id: `${position}-${playerName}`,
          leagueId: 'x',
          ...(playerId ? { playerId } : {}),
          playerName,
          position,
          projectedPoints,
          sourceName: 'Owner CSV',
          scoringMatched: true,
          importedAt: '2026-09-01T00:00:00.000Z',
        });
      }
    };
    addPlayers('QB', [
      ['Drafted QB', 450],
      ['QB One', 400],
      ['QB Two', 250],
      ['QB Three', 200],
    ]);
    addPlayers('RB', [
      ['RB One', 360],
      ['RB Two', 340],
      ['RB Three', 280],
      ['RB Four', 270],
      ['RB Five', 240],
    ]);
    addPlayers('WR', [
      ['WR One', 380],
      ['Drafted WR', 360],
      ['WR Three', 350],
      ['WR Four', 300],
      ['WR Five', 260],
    ]);
    addPlayers('TE', [
      ['TE One', 270],
      ['TE Two', 260],
      ['TE Three', 240],
      ['TE Four', 230],
    ]);

    const guidance = reportEvidenceGuidance(draftLeague, 'draft-review', projections);
    expect(guidance).toContain('Flex, receiver-flex, and superflex replacement slots');
    expect(guidance).toContain('+60.0 projected points versus WR replacement (300.0)');
    expect(guidance).toContain('+50.0 projected points versus QB replacement (400.0)');
    expect(guidance).toContain('projected surplus versus positional replacement by team');
  });

  it('keeps supported position baselines when a projection source omits kicker and defense', () => {
    const draftLeague: LeagueConnection = {
      ...league,
      settings: { roster_positions: ['QB', 'WR', 'K', 'DST'] },
      draft: {
        id: 'draft-partial-source',
        picks: [{ playerId: 'wr-one', playerName: 'WR One', position: 'WR', pickNumber: 1 }],
      },
    };
    const projections: PlayerProjection[] = [220, 180, 160, 140].map((projectedPoints, index) => ({
      id: `wr-${index}`,
      leagueId: 'x',
      ...(index === 0 ? { playerId: 'wr-one' } : {}),
      playerName: `WR ${index + 1}`,
      position: 'WR',
      projectedPoints,
      sourceName: 'Owner CSV',
      scoringMatched: true,
      importedAt: '2026-09-01T00:00:00.000Z',
    }));

    const guidance = reportEvidenceGuidance(draftLeague, 'draft-review', projections);
    expect(guidance).toContain('+40.0 projected points versus WR replacement (180.0)');
  });

  it('withholds flex replacement evidence when an eligible position pool is missing', () => {
    const draftLeague: LeagueConnection = {
      ...league,
      settings: { roster_positions: ['WR', 'FLEX'] },
      draft: {
        id: 'draft-incomplete-flex-pool',
        picks: [{ playerId: 'wr-one', playerName: 'WR One', position: 'WR', pickNumber: 1 }],
      },
    };
    const projections: PlayerProjection[] = [220, 180, 160].map((projectedPoints, index) => ({
      id: `wr-${index}`,
      leagueId: 'x',
      ...(index === 0 ? { playerId: 'wr-one' } : {}),
      playerName: `WR ${index + 1}`,
      position: 'WR',
      projectedPoints,
      sourceName: 'Owner CSV',
      scoringMatched: true,
      importedAt: '2026-09-01T00:00:00.000Z',
    }));

    const guidance = reportEvidenceGuidance(draftLeague, 'draft-review', projections);
    expect(guidance).not.toContain('projected points versus WR replacement');
    expect(guidance).toContain('Flex, receiver-flex, and superflex replacement slots');
  });

  it('summarizes team projected surplus only when every logged pick has comparable evidence', () => {
    const draftLeague: LeagueConnection = {
      ...league,
      teamCount: 2,
      settings: { roster_positions: ['WR', 'WR'] },
      draft: {
        id: 'draft-1',
        status: 'complete',
        picks: [
          { playerId: 'p1', playerName: 'Player One', position: 'WR', pickNumber: 1, teamId: '1' },
          { playerId: 'p2', playerName: 'Player Two', position: 'WR', pickNumber: 2, teamId: '2' },
        ],
      },
    };
    const projections: PlayerProjection[] = [
      {
        id: '1',
        leagueId: 'x',
        playerId: 'p1',
        playerName: 'Player One',
        position: 'WR',
        projectedPoints: 220,
        sourceName: 'Owner CSV',
        scoringMatched: true,
        importedAt: '2026-09-01T00:00:00.000Z',
      },
      {
        id: '2',
        leagueId: 'x',
        playerId: 'p2',
        playerName: 'Player Two',
        position: 'WR',
        projectedPoints: 180,
        sourceName: 'Owner CSV',
        scoringMatched: true,
        importedAt: '2026-09-01T00:00:00.000Z',
      },
      {
        id: '3',
        leagueId: 'x',
        playerName: 'Player Three',
        position: 'WR',
        projectedPoints: 160,
        sourceName: 'Owner CSV',
        scoringMatched: true,
        importedAt: '2026-09-01T00:00:00.000Z',
      },
      {
        id: '4',
        leagueId: 'x',
        playerName: 'Player Four',
        position: 'WR',
        projectedPoints: 140,
        sourceName: 'Owner CSV',
        scoringMatched: true,
        importedAt: '2026-09-01T00:00:00.000Z',
      },
    ];

    const guidance = reportEvidenceGuidance(draftLeague, 'draft-review', projections);
    expect(guidance).toContain('projected surplus versus positional replacement by team');
    expect(guidance).toContain('"B" +80.0 points across 1 picks');
    expect(guidance).toContain('"A" +40.0 points across 1 picks');
  });

  it('uses a three-source median ADP and withholds it when source coverage is incomplete', () => {
    const draftLeague: LeagueConnection = {
      ...league,
      teamCount: 2,
      settings: { roster_positions: ['WR'] },
      draft: {
        id: 'draft-median',
        status: 'complete',
        picks: [
          { playerId: 'p1', playerName: 'Player One', position: 'WR', pickNumber: 1, teamId: '1' },
          { playerId: 'p2', playerName: 'Player Two', position: 'WR', pickNumber: 2, teamId: '2' },
        ],
      },
    };
    const rows: Array<{
      sourceId: string;
      sourceName: string;
      scoringMatched: boolean;
      importedAt: string;
      playerId: string;
      playerName: string;
      projectedPoints: number;
      adp: number;
    }> = [
      {
        sourceId: 'a',
        sourceName: 'Source A',
        scoringMatched: true,
        importedAt: '2026-09-03',
        playerId: 'p1',
        playerName: 'Player One',
        projectedPoints: 220,
        adp: 1.5,
      },
      {
        sourceId: 'a',
        sourceName: 'Source A',
        scoringMatched: true,
        importedAt: '2026-09-03',
        playerId: 'p2',
        playerName: 'Player Two',
        projectedPoints: 180,
        adp: 5.5,
      },
      {
        sourceId: 'a',
        sourceName: 'Source A',
        scoringMatched: true,
        importedAt: '2026-09-03',
        playerId: 'p3',
        playerName: 'Replacement One',
        projectedPoints: 160,
        adp: 80,
      },
      {
        sourceId: 'a',
        sourceName: 'Source A',
        scoringMatched: true,
        importedAt: '2026-09-03',
        playerId: 'p4',
        playerName: 'Replacement Two',
        projectedPoints: 140,
        adp: 100,
      },
      {
        sourceId: 'b',
        sourceName: 'Source B',
        scoringMatched: true,
        importedAt: '2026-09-02',
        playerId: 'p1',
        playerName: 'Player One',
        projectedPoints: 215,
        adp: 5.5,
      },
      {
        sourceId: 'b',
        sourceName: 'Source B',
        scoringMatched: true,
        importedAt: '2026-09-02',
        playerId: 'p2',
        playerName: 'Player Two',
        projectedPoints: 185,
        adp: 2.5,
      },
      {
        sourceId: 'c',
        sourceName: 'Source C',
        scoringMatched: true,
        importedAt: '2026-09-01',
        playerId: 'p1',
        playerName: 'Player One',
        projectedPoints: 225,
        adp: 3.5,
      },
      {
        sourceId: 'c',
        sourceName: 'Source C',
        scoringMatched: true,
        importedAt: '2026-09-01',
        playerId: 'p2',
        playerName: 'Player Two',
        projectedPoints: 175,
        adp: 4.5,
      },
    ];
    const projections: PlayerProjection[] = rows.map((row, index) => ({
      id: `projection-${index}`,
      leagueId: 'x',
      sourceId: row.sourceId,
      sourceName: row.sourceName,
      scoringMatched: row.scoringMatched,
      importedAt: `${row.importedAt}T00:00:00.000Z`,
      playerId: row.playerId,
      playerName: row.playerName,
      position: 'WR',
      projectedPoints: row.projectedPoints,
      averageDraftPosition: row.adp,
    }));

    const guidance = reportEvidenceGuidance(draftLeague, 'draft-review', projections);
    expect(guidance).toContain('median ADP from 3 sources');
    expect(guidance).toContain('selected 2.5 picks earlier than the 3.5 median ADP');
    expect(guidance).toContain('Team-level ADP timing across all logged picks');
    expect(guidance).toContain('tentative team process grades');

    const incomplete = reportEvidenceGuidance(draftLeague, 'draft-review', projections.slice(0, 6));
    expect(incomplete).not.toContain('median ADP from 3 sources');
    expect(incomplete).toContain('three-source ADP matches');
  });

  it('does not use imported projection totals without owner confirmation of league scoring', () => {
    const draftGuidance = reportEvidenceGuidance(
      {
        ...league,
        draft: {
          id: 'draft-scoring-unknown',
          picks: [{ playerId: 'p1', playerName: 'Player One', pickNumber: 1 }],
        },
      },
      'draft-review',
      [
        {
          id: 'projection-unconfirmed',
          leagueId: 'x',
          sourceId: 'source-unconfirmed',
          scoringMatched: false,
          playerId: 'p1',
          playerName: 'Player One',
          position: 'RB',
          projectedPoints: 250,
          sourceName: 'External CSV',
          importedAt: '2026-09-01T00:00:00.000Z',
        },
      ],
    );
    expect(draftGuidance).toContain(
      'none is confirmed by the owner as matching this league’s scoring',
    );
    expect(draftGuidance).not.toContain('250.0');

    const matchupGuidance = reportEvidenceGuidance(
      {
        ...league,
        teams: [
          { id: '1', name: 'Alpha' },
          { id: '2', name: 'Beta' },
        ],
        matchups: [
          {
            week: 4,
            teams: [
              { teamId: '1', starters: ['p1'] },
              { teamId: '2', starters: ['p2'] },
            ],
          },
        ],
      },
      'matchup-preview',
      [
        {
          id: 'weekly-unconfirmed',
          leagueId: 'x',
          sourceId: 'weekly-source-unconfirmed',
          scoringMatched: false,
          playerId: 'p1',
          playerName: 'Player One',
          projectedPoints: 28,
          week: 4,
          sourceName: 'External weekly CSV',
          importedAt: '2026-09-01T00:00:00.000Z',
        },
      ],
    );
    expect(matchupGuidance).toContain(
      'none is confirmed by the owner as matching this league’s scoring',
    );
    expect(matchupGuidance).not.toContain('28.0');
  });

  it('drops invalid scoring values from provider data', () => {
    expect(
      normalizeScoring({
        rec: 1,
        bad: '2',
        nan: Number.NaN,
        'unsafe\nlabel': 4,
        ['x'.repeat(121)]: 5,
      }),
    ).toEqual({ rec: 1 });
  });

  it('limits saved news sources to the supported feed identifiers', () => {
    expect(normalizeNewsSources(undefined)).toEqual(defaultNewsSources);
    expect(normalizeNewsSources(['pff', 'espn', 'fox', 'pff', 'https://example.test/rss'])).toEqual(
      ['pff', 'espn', 'fox'],
    );
    expect(normalizeNewsSources([])).toEqual([]);
  });

  it('schedules review-only offseason and weekly reports by default', () => {
    expect(
      defaultActionSettings
        .filter((action) => action.schedule.enabled)
        .map((action) => action.kind),
    ).toEqual(['offseason-update', 'power-rankings', 'matchup-preview']);
    expect(defaultActionSettings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'offseason-update',
          mode: 'draft',
          channel: 'dashboard',
          schedule: expect.objectContaining({ enabled: true, frequency: 'monthly', dayOfMonth: 1 }),
        }),
        expect.objectContaining({
          kind: 'power-rankings',
          mode: 'draft',
          schedule: expect.objectContaining({ enabled: true, frequency: 'weekly', weekday: 2 }),
        }),
        expect.objectContaining({
          kind: 'matchup-preview',
          mode: 'draft',
          schedule: expect.objectContaining({ enabled: true, frequency: 'weekly', weekday: 3 }),
        }),
        expect.objectContaining({
          kind: 'draft-hype',
          schedule: expect.objectContaining({ enabled: false }),
        }),
        expect.objectContaining({
          kind: 'draft-review',
          schedule: expect.objectContaining({ enabled: false }),
        }),
      ]),
    );
  });

  it('normalizes and preserves completed league calendar events by stable identity', () => {
    const event = {
      id: 'c10f595f-c3fd-4bc8-9d08-183cdd533122',
      leagueId: 'league-a',
      title: 'Draft night',
      kind: 'draft-hype' as const,
      date: '2026-08-25',
      time: '19:00',
      timezone: 'America/New_York',
    };
    const previous = { ...event, completedAt: '2026-08-25T23:00:00.000Z' };
    expect(isValidLeagueCalendarEvent(event)).toBe(true);
    expect(isValidLeagueCalendarEvent({ ...event, date: '2026-03-08', time: '02:30' })).toBe(false);
    expect(isValidLeagueCalendarEvent({ ...event, date: '2026-03-08', time: '03:30' })).toBe(true);
    expect(isValidLeagueCalendarEvent({ ...event, date: '2026-11-01', time: '01:30' })).toBe(true);
    expect(
      normalizeLeagueCalendarEvents([event, event, { ...event, timezone: 'Bad/Zone' }]),
    ).toEqual([event]);
    expect(normalizeLeagueCalendarEvents([event], new Set(['league-b']))).toEqual([]);
    expect(preserveCompletedCalendarEvents([event], [previous])).toEqual([previous]);
    expect(
      preserveCompletedCalendarEvents([{ ...event, time: '20:00' }], [previous])[0]?.completedAt,
    ).toBeUndefined();
  });

  it('converts platform draft instants into the selected local date and time', () => {
    expect(localDateTimeInTimezone('2026-08-20T23:30:00.000Z', 'America/New_York')).toEqual({
      date: '2026-08-20',
      time: '19:30',
    });
    expect(localDateTimeInTimezone('2026-08-20T23:30:00.000Z', 'Asia/Tokyo')).toEqual({
      date: '2026-08-21',
      time: '08:30',
    });
    expect(localDateTimeInTimezone('not-a-date', 'UTC')).toBeUndefined();
    expect(localDateTimeInTimezone('2026-08-20T23:30:00.000Z', 'Bad/Timezone')).toBeUndefined();
  });

  it('adds calendar days across month and year boundaries without timezone arithmetic', () => {
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addCalendarDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addCalendarDays('2026-02-30', 1)).toBeUndefined();
    expect(addCalendarDays('2026-03-08', 1.5)).toBeUndefined();
  });

  it('suggests draft hype at the platform time and review the next local calendar day', () => {
    expect(
      platformDraftCalendarSuggestions('2026-08-20T23:30:00.000Z', 'America/New_York'),
    ).toEqual({
      draftHype: { date: '2026-08-20', time: '19:30' },
      postDraftReview: { date: '2026-08-21', time: '09:00' },
    });
    expect(platformDraftCalendarSuggestions('2026-08-20T23:30:00.000Z', 'Bad/Timezone')).toBe(
      undefined,
    );
    expect(platformDraftCalendarSuggestions('invalid', 'UTC')).toBeUndefined();
  });

  it('upgrades legacy actions with safe schedule defaults and validates saved fields', () => {
    const actions = normalizeActionSettings([
      { kind: 'power-rankings', enabled: true, mode: 'draft', channel: 'dashboard' },
      {
        kind: 'draft-hype',
        enabled: true,
        mode: 'automatic',
        channel: 'email',
        schedule: {
          enabled: true,
          frequency: 'daily',
          weekday: 9,
          time: '30:00',
          timezone: 'Not/AZone',
        },
      },
    ]);

    expect(actions.find((action) => action.kind === 'power-rankings')?.schedule).toMatchObject({
      enabled: true,
      frequency: 'weekly',
      weekday: 2,
      time: '09:00',
    });
    expect(actions.find((action) => action.kind === 'draft-hype')?.schedule).toMatchObject({
      enabled: true,
      frequency: 'daily',
      weekday: 2,
      time: '09:00',
    });
    expect(actions.find((action) => action.kind === 'draft-hype')?.schedule.timezone).not.toBe(
      'Not/AZone',
    );
  });

  it('preserves all-league defaults and cleans explicit scheduled league targets', () => {
    const actions = normalizeActionSettings([
      { kind: 'power-rankings', channel: 'dashboard', enabled: true, mode: 'draft' },
      {
        kind: 'matchup-preview',
        channel: 'dashboard',
        enabled: true,
        mode: 'draft',
        leagueIds: ['league-a', 'league-a', '', 7, 'league-b'],
      },
    ]);

    expect(actions.find((action) => action.kind === 'power-rankings')?.leagueIds).toBeUndefined();
    expect(actions.find((action) => action.kind === 'matchup-preview')?.leagueIds).toEqual([
      'league-a',
      'league-b',
    ]);
  });

  it('resolves scheduled league targets while retaining legacy all-league behavior', () => {
    const leagues = [
      league,
      { ...league, id: 'league-b', name: 'Second', displayName: 'Second League' },
    ];
    const action = structuredClone(defaultActionSettings[0]!);

    expect(leaguesForAction(action, leagues)).toEqual(leagues);
    expect(
      leaguesForAction({ ...action, leagueIds: ['league-b', 'removed-league'] }, leagues),
    ).toEqual([leagues[1]]);
    expect(leaguesForAction({ ...action, leagueIds: [] }, leagues)).toEqual([]);
  });

  it('preserves a valid one-off local event and drops an invalid calendar date', () => {
    const actions = normalizeActionSettings([
      {
        kind: 'draft-hype',
        enabled: true,
        mode: 'draft',
        channel: 'dashboard',
        schedule: {
          enabled: true,
          frequency: 'once',
          date: '2026-10-01',
          time: '19:30',
          timezone: 'America/New_York',
          completedAt: '2026-09-25T15:00:00.000Z',
        },
      },
      {
        kind: 'draft-review',
        enabled: true,
        mode: 'draft',
        channel: 'dashboard',
        schedule: {
          enabled: true,
          frequency: 'once',
          date: '2026-02-30',
          time: '19:30',
          timezone: 'UTC',
        },
      },
    ]);

    expect(actions.find((action) => action.kind === 'draft-hype')?.schedule).toMatchObject({
      frequency: 'once',
      date: '2026-10-01',
      timezone: 'America/New_York',
      completedAt: '2026-09-25T15:00:00.000Z',
    });
    expect(actions.find((action) => action.kind === 'draft-review')?.schedule.frequency).toBe(
      'weekly',
    );
  });
});

describe('schedule recommendations', () => {
  it('suggests weekly rankings and matchup timing without changing channel, scope, or send policy', () => {
    const actions = defaultActionSettings.map((action) => ({
      ...action,
      enabled: action.kind === 'power-rankings',
      mode: action.kind === 'power-rankings' ? ('automatic' as const) : ('draft' as const),
      channel: action.kind === 'power-rankings' ? ('email' as const) : ('dashboard' as const),
      ...(action.kind === 'power-rankings' ? { leagueIds: ['league-a'] } : {}),
      schedule: {
        ...action.schedule,
        timezone: 'America/New_York',
        frequency:
          action.kind === 'matchup-preview' ? ('once' as const) : action.schedule.frequency,
        ...(action.kind === 'matchup-preview'
          ? { date: '2026-10-01', completedAt: '2026-09-30T10:00:00Z' }
          : {}),
      },
    }));

    const recommended = applyScheduleRecommendations(actions);
    const rankings = recommended.find((action) => action.kind === 'power-rankings')!;
    const matchup = recommended.find((action) => action.kind === 'matchup-preview')!;
    const offseason = recommended.find((action) => action.kind === 'offseason-update')!;

    expect(rankings.schedule).toMatchObject({
      enabled: true,
      frequency: 'weekly',
      weekday: scheduleRecommendations['power-rankings']!.weekday,
      time: '09:00',
      timezone: 'America/New_York',
    });
    expect(rankings).toMatchObject({
      enabled: true,
      mode: 'automatic',
      channel: 'email',
      leagueIds: ['league-a'],
    });
    expect(matchup.schedule).toMatchObject({
      enabled: true,
      frequency: 'weekly',
      weekday: scheduleRecommendations['matchup-preview']!.weekday,
      time: '09:00',
      timezone: 'America/New_York',
    });
    expect(matchup.schedule).not.toHaveProperty('date');
    expect(matchup.schedule).not.toHaveProperty('completedAt');
    expect(offseason.schedule).toMatchObject({
      enabled: true,
      frequency: 'monthly',
      dayOfMonth: scheduleRecommendations['offseason-update']!.dayOfMonth,
      time: '09:00',
      timezone: 'America/New_York',
    });
    expect(offseason).toMatchObject({
      mode: 'draft',
      channel: 'dashboard',
    });
    expect(actions.find((action) => action.kind === 'matchup-preview')?.schedule.frequency).toBe(
      'once',
    );
  });
});
