import {
  adviceConfidence,
  americanOdds,
  betForecastQualified,
  evaluateLineupSelection,
  type AdviceAssessment,
  type AdviceDecisionPolicy,
  type AdviceMetric,
  type AdviceRequest,
  type BetEvidence,
  type FantasyAdvicePlan,
  type LeagueConnection,
  type PlayerAdviceEvidence,
} from '@sidekick/core';

export interface AdviceSelectionInput {
  request: AdviceRequest;
  league: LeagueConnection | undefined;
  plan: FantasyAdvicePlan | undefined;
  betHistory: BetEvidence | undefined;
  players: PlayerAdviceEvidence[];
  decisionPolicy: AdviceDecisionPolicy;
  assessment: AdviceAssessment;
  metrics: AdviceMetric[];
  warnings: string[];
}

/**
 * Applies the reviewed answer to the deterministic plan after model review.
 * Mutates `assessment`, `metrics` and `warnings` in place: a choice that departs from the
 * highest supported estimate is downgraded to Lean, its estimate given up is disclosed,
 * and confidence is capped because the optimizer's margin cannot support a different choice.
 */
export function reconcileAdviceSelection({
  request,
  league,
  plan,
  betHistory,
  players,
  decisionPolicy,
  assessment,
  metrics,
  warnings,
}: AdviceSelectionInput) {
  let selectedLineup = plan?.lineup;
  let comparisonLineup = plan?.alternativeLineup;
  let changedLineup = false;
  if (
    request.mode === 'lineup' &&
    plan &&
    !plan.startSit &&
    ['recommend', 'lean'].includes(assessment.verdict)
  ) {
    selectedLineup = evaluateLineupSelection(
      plan,
      assessment.recommendedPlayerIds,
      league!.settings.roster_positions,
    );
    changedLineup = plan.lineup!.assignments.some(
      (row) => !assessment.recommendedPlayerIds.includes(row.playerId),
    );
    const selectedSources = [
      ...new Set(
        players
          .filter((player) => assessment.recommendedPlayerIds.includes(player.id))
          .flatMap((player) => player.projectionSourceIds),
      ),
    ];
    metrics.push({
      id: 'lineup-selected',
      label: 'Selected starting-lineup estimate',
      value: selectedLineup.points!,
      unit: 'points',
      sourceIds: selectedSources,
      description:
        'Computed from the selected legal starters and supplied estimates. No matchup or injury multiplier was inferred.',
    });
    if (changedLineup) {
      comparisonLineup = plan.lineup;
      metrics.push({
        id: 'lineup-selection-change',
        label: 'Selected estimate minus highest supported estimate',
        value: selectedLineup.points! - plan.lineup!.points!,
        unit: 'points',
        sourceIds: [
          ...new Set([
            ...selectedSources,
            ...plan.lineup!.assignments.flatMap(
              (row) =>
                players.find((player) => player.id === row.playerId)?.projectionSourceIds ?? [],
            ),
          ]),
        ],
        description:
          'A negative value is the estimate given up for the model’s contextual choice; it is not a measured risk adjustment.',
      });
      assessment.verdict = 'lean';
      const tradeoff =
        'This choice departs from the highest supplied estimate based on context. The injury or matchup tradeoff has not been quantified; recheck availability before kickoff.';
      warnings.push(tradeoff);
      assessment.risks = [
        { text: tradeoff, metricIds: [], sourceIds: [] },
        ...assessment.risks,
      ].slice(0, 6);
    }
  }
  if (
    plan?.startSit &&
    ['recommend', 'lean'].includes(assessment.verdict) &&
    assessment.recommendedPlayerIds[0] !== plan.candidates[0]?.playerId
  ) {
    changedLineup = true;
    assessment.verdict = 'lean';
    const selected = plan.candidates.find(
      (candidate) => candidate.playerId === assessment.recommendedPlayerIds[0],
    )!;
    const best = plan.candidates[0]!;
    metrics.push({
      id: 'start-sit-selection-change',
      label: 'Chosen estimate minus highest alternative',
      value: selected.value! - best.value!,
      unit: 'points',
      sourceIds: [
        ...new Set(
          players
            .filter((player) => [selected.playerId, best.playerId].includes(player.id))
            .flatMap((player) => player.projectionSourceIds),
        ),
      ],
      description:
        'The weekly estimate given up for this one-spot contextual choice. The injury or matchup tradeoff has not been quantified.',
    });
    warnings.push(
      'The selected player has a lower supplied estimate. The contextual tradeoff is unquantified; this is a tentative single-spot choice.',
    );
  }
  const confidence =
    plan?.confidence ??
    adviceConfidence({
      coverage: betHistory!.wins + betHistory!.losses >= 8 ? 1 : 0,
      fresh: betHistory!.forecast?.fresh ?? false,
      sampleSize:
        betHistory!.forecast?.evaluation.calibrationSamples ??
        betHistory!.wins + betHistory!.losses,
      independentSources: 0,
      decisionMargin: betHistory!.forecast
        ? Math.max(0, betHistory!.forecast.lower - betHistory!.breakEvenRate)
        : 0,
      uncertainty: betHistory!.forecast
        ? betHistory!.forecast.upper - betHistory!.forecast.lower
        : 1,
    });
  if (
    betHistory &&
    (!betHistory.forecast ||
      !betForecastQualified(betHistory.forecast) ||
      decisionPolicy.maximumVerdict === 'hold' ||
      decisionPolicy.maximumVerdict === 'insufficient')
  ) {
    confidence.score = Math.min(confidence.score, 49);
    confidence.label = 'Low';
  }
  if (changedLineup) {
    // The optimizer's margin cannot substantiate confidence in a different choice.
    const margin = confidence.factors.find(
      (factor) => factor.label === 'Decision margin versus variability',
    );
    if (margin) margin.score = 0;
    confidence.score = Math.min(
      confidence.score,
      59,
      confidence.factors.reduce((sum, factor) => sum + factor.score, 0),
    );
    confidence.label = 'Low';
  }
  warnings.push(...decisionPolicy.reasons);
  if (assessment.forecast && request.bet) {
    const odds = americanOdds(request.bet.americanOdds);
    const forecast = assessment.forecast;
    metricForecast(
      metrics,
      forecast.probability,
      forecast.lower,
      forecast.upper,
      odds.profitPerUnit,
    );
    if (assessment.verdict === 'recommend' && forecast.lower <= odds.breakEvenRate)
      assessment.verdict = 'lean';
    confidence.score = Math.min(confidence.score, 49);
    confidence.label = 'Low';
    warnings.push(
      'The betting probability and hypothetical return are uncalibrated AI judgments, not measured stats or a proven betting edge.',
    );
  }
  return { selectedLineup, comparisonLineup, confidence };
}

function metricForecast(
  metrics: AdviceMetric[],
  probability: number,
  lower: number,
  upper: number,
  payout: number,
) {
  for (const [id, label, value, unit] of [
    ['bet-model-probability', 'AI judgment: win probability', probability * 100, '%'],
    ['bet-model-low', 'AI judgment: lower probability bound', lower * 100, '%'],
    ['bet-model-high', 'AI judgment: upper probability bound', upper * 100, '%'],
    [
      'bet-model-ev',
      'Hypothetical return using AI probability',
      (probability * payout - (1 - probability)) * 100,
      '% per unit',
    ],
  ] as const)
    metrics.push({
      id,
      label,
      value,
      unit,
      sourceIds: ['model-judgment', 'entered-odds'],
      description:
        'Uncalibrated AI judgment; not measured or backtested predictive evidence. Push probability is not modeled.',
    });
}
