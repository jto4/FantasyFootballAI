import { expect, it } from 'vitest';
import { adviceDecisionPolicy, enforceAdviceDecisionPolicy } from './advice-policy.js';
import type { AdviceAssessment, FantasyAdvicePlan, BetEvidence } from './advice-types.js';
import type { BetModelForecast } from './advice-types.js';
const answer: AdviceAssessment = {
  verdict: 'recommend',
  headline: 'Make this pick',
  recommendedPlayerIds: ['player'],
  reasons: [{ text: 'Comparison.', metricIds: [], sourceIds: [] }],
  risks: [{ text: 'Risk.', metricIds: [], sourceIds: [] }],
  alternative: { text: 'Wait.', metricIds: [], sourceIds: [] },
  perception: { tone: 'unknown', text: 'No sample.', metricIds: [], sourceIds: [] },
};
const plan: FantasyAdvicePlan = {
  mode: 'lineup',
  teamId: 'team',
  candidates: [{ playerId: 'player', value: 10, rationale: 'legal' }],
  players: [],
  metrics: [],
  confidence: {
    score: 60,
    label: 'Moderate',
    meaning: 'Evidence quality',
    factors: [
      { label: 'Relevant player/data coverage', score: 30, maximum: 30 },
      { label: 'Fresh league and source data', score: 20, maximum: 20 },
    ],
  },
  warnings: [],
};
const request = { mode: 'lineup' as const, leagueId: 'league', teamId: 'team' };
it('permits only a tentative bet when chronological support and the conservative price threshold both pass', () => {
  const forecast: BetModelForecast = {
    method: 'market-context-v3',
    estimate: 8,
    rawProbability: 0.75,
    probability: 0.75,
    lower: 0.65,
    upper: 0.85,
    pushRate: 0,
    residualSamples: 200,
    fresh: true,
    evaluation: {
      baselineKind: 'sportsbook',
      games: 150,
      weeks: 14,
      brier: 0.18,
      baselineBrier: 0.25,
      improvementLower: 0.02,
      calibrationSamples: 60,
      calibrationWeeks: 12,
      calibrationObserved: 0.75,
      calibrationPredicted: 0.73,
    },
  };
  const bet: BetEvidence = {
    wins: 9,
    losses: 3,
    pushes: 0,
    breakEvenRate: 0.52,
    metrics: [],
    warnings: [],
    forecast,
  };
  const betting = { mode: 'betting' as const };
  expect(adviceDecisionPolicy(betting, undefined, bet, []).maximumVerdict).toBe('lean');
  const missingBaseline = structuredClone(forecast);
  delete missingBaseline.evaluation.baselineKind;
  for (const invalid of [
    missingBaseline,
    { ...forecast, evaluation: { ...forecast.evaluation, baselineKind: 'frequency' as const } },
    { ...forecast, fresh: false },
    { ...forecast, lower: 0.5 },
    { ...forecast, pushRate: 1 },
    { ...forecast, evaluation: { ...forecast.evaluation, weeks: 11 } },
    { ...forecast, evaluation: { ...forecast.evaluation, improvementLower: -0.01 } },
    { ...forecast, evaluation: { ...forecast.evaluation, calibrationSamples: 10 } },
  ])
    expect(
      adviceDecisionPolicy(betting, undefined, { ...bet, forecast: invalid }, []).maximumVerdict,
    ).toBe('hold');
  expect(
    adviceDecisionPolicy(betting, undefined, bet, [
      {
        id: 'player',
        name: 'Player',
        position: 'WR',
        status: 'Questionable',
        metrics: [],
        projectionSourceIds: [],
        historicalPoints: [],
        warnings: [],
      },
    ]).maximumVerdict,
  ).toBe('hold');
});
it('limits weekly imported comparisons when injury availability is unknown or questionable', () => {
  const fresh = structuredClone(plan);
  fresh.players = [
    {
      id: 'player',
      name: 'Player',
      position: 'WR',
      projectionMethod: 'imported',
      projectedPoints: 10,
      projectionScope: 'week',
      projectionSourceIds: ['import'],
      metrics: [],
      historicalPoints: [],
      warnings: ['Injury availability: The matched report has no verified update date.'],
    },
  ];
  expect(adviceDecisionPolicy(request, fresh, undefined, fresh.players).maximumVerdict).toBe(
    'lean',
  );
  fresh.players[0]!.warnings = [];
  fresh.players[0]!.status = 'Questionable';
  expect(adviceDecisionPolicy(request, fresh, undefined, fresh.players).maximumVerdict).toBe(
    'lean',
  );
  delete fresh.players[0]!.status;
  expect(adviceDecisionPolicy(request, fresh, undefined, fresh.players).maximumVerdict).toBe(
    'recommend',
  );
});
it('withholds picks for missing comparisons and limits stale evidence without mutating model output', () => {
  expect(adviceDecisionPolicy(request, plan, undefined, []).maximumVerdict).toBe('recommend');
  const incomplete = {
    ...plan,
    candidates: [{ playerId: 'player', rationale: 'missing estimate' }],
  };
  const policy = adviceDecisionPolicy(request, incomplete, undefined, []);
  const result = enforceAdviceDecisionPolicy(answer, policy);
  expect(result.verdict).toBe('insufficient');
  expect(result.recommendedPlayerIds).toEqual([]);
  expect(answer.verdict).toBe('recommend');
  const stale = structuredClone(plan);
  stale.confidence.factors[1]!.score = 0;
  expect(
    enforceAdviceDecisionPolicy(answer, adviceDecisionPolicy(request, stale, undefined, []))
      .verdict,
  ).toBe('lean');
});
it('does not turn historical rates or an AI confidence interval into a verified betting edge', () => {
  const history: BetEvidence = {
    metrics: [],
    wins: 12,
    losses: 0,
    pushes: 0,
    breakEvenRate: 0.52,
    historicalRate: 1,
    historicalInterval: [0.75, 1],
    warnings: [],
  };
  const policy = adviceDecisionPolicy({ mode: 'betting' }, undefined, history, []);
  const result = enforceAdviceDecisionPolicy(
    {
      ...answer,
      forecast: {
        probability: 0.95,
        lower: 0.8,
        upper: 1,
        rationale: { text: 'Model opinion.', metricIds: [], sourceIds: [] },
      },
    },
    policy,
  );
  expect(result.verdict).toBe('hold');
  expect(result.recommendedPlayerIds).toEqual([]);
  expect(result.forecast?.probability).toBe(0.95);
  expect(
    adviceDecisionPolicy({ mode: 'betting' }, undefined, { ...history, wins: 3 }, [])
      .maximumVerdict,
  ).toBe('insufficient');
});

it('retains a compliant specific Hold headline while rewriting unsupported actionable picks', () => {
  const policy = { maximumVerdict: 'hold' as const, reasons: ['No supported edge.'] };
  const compliant = {
    ...answer,
    verdict: 'hold' as const,
    recommendedPlayerIds: [],
    headline: 'Pass on Denver: no supported betting edge',
  };
  expect(enforceAdviceDecisionPolicy(compliant, policy).headline).toBe(compliant.headline);
  const corrected = enforceAdviceDecisionPolicy({ ...answer, headline: 'Bet on Denver' }, policy);
  expect(corrected.verdict).toBe('hold');
  expect(corrected.recommendedPlayerIds).toEqual([]);
  expect(corrected.headline).toBe('Compare the evidence before placing a bet');
});
