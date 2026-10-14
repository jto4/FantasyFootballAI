import type {
  AdviceAssessment,
  AdviceRequest,
  BetEvidence,
  FantasyAdvicePlan,
  PlayerAdviceEvidence,
} from './advice-types.js';
import { betForecastQualified } from './bet-forecast.js';
import { isInactiveFootballStatus } from './player-availability.js';

export interface AdviceDecisionPolicy {
  maximumVerdict: 'recommend' | 'lean' | 'hold' | 'insufficient';
  reasons: string[];
  holdHeadline?: string;
}

/** Evidence limits are enforced outside the model; persuasion cannot fill missing data. */
export function adviceDecisionPolicy(
  request: AdviceRequest,
  plan: FantasyAdvicePlan | undefined,
  bet: BetEvidence | undefined,
  players: PlayerAdviceEvidence[],
): AdviceDecisionPolicy {
  if (request.mode === 'betting') {
    if (
      !bet ||
      bet.wins + bet.losses < 8 ||
      players.some(
        (player) =>
          isInactiveFootballStatus(player.status) || /^doubtful$/i.test(player.status ?? ''),
      )
    ) {
      return {
        maximumVerdict: 'insufficient',
        reasons: [
          'The historical sample or current player availability is insufficient for a betting pick.',
        ],
      };
    }
    if (
      bet.forecast &&
      betForecastQualified(bet.forecast) &&
      (1 - bet.forecast.pushRate) * (bet.forecast.lower - bet.breakEvenRate) > 0.02 &&
      !players.some(
        (player) =>
          /^questionable$/i.test(player.status ?? '') ||
          player.warnings.some((warning) => warning.startsWith('Injury availability:')),
      )
    )
      return {
        maximumVerdict: 'lean',
        reasons: [
          'The rolling model clears its chronological evaluation and conservative price threshold. This supports only a tentative choice; current conditions and model shifts still matter.',
        ],
      };
    return {
      maximumVerdict: 'hold',
      reasons: [
        ...(bet.forecast?.evaluation.baselineKind !== 'sportsbook'
          ? [
              'This forecast has no matched historical sportsbook validation. A frequency baseline or model opinion cannot establish an actionable edge at the current price.',
            ]
          : []),
        'The rolling forecast lacks sufficient evaluation support or a conservative advantage at the entered price. An uncalibrated AI forecast and historical hit rates cannot establish a betting edge.',
      ],
    };
  }
  const coverage = plan?.confidence.factors.find(
    (factor) => factor.label === 'Relevant player/data coverage',
  );
  if (
    !plan?.candidates.length ||
    !coverage ||
    coverage.score < coverage.maximum ||
    plan.candidates.some((candidate) => candidate.value === undefined)
  )
    return {
      maximumVerdict: 'insufficient',
      reasons: [
        'Complete scoring-matched estimates, roster ownership and decision comparisons are required before selecting players.',
      ],
    };
  const freshness = plan.confidence.factors.find(
    (factor) => factor.label === 'Fresh league and source data',
  );
  if (
    request.mode === 'waivers' &&
    request.dropPlayerId &&
    plan.candidates.every((c) => c.value! <= 0)
  )
    return {
      maximumVerdict: 'hold',
      holdHeadline: 'Keep your current lineup for now',
      reasons: [
        'None of the compared add/drop moves improves the supported weekly starting-lineup estimate. Longer-term stash value is not quantified by this weekly comparison.',
      ],
    };
  if (
    (request.mode === 'waivers' && !request.dropPlayerId) ||
    !freshness?.score ||
    plan.players.some(
      (player) => player.projectionMethod && player.projectionMethod !== 'imported',
    ) ||
    (['lineup', 'waivers'].includes(request.mode) &&
      plan.players.some(
        (player) =>
          /^questionable$/i.test(player.status ?? '') ||
          player.warnings.some((warning) => warning.startsWith('Injury availability:')),
      ))
  )
    return {
      maximumVerdict: 'lean',
      reasons: [
        'Stale evidence, uncertain injury availability, an unconfirmed waiver drop or a statistical estimate without prospective validation supports a tentative comparison rather than a firm recommendation.',
      ],
    };
  return { maximumVerdict: 'recommend', reasons: [] };
}

export function enforceAdviceDecisionPolicy(
  assessment: AdviceAssessment,
  policy: AdviceDecisionPolicy,
): AdviceAssessment {
  const answer = structuredClone(assessment);
  if (policy.maximumVerdict === 'insufficient' || policy.maximumVerdict === 'hold') {
    const preserveHoldHeadline =
      policy.maximumVerdict === 'hold' &&
      answer.verdict === 'hold' &&
      answer.recommendedPlayerIds.length === 0 &&
      !policy.holdHeadline;
    answer.verdict = policy.maximumVerdict;
    answer.recommendedPlayerIds = [];
    if (!preserveHoldHeadline)
      answer.headline =
        policy.maximumVerdict === 'insufficient'
          ? 'More evidence is needed before choosing'
          : (policy.holdHeadline ?? 'Compare the evidence before placing a bet');
  } else if (policy.maximumVerdict === 'lean' && answer.verdict === 'recommend') {
    answer.verdict = 'lean';
    answer.headline = 'Treat this as a tentative comparison';
  }
  if (policy.reasons.length)
    answer.risks = [
      ...policy.reasons.map((text) => ({ text, metricIds: [], sourceIds: [] })),
      ...answer.risks,
    ].slice(0, 6);
  return answer;
}
