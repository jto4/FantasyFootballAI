import { expect, it } from 'vitest';
import {
  adviceJournal,
  isAdviceJournalReport,
  isDecisionSnapshot,
  captureDecisionSnapshot,
  type DecisionSnapshot,
} from './advice-journal.js';
import { isPredictionRecord, type PredictionRecord } from './prediction-records.js';
import type { AdviceResult } from './advice-types.js';
import type { LeagueConnection } from './domain-types.js';
const capturedAt = '2026-10-11T12:00:00.000Z';
const snapshot: DecisionSnapshot = {
  version: 1,
  mode: 'lineup',
  adviceId: 'a',
  leagueId: 'l',
  teamId: 't',
  capturedAt,
  ownershipIds: ['p', 'q'],
  chosenIds: ['p'],
  baselineIds: ['q'],
  baselineLabel: 'Recorded starters',
  scope: 'week',
};
function fantasy(id: string, actual?: number): PredictionRecord {
  return {
    id: `a:fantasy:${id}`,
    adviceId: 'a',
    recordedAt: capturedAt,
    method: 'imported',
    workflow: 'lineup',
    kind: 'fantasy',
    season: 2026,
    forecast: id === 'p' ? 20 : 15,
    games: [
      {
        id: 'g',
        season: 2026,
        week: 5,
        seasonType: 'REG',
        date: '2026-10-12',
        kickoffAt: '2026-10-13T00:15:00.000Z',
        home: 'BUF',
        away: 'LA',
      },
    ],
    selected: false,
    scope: 'week',
    player: {
      id,
      name: id,
      position: 'QB',
      team: 'BUF',
      leagueId: 'l',
      platform: 'sleeper',
      scoring: { pass_yd: 0.04 },
    },
    status: actual === undefined ? 'pending' : 'settled',
    ...(actual === undefined ? {} : { actual, settledAt: '2026-10-14T00:00:00.000Z' }),
  };
}
it('freezes complete legal starters and preserves hypothetical gains without converting missing appearances to zero', () => {
  const p = fantasy('p', 12),
    q = fantasy('q', 18);
  p.decision = snapshot;
  expect(isPredictionRecord(p)).toBe(true);
  const report = adviceJournal([p, q]);
  expect(isAdviceJournalReport(report)).toBe(true);
  expect(report.decisions[0]).toMatchObject({
    status: 'settled',
    projectedChange: 5,
    actualChange: -6,
  });
  expect(adviceJournal([p]).decisions[0]).toMatchObject({ status: 'missing' });
  const pending = fantasy('q');
  expect(adviceJournal([p, pending]).decisions[0]).toMatchObject({ status: 'pending' });
  expect(adviceJournal([p, pending]).decisions[0]?.actualChange).toBeUndefined();
  expect(adviceJournal([p, q, structuredClone(q)]).projections[0]?.samples).toBe(2);
  const different = fantasy('q', 18);
  different.player = { ...different.player!, leagueId: 'other', scoring: { pass_yd: 0.1 } };
  expect(adviceJournal([p, different]).projections).toHaveLength(2);
  expect(
    isPredictionRecord({ ...p, decision: { ...snapshot, capturedAt: '2026-10-11T13:00:00Z' } }),
  ).toBe(false);
  expect(isDecisionSnapshot({ ...snapshot, chosenIds: ['p', 'p'] })).toBe(false);
});
it('captures a real baseline only when recorded starters form a complete legal lineup', () => {
  const players = ['p', 'q'].map((id, i) => ({
    id,
    name: id,
    position: 'QB',
    team: 'BUF',
    projectedPoints: 20 - i * 5,
    projectionScope: 'week' as const,
    projectionSourceIds: [],
    metrics: [],
    historicalPoints: [],
    warnings: [],
  }));
  const league: LeagueConnection = {
    id: 'l',
    platform: 'sleeper',
    name: 'League',
    displayName: 'League',
    teamCount: 1,
    scoring: {},
    settings: { roster_positions: ['QB', 'BN'] },
    connectedAt: capturedAt,
    teams: [
      {
        id: 't',
        name: 'Team',
        roster: players.map((p) => ({ id: p.id, name: p.name, position: p.position })),
      },
    ],
    matchups: [{ week: 5, teams: [{ teamId: 't', starters: ['q'] }] }],
  };
  const result = {
    id: 'a',
    week: 5,
    request: { mode: 'lineup', teamId: 't' },
    assessment: { verdict: 'recommend', recommendedPlayerIds: ['p'] },
    players,
    lineup: {
      complete: true,
      assignments: [{ slot: 'QB', playerId: 'p', points: 20 }],
      points: 20,
      missingSlots: [],
      warnings: [],
    },
  } as unknown as AdviceResult;
  expect(captureDecisionSnapshot(result, league, capturedAt)).toMatchObject({
    chosenIds: ['p'],
    baselineIds: ['q'],
  });
  league.matchups = [];
  expect(captureDecisionSnapshot(result, league, capturedAt)).toBeUndefined();
});
it('separates frozen code cohorts and markets, excludes stale/manual/unversioned records, and requires eight weeks for uncertainty', () => {
  const method = 'market-context-v3',
    sourceHash = 'a'.repeat(64);
  const records: PredictionRecord[] = Array.from({ length: 8 }, (_, i) => ({
    id: `bet${i}`,
    adviceId: `advice${i}`,
    recordedAt: capturedAt,
    method,
    kind: 'bet',
    season: 2026,
    forecast: 0.6,
    baseline: 0.5,
    protocol: {
      id: `${method}:${sourceHash}`,
      sourceHash,
      registeredAt: capturedAt,
      baseline: 'same-quote-no-vig',
      minimumWeeks: 8,
    },
    games: [
      {
        id: `g${i}`,
        espnId: '401872994',
        season: 2026,
        week: i + 1,
        seasonType: 'REG',
        date: '2026-10-12',
        kickoffAt: '2026-10-13T00:15:00.000Z',
        home: 'BUF',
        away: 'LA',
      },
    ],
    selected: false,
    terms: {
      gameId: `g${i}`,
      kind: 'total',
      side: 'over',
      line: 45.5,
      americanOdds: -110,
      oppositeAmericanOdds: -110,
      quoteId: 'b'.repeat(64),
    },
    quote: {
      id: 'b'.repeat(64),
      gameId: `g${i}`,
      espnId: '401872994',
      sportsbook: 'Fixture book',
      providerId: '100',
      kind: 'total',
      side: 'over',
      line: 45.5,
      americanOdds: -110,
      oppositeAmericanOdds: -110,
      observedAt: capturedAt,
      kickoffAt: '2026-10-13T00:15:00.000Z',
      sourceUrl: 'https://www.espn.com/nfl/odds/_/gameId/401872994',
    },
    status: 'settled',
    actual: i % 2 ? 1 : -1,
    settledAt: '2026-10-14T00:00:00.000Z',
  }));
  expect(records.every(isPredictionRecord)).toBe(true);
  expect(adviceJournal(records.slice(0, 7)).experiments[0]?.interval).toBeUndefined();
  const report = adviceJournal(records);
  expect(isAdviceJournalReport(report)).toBe(true);
  expect(report.experiments[0]).toMatchObject({
    samples: 8,
    weeks: 8,
    brier: 0.26,
    baselineBrier: 0.25,
  });
  expect(report.experiments[0]?.interval).toHaveLength(2);
  const legacy = { ...records[0]! };
  delete legacy.protocol;
  const stale = {
    ...records[0]!,
    quote: { ...records[0]!.quote!, observedAt: '2026-10-10T00:00:00Z' },
  };
  expect(adviceJournal([legacy, stale]).excludedBetRecords).toBe(2);
  expect(adviceJournal([{ ...records[0]!, baseline: 0.8 }]).experiments).toEqual([]);
  expect(
    isPredictionRecord({
      ...records[0]!,
      protocol: { ...records[0]!.protocol!, registeredAt: '2026-10-12T00:00:00Z' },
    }),
  ).toBe(false);
});
