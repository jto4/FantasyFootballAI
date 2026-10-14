import { expect, it } from 'vitest';
import {
  isAdviceRequest,
  isAdviceMetric,
  isAdviceOptions,
  isAdviceAssessment,
  renderAdviceStatement,
  validateAdviceAssessment,
} from './advice-contracts.js';
import type { AdviceAssessment, AdviceMetric } from './advice-types.js';
const metric: AdviceMetric = {
  id: 'computed',
  label: 'Estimate',
  value: 12.25,
  unit: 'points',
  sourceIds: ['source'],
};
const statement = {
  text: 'Evidence is {{computed}}.',
  metricIds: ['computed'],
  sourceIds: ['source'],
};
const answer: AdviceAssessment = {
  verdict: 'lean',
  headline: 'Consider the player',
  recommendedPlayerIds: ['player'],
  reasons: [statement],
  risks: [{ text: 'Availability may change.', metricIds: [], sourceIds: [] }],
  alternative: { text: 'Keep the current roster.', metricIds: [], sourceIds: [] },
  perception: {
    tone: 'unknown',
    text: 'No representative sentiment sample is available.',
    metricIds: [],
    sourceIds: [],
  },
};
it('validates explicit trade horizons without allowing them on unrelated decisions', () => {
  const request = { mode: 'trade', leagueId: 'league', teamId: 'mine', week: 5, throughWeek: 17 };
  expect(isAdviceRequest(request)).toBe(true);
  for (const throughWeek of [4, 19, 17.5, '17'])
    expect(isAdviceRequest({ ...request, throughWeek })).toBe(false);
  expect(isAdviceRequest({ ...request, mode: 'lineup' })).toBe(false);
});
it('requires at least two distinct players for a focused start/sit request', () => {
  const request = { mode: 'lineup', leagueId: 'league', teamId: 'mine' };
  expect(isAdviceRequest(request)).toBe(true);
  expect(isAdviceRequest({ ...request, candidateIds: ['wr', 'bench'] })).toBe(true);
  for (const candidateIds of [
    [],
    ['wr'],
    ['wr', 'wr'],
    Array.from({ length: 21 }, (_, index) => `p-${index}`),
  ])
    expect(isAdviceRequest({ ...request, candidateIds })).toBe(false);
});
it('keeps old request/options compatibility and validates analysis-local connection choices', () => {
  const request = { mode: 'lineup', leagueId: 'league', teamId: 'team', week: 5 };
  const options = {
    season: 2026,
    week: 5,
    model: 'saved-model',
    players: [],
    games: [],
    warnings: [],
  };
  expect(isAdviceRequest(request)).toBe(true);
  expect(isAdviceOptions(options)).toBe(true);
  for (const connection of ['saved', 'claude-cli', 'codex-cli']) {
    expect(isAdviceRequest({ ...request, connection })).toBe(true);
    expect(isAdviceOptions({ ...options, connection })).toBe(true);
  }
  for (const connection of ['invented', ['claude-cli'], { id: 'claude-cli' }, null]) {
    expect(isAdviceRequest({ ...request, connection })).toBe(false);
    expect(isAdviceOptions({ ...options, connection })).toBe(false);
  }
  const entry = { id: 'claude-cli', label: 'Signed-in Claude', status: 'signed-in' };
  expect(isAdviceOptions({ ...options, connections: [entry] })).toBe(true);
  for (const connections of [
    [entry, entry],
    [{ ...entry, id: ['claude-cli'] }],
    [{ ...entry, status: ['signed-in'] }],
    [{ ...entry, status: 'secret-account-detail' }],
  ])
    expect(isAdviceOptions({ ...options, connections })).toBe(false);
});
it('renders only verified numeric placeholders and rejects unsupported claims and references', () => {
  expect(validateAdviceAssessment(answer, [metric], ['source'], ['player'], false)).toEqual(answer);
  expect(renderAdviceStatement(statement, [metric])).toBe('Evidence is 12.25 points.');
  for (const reasons of [
    [{ ...statement, text: 'Win rate is 99 percent.' }],
    [{ ...statement, text: 'Win rate is {{invented}}.' }],
    [{ ...statement, text: 'See https://invented.test.' }],
    [{ ...statement, sourceIds: ['invented'] }],
    [{ ...statement, metricIds: ['invented'] }],
  ])
    expect(() =>
      validateAdviceAssessment({ ...answer, reasons }, [metric], ['source'], ['player'], false),
    ).toThrow();
  expect(() =>
    validateAdviceAssessment(
      { ...answer, recommendedPlayerIds: ['invented'] },
      [metric],
      ['source'],
      ['player'],
      false,
    ),
  ).toThrow();
});
it('renders adjacent repeated units once without changing distinct prose or metric values', () => {
  for (const [unit, suffix, expected] of [
    ['%', '%', '12.25 %.'],
    ['%', ' %', '12.25 %.'],
    ['points', ' points', '12.25 points.'],
    ['points/week', ' points/week', '12.25 points/week.'],
    ['targets', ' targets', '12.25 targets.'],
    ['games', ' games', '12.25 games.'],
    ['points [PPR]', ' points [PPR]', '12.25 points [PPR].'],
    ['points', ' points/game', '12.25 points points/game.'],
    ['points', ' points-based comparison', '12.25 points points-based comparison.'],
    ['points', '\npoints explain the comparison', '12.25 points\npoints explain the comparison.'],
  ] as const) {
    expect(
      renderAdviceStatement({ ...statement, text: `{{computed}}${suffix}.` }, [
        { ...metric, unit },
      ]),
    ).toBe(expected);
  }
  expect(
    renderAdviceStatement({ ...statement, text: '{{computed}} points versus {{other}}%.' }, [
      metric,
      { ...metric, id: 'other', value: 40, unit: '%' },
    ]),
  ).toBe('12.25 points versus 40 %.');
  expect(renderAdviceStatement({ ...statement, text: '{{missing}} points.' }, [metric])).toBe(
    'unavailable evidence points.',
  );
});
it('requires numeric support for recommendations and bounded betting-only forecasts', () => {
  const noNumbers = {
    ...answer,
    reasons: [{ text: 'Trust the player.', metricIds: [], sourceIds: [] }],
  };
  expect(() => validateAdviceAssessment(noNumbers, [], [], ['player'], false)).toThrow();
  expect(() =>
    validateAdviceAssessment(
      { ...answer, reasons: [{ ...statement, text: 'Trust this choice.' }] },
      [metric],
      ['source'],
      ['player'],
      false,
    ),
  ).toThrow('numerical support');
  const forecast = {
    probability: 0.6,
    lower: 0.4,
    upper: 0.8,
    rationale: { text: 'Uncalibrated judgment.', metricIds: [], sourceIds: [] },
  };
  expect(() =>
    validateAdviceAssessment({ ...answer, forecast }, [metric], ['source'], ['player'], false),
  ).toThrow();
  expect(
    validateAdviceAssessment({ ...answer, forecast }, [metric], ['source'], ['player'], true)
      .forecast,
  ).toEqual(forecast);
  expect(isAdviceAssessment({ ...answer, forecast: { ...forecast, lower: 0.7 } })).toBe(false);
  expect(() =>
    validateAdviceAssessment(
      { ...answer, verdict: 'recommend' },
      [metric],
      ['source'],
      ['player'],
      true,
    ),
  ).toThrow();
});
it('rejects extra model fields and coercible enum arrays', () => {
  expect(isAdviceAssessment({ ...answer, unsupported: 'Persist arbitrary data' })).toBe(false);
  expect(
    isAdviceAssessment({ ...answer, perception: { ...answer.perception, tone: ['unknown'] } }),
  ).toBe(false);
  expect(isAdviceAssessment({ ...answer, reasons: [{ ...statement, unsupported: 'extra' }] })).toBe(
    false,
  );
});
it('validates fantasy and sportsbook requests before any paid model call', () => {
  const request = { mode: 'lineup', leagueId: 'league', teamId: 'team', week: 5 };
  expect(isAdviceRequest(request)).toBe(true);
  expect(isAdviceRequest({ ...request, mode: ['lineup'] })).toBe(false);
  expect(isAdviceRequest({ ...request, unknown: true })).toBe(false);
  expect(isAdviceRequest({ ...request, candidateIds: ['a', 'a'] })).toBe(false);
  const bet = {
    kind: 'player-prop',
    gameId: 'game',
    playerId: 'gsis',
    stat: 'passing_yards',
    side: 'over',
    line: 250.5,
    americanOdds: -110,
  };
  expect(isAdviceRequest({ mode: 'betting', bet })).toBe(true);
  for (const change of [
    { americanOdds: 0 },
    { americanOdds: -99 },
    { americanOdds: 110.5 },
    { line: NaN },
    { stat: 'invented' },
    { side: ['over'] },
  ])
    expect(isAdviceRequest({ mode: 'betting', bet: { ...bet, ...change } })).toBe(false);
});

it('preserves bounded weekly D/ST source closure for a three-season cohort', () => {
  const sourceIds = Array.from({ length: 75 }, (_, i) => `dst-${i}`);
  expect(isAdviceMetric({ ...metric, sourceIds })).toBe(true);
  expect(isAdviceMetric({ ...metric, sourceIds: [...sourceIds, 'overflow'] })).toBe(false);
});

it('accepts a bounded waiver drop only for waiver requests and preserves legacy requests', () => {
  const request = { mode: 'waivers', leagueId: 'league', teamId: 'mine', candidateIds: ['free'] };
  expect(isAdviceRequest(request)).toBe(true);
  expect(isAdviceRequest({ ...request, dropPlayerId: 'owned' })).toBe(true);
  for (const dropPlayerId of ['', 'not an id', ['owned'], '../ path'])
    expect(isAdviceRequest({ ...request, dropPlayerId })).toBe(false);
  for (const mode of ['lineup', 'trade', 'draft-plan', 'draft-review', 'betting'])
    expect(isAdviceRequest({ ...request, mode, dropPlayerId: 'owned' })).toBe(false);
});
