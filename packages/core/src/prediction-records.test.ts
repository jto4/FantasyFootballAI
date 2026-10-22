import { expect, it } from 'vitest';
import {
  isPredictionRecord,
  settlePredictionRecord,
  predictionPerformance,
  capturePredictionRecords,
  recordClosingPrice,
  type PredictionRecord,
} from './prediction-records.js';
import { isAdviceOptions } from './advice-contracts.js';
import type { AdviceResult, FootballDataSnapshot } from './advice-types.js';
import type { SportsbookQuote, FinalFootballResult } from './sportsbook-types.js';
const game = {
  id: 'game',
  espnId: '401872994',
  season: 2026,
  week: 5,
  seasonType: 'REG',
  date: '2026-10-12',
  kickoffAt: '2026-10-13T00:15:00.000Z',
  home: 'LA',
  away: 'BUF',
};
const stamp = '2026-10-11T12:00:00.000Z',
  end = '2026-10-13T04:00:00.000Z';
const quote: SportsbookQuote = {
  id: 'a'.repeat(64),
  gameId: 'game',
  espnId: '401872994',
  sportsbook: 'Fictional book',
  providerId: '100',
  kind: 'spread',
  side: 'home',
  line: -3,
  americanOdds: -110,
  oppositeAmericanOdds: -110,
  observedAt: stamp,
  kickoffAt: game.kickoffAt,
  sourceUrl: 'https://www.espn.com/nfl/odds/_/gameId/401872994',
};
const record: PredictionRecord = {
  id: 'r',
  adviceId: 'advice',
  recordedAt: stamp,
  method: 'rolling-residual-v1',
  kind: 'bet',
  season: 2026,
  forecast: 0.65,
  baseline: 0.5,
  games: [game],
  selected: true,
  terms: {
    kind: 'spread',
    side: 'home',
    gameId: 'game',
    line: -3,
    americanOdds: -110,
    oppositeAmericanOdds: -110,
    quoteId: quote.id,
  },
  quote,
  status: 'pending',
};
const data: FootballDataSnapshot = {
  season: 2026,
  players: [],
  games: [game],
  market: [],
  sources: [{ id: 'stats-2026', name: 'Recorded stats', status: 'available', retrievedAt: end }],
  warnings: [],
};
const final: FinalFootballResult = {
  gameId: game.id,
  espnId: game.espnId,
  home: game.home,
  away: game.away,
  kickoffAt: game.kickoffAt,
  homeScore: 24,
  awayScore: 17,
  observedAt: end,
  sourceUrl: 'https://www.espn.com/nfl/game/_/gameId/401872994',
};
it('settles only unique verified final identities, and computes exact win/loss/push net returns', () => {
  expect(isPredictionRecord(record)).toBe(true);
  expect(settlePredictionRecord(record, data, [], end)).toEqual(record);
  expect(settlePredictionRecord(record, data, [final, final], end)).toEqual(record);
  expect(settlePredictionRecord(record, data, [{ ...final, home: 'NYJ' }], end)).toEqual(record);
  const won = settlePredictionRecord(record, data, [final], end);
  expect(won.actual).toBe(1);
  expect(won.profitUnits).toBe(100 / 110);
  expect(isPredictionRecord(won)).toBe(true);
  expect(settlePredictionRecord(record, data, [{ ...final, awayScore: 21 }], end)).toMatchObject({
    actual: 0,
    profitUnits: 0,
  });
  expect(settlePredictionRecord(record, data, [{ ...final, awayScore: 25 }], end)).toMatchObject({
    actual: -1,
    profitUnits: -1,
  });
  expect(settlePredictionRecord(won, data, [{ ...final, awayScore: 25 }], end)).toEqual(won);
});
it('withholds missing or incomplete player scoring instead of marking DNP as zero', () => {
  const fantasy: PredictionRecord = {
    id: 'f',
    adviceId: 'a',
    recordedAt: stamp,
    method: 'public-projection-v1',
    kind: 'fantasy',
    season: 2026,
    forecast: 15,
    games: [game],
    selected: false,
    scope: 'week',
    player: {
      id: 'p',
      gsisId: '00-0040123',
      name: 'Example Receiver',
      position: 'WR',
      team: 'LA',
      platform: 'sleeper',
      scoring: { rec: 1, rec_yd: 0.1 },
    },
    status: 'pending',
  };
  expect(isPredictionRecord(fantasy)).toBe(true);
  expect(settlePredictionRecord(fantasy, data, [final], end).status).toBe('missing');
  const row = {
    playerId: '00-0040123',
    name: 'Example Receiver',
    position: 'WR',
    team: 'LA',
    opponent: 'BUF',
    season: 2026,
    week: 5,
    seasonType: 'REG' as const,
    gameId: 'game',
    stats: { receptions: 5, receiving_yards: 70 },
  };
  expect(settlePredictionRecord(fantasy, { ...data, players: [row] }, [final], end)).toMatchObject({
    status: 'settled',
    actual: 12,
  });
  expect(
    settlePredictionRecord(
      fantasy,
      { ...data, players: [row], sources: [{ ...data.sources[0]!, retrievedAt: stamp }] },
      [final],
      end,
    ).status,
  ).toBe('missing');
  const settled = settlePredictionRecord(fantasy, { ...data, players: [row] }, [final], end);
  const other = {
    ...settled,
    id: 'other-league',
    player: { ...settled.player!, leagueId: 'second', leagueName: 'Second League' },
  };
  expect(predictionPerformance([settled, other]).groups).toHaveLength(2);
  expect(
    settlePredictionRecord(fantasy, { ...data, players: [row, row] }, [final], end).status,
  ).toBe('missing');
  expect(
    settlePredictionRecord(
      fantasy,
      { ...data, players: [{ ...row, stats: { receptions: 5 } }] },
      [final],
      end,
    ).status,
  ).toBe('missing');
});
it('rejects post-kickoff records, forged payouts, unknown fields and unsupported selected manual prices', () => {
  for (const bad of [
    { ...record, recordedAt: end },
    { ...record, forecast: 1.2 },
    { ...record, quote: undefined },
    { ...record, extra: 'field' },
    { ...record, status: 'settled', settledAt: end, actual: 1, profitUnits: 3 },
  ])
    expect(isPredictionRecord(bad)).toBe(false);
});
it('deduplicates retries without choosing predictions by their realized outcome and groups correlated ROI by week', () => {
  const first = settlePredictionRecord(record, data, [final], end),
    second = { ...first, id: 'r2', recordedAt: '2026-10-11T13:00:00Z', forecast: 0.9 };
  const p = predictionPerformance([second, first]);
  expect(p.groups[0]!.samples).toBe(1);
  expect(p.groups[0]!.brier).toBeCloseTo(0.1225);
  expect(p.paper.selections).toBe(1);
  expect(p.paper.netUnits).toBe(100 / 110);
  expect(p.paper.roiInterval).toBeUndefined();
});
it('never backfills forecasts from earlier createdAt or records a prediction once the game has started', () => {
  const result = {
    id: 'a',
    createdAt: stamp,
    model: 'Example AI',
    request: { mode: 'betting', bet: record.terms },
    assessment: { verdict: 'lean' },
    betHistory: { forecast: { method: 'rolling-residual-v1', probability: 0.65 } },
    players: [],
  } as unknown as AdviceResult;
  expect(capturePredictionRecords(result, data, undefined, [], end, quote)).toEqual([]);
  const records = capturePredictionRecords(result, data, undefined, [], stamp, quote);
  expect(records).toHaveLength(1);
  expect(records[0]!.recordedAt).toBe(stamp);
});
it('accepts the actual three saved/Claude/Codex connection choices without accepting duplicates', () => {
  const choices = [
    { id: 'saved', label: 'Saved', status: 'saved' },
    { id: 'claude-cli', label: 'Claude', status: 'signed-in' },
    { id: 'codex-cli', label: 'Codex', status: 'signed-in' },
  ];
  expect(
    isAdviceOptions({
      season: 2026,
      week: 5,
      players: [],
      games: [],
      warnings: [],
      model: 'model',
      connections: choices,
    }),
  ).toBe(true);
  expect(
    isAdviceOptions({
      season: 2026,
      week: 5,
      players: [],
      games: [],
      warnings: [],
      model: 'model',
      connections: [...choices, choices[0]],
    }),
  ).toBe(false);
});

it('records the closing price before kickoff and reports closing line value only for the same line', () => {
  const before = '2026-10-12T23:50:00.000Z';
  // The book moved to -130 at the same line: the -110 taken beat the close.
  const closed = recordClosingPrice(
    record,
    [{ ...quote, americanOdds: -130, oppositeAmericanOdds: 110, observedAt: before }],
    before,
  );
  expect(closed.closing).toMatchObject({ americanOdds: -130, oppositeAmericanOdds: 110, line: -3 });
  expect(closed.closing!.clv).toBeGreaterThan(0);
  expect(isPredictionRecord(closed)).toBe(true);
  // A moved line is recorded, but its value is not comparable.
  const moved = recordClosingPrice(record, [{ ...quote, line: -4.5 }], before);
  expect(moved.closing!.line).toBe(-4.5);
  expect(moved.closing!.clv).toBeUndefined();
  // Other books, settled records and forged closing values are ignored or rejected.
  expect(recordClosingPrice(record, [{ ...quote, providerId: '200' }], before)).toBe(record);
  expect(
    recordClosingPrice({ ...record, status: 'settled' }, [quote], before).closing,
  ).toBeUndefined();
  expect(isPredictionRecord({ ...closed, closing: { ...closed.closing!, clv: 3 } })).toBe(false);
  expect(isPredictionRecord({ ...closed, closing: { ...closed.closing!, extra: 1 } })).toBe(false);
  const performance = predictionPerformance([settlePredictionRecord(closed, data, [final], end)]);
  expect(performance.paper.closingLineValue).toMatchObject({ samples: 1, beatClose: 1 });
  expect(performance.paper.byWeek).toEqual([{ season: 2026, week: 5, netUnits: 100 / 110 }]);
});
