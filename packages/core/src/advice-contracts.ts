import { isAdviceDataReadiness } from './advice-readiness.js';
import {
  footballStatKeys,
  maximumAdviceSources,
  type AdviceAssessment,
  type AdviceMetric,
  type AdviceOptions,
  type AdviceRequest,
  type AdviceResult,
  type AdviceStatement,
} from './advice-types.js';
import { isProjectionPeriod } from './projection-period.js';
import { starterSlots } from './advice-math.js';
import { isSportsbookQuote, quoteMatchesTerms } from './sportsbook-types.js';

const modes = new Set(['draft-plan', 'draft-review', 'lineup', 'trade', 'waivers', 'betting']);
const obj = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' &&
  value.length <= max &&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const id = (value: unknown): value is string =>
  text(value, 256) && value.length > 0 && !/\s/.test(value);
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const integer = (value: unknown, min: number, max: number) =>
  finite(value) && Number.isInteger(value) && value >= min && value <= max;
const list = (value: unknown, max: number): value is string[] =>
  Array.isArray(value) &&
  value.length <= max &&
  value.every(id) &&
  new Set(value).size === value.length;
const optional = (value: unknown, check: (value: unknown) => boolean) =>
  value === undefined || check(value);

export function isAdviceRequest(value: unknown): value is AdviceRequest {
  const row = obj(value);
  if (
    row &&
    Object.keys(row).some(
      (key) =>
        ![
          'mode',
          'connection',
          'model',
          'maxOutputTokens',
          'leagueId',
          'teamId',
          'season',
          'week',
          'throughWeek',
          'candidateIds',
          'dropPlayerId',
          'giveIds',
          'receiveIds',
          'tradeTeamId',
          'bet',
          'question',
        ].includes(key),
    )
  )
    return false;
  if (
    !row ||
    typeof row.mode !== 'string' ||
    !modes.has(row.mode) ||
    !optional(row.connection, (v) => v === 'saved' || v === 'claude-cli' || v === 'codex-cli') ||
    !optional(row.model, (v) => id(v) && v.length <= 120) ||
    !optional(row.maxOutputTokens, (v) => integer(v, 128, 16_384)) ||
    !optional(row.season, (v) => integer(v, 2010, 2099)) ||
    !optional(row.week, (v) => integer(v, 1, 18)) ||
    !optional(
      row.throughWeek,
      (v) =>
        row.mode === 'trade' &&
        typeof v === 'number' &&
        integer(v, 1, 18) &&
        (row.week === undefined || (typeof row.week === 'number' && v >= row.week)),
    ) ||
    !optional(row.question, (v) => text(v, 2_000)) ||
    !optional(row.leagueId, id) ||
    !optional(row.teamId, id) ||
    !optional(row.tradeTeamId, id) ||
    !optional(row.dropPlayerId, (value) => row.mode === 'waivers' && id(value))
  )
    return false;
  for (const key of ['candidateIds', 'giveIds', 'receiveIds'])
    if (!optional(row[key], (v) => list(v, 20) && v.length > 0)) return false;
  if (row.mode === 'lineup' && Array.isArray(row.candidateIds) && row.candidateIds.length < 2)
    return false;
  if (row.mode !== 'betting') return id(row.leagueId) && id(row.teamId) && row.bet === undefined;
  const bet = obj(row.bet);
  if (
    bet &&
    Object.keys(bet).some(
      (key) =>
        ![
          'kind',
          'gameId',
          'playerId',
          'stat',
          'side',
          'line',
          'americanOdds',
          'oppositeAmericanOdds',
          'quoteId',
        ].includes(key),
    )
  )
    return false;
  if (
    !bet ||
    typeof bet.kind !== 'string' ||
    !['player-prop', 'spread', 'total', 'moneyline'].includes(bet.kind) ||
    !id(bet.gameId) ||
    !optional(bet.quoteId, (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)) ||
    (bet.kind === 'player-prop' && bet.quoteId !== undefined) ||
    !integer(bet.americanOdds, -100_000, 100_000) ||
    Math.abs(bet.americanOdds as number) < 100 ||
    !optional(
      bet.oppositeAmericanOdds,
      (v) => integer(v, -100_000, 100_000) && Math.abs(v as number) >= 100,
    )
  )
    return false;
  if (typeof bet.side !== 'string' || !['home', 'away', 'over', 'under'].includes(bet.side))
    return false;
  if (bet.kind === 'player-prop' || bet.kind === 'total') {
    if (
      !['over', 'under'].includes(String(bet.side)) ||
      !finite(bet.line) ||
      bet.line < 0 ||
      bet.line > 2_000
    )
      return false;
  }
  if (bet.kind === 'spread' || bet.kind === 'moneyline')
    if (!['home', 'away'].includes(String(bet.side))) return false;
  if (bet.kind === 'spread' && (!finite(bet.line) || Math.abs(bet.line) > 100)) return false;
  return (
    bet.kind !== 'player-prop' ||
    (id(bet.playerId) && footballStatKeys.includes(bet.stat as (typeof footballStatKeys)[number]))
  );
}

export function isAdviceMetric(value: unknown): value is AdviceMetric {
  const row = obj(value);
  return (
    !!row &&
    id(row.id) &&
    text(row.label, 300) &&
    finite(row.value) &&
    text(row.unit, 40) &&
    list(row.sourceIds, maximumAdviceSources) &&
    optional(row.sampleSize, (v) => integer(v, 0, 100_000)) &&
    optional(row.description, (v) => text(v, 1_000))
  );
}

export function isAdviceStatement(value: unknown): value is AdviceStatement {
  const row = obj(value);
  return (
    !!row &&
    Object.keys(row).every((key) => ['text', 'metricIds', 'sourceIds', 'tone'].includes(key)) &&
    optional(
      row.tone,
      (value) =>
        typeof value === 'string' && ['positive', 'negative', 'mixed', 'unknown'].includes(value),
    ) &&
    text(row.text, 1_200) &&
    row.text.trim().length > 0 &&
    list(row.metricIds, 12) &&
    list(row.sourceIds, 12)
  );
}
export function isAdviceAssessment(value: unknown): value is AdviceAssessment {
  const row = obj(value);
  if (
    !row ||
    Object.keys(row).some(
      (key) =>
        ![
          'verdict',
          'headline',
          'recommendedPlayerIds',
          'reasons',
          'risks',
          'alternative',
          'perception',
          'forecast',
        ].includes(key),
    ) ||
    typeof row.verdict !== 'string' ||
    !['recommend', 'lean', 'hold', 'insufficient'].includes(row.verdict) ||
    !text(row.headline, 180) ||
    !row.headline.trim() ||
    !list(row.recommendedPlayerIds, 20) ||
    !Array.isArray(row.reasons) ||
    row.reasons.length < 1 ||
    row.reasons.length > 6 ||
    !row.reasons.every(isAdviceStatement) ||
    !Array.isArray(row.risks) ||
    row.risks.length < 1 ||
    row.risks.length > 6 ||
    !row.risks.every(isAdviceStatement) ||
    !isAdviceStatement(row.alternative) ||
    !isAdviceStatement(row.perception) ||
    typeof obj(row.perception)?.tone !== 'string' ||
    !['positive', 'negative', 'mixed', 'unknown'].includes(obj(row.perception)?.tone as string)
  )
    return false;
  if (row.forecast !== undefined) {
    const forecast = obj(row.forecast);
    if (
      !forecast ||
      Object.keys(forecast).some(
        (key) => !['probability', 'lower', 'upper', 'rationale'].includes(key),
      ) ||
      !finite(forecast.probability) ||
      !finite(forecast.lower) ||
      !finite(forecast.upper) ||
      forecast.lower < 0 ||
      forecast.upper > 1 ||
      forecast.lower > forecast.probability ||
      forecast.upper < forecast.probability ||
      !isAdviceStatement(forecast.rationale)
    )
      return false;
  }
  return true;
}

/** Validate references and numeric grounding separately from the model's JSON shape. */
export function validateAdviceAssessment(
  value: unknown,
  metrics: AdviceMetric[],
  sourceIds: string[],
  allowedPlayers: string[],
  betting: boolean,
  requireVisibleNumericalSupport = true,
): AdviceAssessment {
  if (!isAdviceAssessment(value))
    throw new Error('Advice did not match the required answer structure.');
  const metricMap = new Map(metrics.map((metric) => [metric.id, metric]));
  const sources = new Set(sourceIds),
    players = new Set(allowedPlayers);
  if (value.recommendedPlayerIds.some((player) => !players.has(player)))
    throw new Error('Advice selected an unsupported player.');
  if (/\d|\{\{|https?:|www\./i.test(value.headline))
    throw new Error('Advice headline contained unsupported numbers or links.');
  if (!betting && value.forecast)
    throw new Error('An outcome forecast is not supported for this fantasy analysis.');
  const statements = [
    ...value.reasons,
    ...value.risks,
    value.alternative,
    value.perception,
    ...(value.forecast ? [value.forecast.rationale] : []),
  ];
  for (const statement of statements) {
    if (
      statement.metricIds.some((key) => !metricMap.has(key)) ||
      statement.sourceIds.some((key) => !sources.has(key))
    )
      throw new Error('Advice cited unsupported evidence.');
    let valid = true;
    const remaining = statement.text.replace(/\{\{([^{}]+)\}\}/g, (_match, key: string) => {
      if (!statement.metricIds.includes(key) || !metricMap.has(key)) valid = false;
      return '';
    });
    if (
      !valid ||
      /\d|[{}]|https?:|www\./i.test(remaining) ||
      /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|hundred|percent)\s*(?:points?|yards?|percent|%|probability)/i.test(
        remaining,
      )
    )
      throw new Error('Advice included an unsupported numerical claim or link.');
  }
  if (
    (value.verdict === 'recommend' || value.verdict === 'lean') &&
    !value.reasons.some((reason) =>
      requireVisibleNumericalSupport
        ? reason.metricIds.some((key) => reason.text.includes(`{{${key}}}`))
        : reason.metricIds.length > 0,
    )
  )
    throw new Error('Advice recommendation lacked numerical support.');
  if (betting && value.verdict === 'recommend' && !value.forecast)
    throw new Error('A betting recommendation requires an explicit model forecast.');
  return structuredClone(value);
}

export function renderAdviceStatement(statement: AdviceStatement, metrics: AdviceMetric[]): string {
  const values = new Map(metrics.map((metric) => [metric.id, metric]));
  const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
  let rendered = '',
    cursor = 0;
  for (const match of statement.text.matchAll(/\{\{([^{}]+)\}\}/g)) {
    rendered += statement.text.slice(cursor, match.index);
    const metric = values.get(match[1]!);
    rendered += metric ? `${number.format(metric.value)} ${metric.unit}` : 'unavailable evidence';
    cursor = match.index + match[0].length;
    if (metric?.unit.trim()) {
      // Only remove an identical adjacent unit; prose with a different meaning stays intact.
      const unit = metric.unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const repeated = new RegExp(`^[ \\t]*${unit}(?=$|[\\s.,;:!?)\\]}])`).exec(
        statement.text.slice(cursor),
      );
      if (repeated) cursor += repeated[0].length;
    }
  }
  return rendered + statement.text.slice(cursor);
}

function isSource(value: unknown): boolean {
  const source = obj(value);
  if (
    !source ||
    !id(source.id) ||
    !text(source.name, 300) ||
    !optional(source.url, (v) => text(v, 2_000)) ||
    !['available', 'unavailable'].includes(String(source.status)) ||
    !optional(source.retrievedAt, (v) => text(v, 40) && Number.isFinite(Date.parse(v)))
  )
    return false;
  if (source.url === undefined) return true;
  try {
    const url = new URL(source.url as string);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}
export function isNFLDraftProfile(value: unknown): boolean {
  const row = obj(value);
  return (
    !!row &&
    Object.keys(row).every((k) =>
      [
        'gsisId',
        'pfrId',
        'name',
        'position',
        'season',
        'round',
        'pick',
        'draftTeam',
        'college',
        'sourceId',
      ].includes(k),
    ) &&
    optional(row.gsisId, (v) => typeof v === 'string' && /^(?:00-\d{7}|[A-Z]{3}\d{6})$/.test(v)) &&
    optional(
      row.pfrId,
      (v) =>
        typeof v === 'string' &&
        v.length >= 4 &&
        v.length <= 20 &&
        /^[A-Za-z0-9]+(?:[.'][A-Za-z0-9]+)?$/.test(v),
    ) &&
    text(row.name, 120) &&
    typeof row.position === 'string' &&
    ['QB', 'RB', 'WR', 'TE', 'K'].includes(row.position) &&
    integer(row.season, 1980, 2099) &&
    integer(row.round, 1, typeof row.season === 'number' && row.season >= 2010 ? 7 : 17) &&
    integer(row.pick, 1, 500) &&
    typeof row.draftTeam === 'string' &&
    /^[A-Z]{2,3}$/.test(row.draftTeam) &&
    optional(row.college, (v) => text(v, 120)) &&
    row.sourceId === 'nfl-draft-picks'
  );
}
function isPlayer(value: unknown): boolean {
  const player = obj(value);
  return (
    !!player &&
    id(player.id) &&
    text(player.name, 120) &&
    text(player.position, 12) &&
    optional(player.team, (v) => text(v, 12)) &&
    optional(player.status, (v) => text(v, 80)) &&
    optional(player.draftProfile, isNFLDraftProfile) &&
    optional(player.projectedPoints, finite) &&
    optional(player.weeklyGameStatus, (v) => v === 'bye' && player.projectedPoints === undefined) &&
    optional(
      player.projectionScope,
      (v) => v === 'week' || v === 'season' || v === 'remaining-season',
    ) &&
    optional(player.projectionPeriod, isProjectionPeriod) &&
    (player.projectionScope !== 'remaining-season' ||
      (isProjectionPeriod(player.projectionPeriod) && player.projectionPeriod.throughWeek <= 18)) &&
    optional(player.projectionMethod, (v) =>
      [
        'imported',
        'historical-baseline',
        'rolling-form-v1',
        'rolling-baseline-v1',
        'public-projection-v1',
      ].includes(String(v)),
    ) &&
    list(player.projectionSourceIds, maximumAdviceSources) &&
    Array.isArray(player.metrics) &&
    player.metrics.length <= 30 &&
    player.metrics.every(isAdviceMetric) &&
    Array.isArray(player.historicalPoints) &&
    player.historicalPoints.length <= 12 &&
    player.historicalPoints.every(finite) &&
    Array.isArray(player.warnings) &&
    player.warnings.length <= 30 &&
    player.warnings.every((v) => text(v, 1_000)) &&
    optional(player.matchup, (v) => {
      const matchup = obj(v);
      return (
        !!matchup &&
        id(matchup.gameId) &&
        text(matchup.opponent, 12) &&
        typeof matchup.home === 'boolean' &&
        text(matchup.date, 10) &&
        /^\d{4}-\d{2}-\d{2}$/.test(matchup.date) &&
        Number.isFinite(Date.parse(matchup.date)) &&
        new Date(matchup.date).toISOString().slice(0, 10) === matchup.date
      );
    })
  );
}
function isLineup(value: unknown): boolean {
  const row = obj(value);
  return (
    !!row &&
    typeof row.complete === 'boolean' &&
    optional(row.points, finite) &&
    Array.isArray(row.assignments) &&
    row.assignments.length <= 12 &&
    row.assignments.every((value) => {
      const item = obj(value);
      return item && text(item.slot, 40) && id(item.playerId) && finite(item.points);
    }) &&
    Array.isArray(row.missingSlots) &&
    row.missingSlots.every((v) => text(v, 40)) &&
    Array.isArray(row.warnings) &&
    row.warnings.every((v) => text(v, 1_000))
  );
}
export function isAdviceResult(value: unknown): value is AdviceResult {
  if (obj(value)?.readiness !== undefined && !isAdviceDataReadiness(obj(value)?.readiness))
    return false;
  const row = obj(value),
    confidence = obj(row?.confidence),
    usage = obj(row?.usage);
  if (row?.marketQuote !== undefined) {
    const bet = obj(obj(row.request)?.bet);
    if (
      !isSportsbookQuote(row.marketQuote) ||
      !bet ||
      bet.quoteId !== row.marketQuote.id ||
      !quoteMatchesTerms(row.marketQuote, bet as unknown as import('./advice-types.js').BetTerms)
    )
      return false;
  } else if (obj(obj(row?.request)?.bet)?.quoteId !== undefined) return false;
  if (
    !row ||
    !id(row.id) ||
    !text(row.createdAt, 40) ||
    !Number.isFinite(Date.parse(row.createdAt)) ||
    !isAdviceRequest(row.request) ||
    !integer(row.season, 2010, 2099) ||
    !integer(row.week, 1, 18) ||
    !text(row.model, 160) ||
    !isAdviceAssessment(row.assessment) ||
    !confidence ||
    !integer(confidence.score, 0, 100) ||
    !['Low', 'Moderate', 'High'].includes(String(confidence.label)) ||
    !text(confidence.meaning, 500) ||
    !Array.isArray(confidence.factors) ||
    confidence.factors.length > 10 ||
    !confidence.factors.every((value) => {
      const factor = obj(value);
      return (
        factor &&
        text(factor.label, 120) &&
        integer(factor.score, 0, 100) &&
        integer(factor.maximum, 0, 100)
      );
    })
  )
    return false;
  if (
    !Array.isArray(row.players) ||
    row.players.length > 100 ||
    !row.players.every(isPlayer) ||
    !Array.isArray(row.metrics) ||
    row.metrics.length > 500 ||
    !row.metrics.every(isAdviceMetric) ||
    !Array.isArray(row.sources) ||
    row.sources.length > maximumAdviceSources ||
    !row.sources.every(isSource) ||
    !Array.isArray(row.warnings) ||
    row.warnings.length > 100 ||
    !row.warnings.every((v) => text(v, 1_500)) ||
    !optional(row.lineup, isLineup) ||
    !optional(row.alternativeLineup, isLineup)
  )
    return false;
  const draftSourceIds = new Set(row.sources.map((source) => source.id));
  if (
    row.players.some(
      (player) =>
        player.draftProfile &&
        (player.draftProfile.position !== player.position ||
          !draftSourceIds.has(player.draftProfile.sourceId)),
    )
  )
    return false;
  if (row.startSit !== undefined) {
    const comparison = obj(row.startSit);
    const request = row.request as AdviceRequest;
    const assessment = row.assessment as AdviceAssessment;
    const playerIds = new Set(row.players.map((player) => player.id));
    if (
      !comparison ||
      Object.keys(comparison).some((key) => !['candidateIds', 'eligibleSlots'].includes(key)) ||
      request.mode !== 'lineup' ||
      !list(comparison.candidateIds, 20) ||
      comparison.candidateIds.length < 2 ||
      !Array.isArray(request.candidateIds) ||
      comparison.candidateIds.length !== request.candidateIds.length ||
      comparison.candidateIds.some(
        (id) => !request.candidateIds!.includes(id) || !playerIds.has(id),
      ) ||
      !Array.isArray(comparison.eligibleSlots) ||
      !comparison.eligibleSlots.length ||
      comparison.eligibleSlots.length > 12 ||
      !comparison.eligibleSlots.every((slot) => text(slot, 40) && slot.length > 0) ||
      new Set(comparison.eligibleSlots).size !== comparison.eligibleSlots.length ||
      row.lineup !== undefined ||
      row.alternativeLineup !== undefined ||
      (['recommend', 'lean'].includes(assessment.verdict) &&
        (assessment.recommendedPlayerIds.length !== 1 ||
          !comparison.candidateIds.includes(assessment.recommendedPlayerIds[0]!)))
    )
      return false;
    const parsedSlots = starterSlots(comparison.eligibleSlots);
    const candidateIds = comparison.candidateIds;
    const evidencePlayers = row.players;
    if (
      parsedSlots.warnings.length ||
      parsedSlots.slots.length !== comparison.eligibleSlots.length ||
      parsedSlots.slots.some((slot) =>
        candidateIds.some((id) => {
          const player = evidencePlayers.find((player: { id: string }) => player.id === id)!;
          return !slot.positions.includes(player.position === 'DEF' ? 'DST' : player.position);
        }),
      )
    )
      return false;
  }
  if (row.perceptionEvidence !== undefined) {
    const perception = obj(row.perceptionEvidence);
    const sourceIds = new Set(row.sources.map((source) => source.id));
    const playerIds = new Set(row.players.map((player) => player.id));
    const metricIds = new Set(
      [...row.metrics, ...row.players.flatMap((player) => player.metrics)].map(
        (metric) => metric.id,
      ),
    );
    if (
      !perception ||
      !integer(perception.windowHours, 1, 168) ||
      typeof perception.feedStatus !== 'string' ||
      !['current', 'stale', 'unavailable'].includes(String(perception.feedStatus)) ||
      !optional(
        perception.checkedAt,
        (value) => text(value, 40) && Number.isFinite(Date.parse(value)),
      ) ||
      (perception.feedStatus === 'current' &&
        (!text(perception.checkedAt, 40) ||
          Date.parse(perception.checkedAt) > Date.parse(row.createdAt as string) ||
          Date.parse(row.createdAt as string) - Date.parse(perception.checkedAt) > 3_600_000)) ||
      !list(perception.activityMetricIds, 200) ||
      !perception.activityMetricIds.every(
        (id) => metricIds.has(id) && /:market-(adds|drops)$/.test(id),
      ) ||
      !Array.isArray(perception.headlines) ||
      perception.headlines.length > 8 ||
      !perception.headlines.every((value) => {
        const headline = obj(value);
        return (
          headline &&
          id(headline.sourceId) &&
          sourceIds.has(headline.sourceId) &&
          text(headline.publishedAt, 40) &&
          Number.isFinite(Date.parse(headline.publishedAt)) &&
          Date.parse(headline.publishedAt) <= Date.parse(row.createdAt as string) &&
          Date.parse(headline.publishedAt) >=
            Date.parse(row.createdAt as string) - (perception.windowHours as number) * 3_600_000 &&
          list(headline.playerIds, 100) &&
          headline.playerIds.every((id) => playerIds.has(id)) &&
          list(headline.teamCodes, 32) &&
          headline.teamCodes.every((value) => /^[A-Z]{2,3}$/.test(value)) &&
          (headline.playerIds.length > 0 || headline.teamCodes.length > 0)
        );
      })
    )
      return false;
  }
  if (
    row.usage !== undefined &&
    (!usage ||
      !integer(usage.inputTokens, 0, 20_000_000) ||
      !integer(usage.outputTokens, 0, 20_000_000) ||
      !optional(usage.estimatedCostUsd, (v) => finite(v) && v >= 0))
  )
    return false;
  if (row.betHistory !== undefined) {
    const history = obj(row.betHistory);
    if (
      !history ||
      !optional(history.forecast, isBetModelForecast) ||
      !integer(history.wins, 0, 100_000) ||
      !integer(history.losses, 0, 100_000) ||
      !integer(history.pushes, 0, 100_000) ||
      !finite(history.breakEvenRate) ||
      history.breakEvenRate < 0 ||
      history.breakEvenRate > 1 ||
      !optional(history.historicalRate, (v) => finite(v) && v >= 0 && v <= 1) ||
      !optional(history.historicalRoi, finite) ||
      !Array.isArray(history.metrics) ||
      !history.metrics.every(isAdviceMetric) ||
      !Array.isArray(history.warnings) ||
      !history.warnings.every((v) => text(v, 1_500))
    )
      return false;
    if (
      history.historicalInterval !== undefined &&
      (!Array.isArray(history.historicalInterval) ||
        history.historicalInterval.length !== 2 ||
        !history.historicalInterval.every((v) => finite(v) && v >= 0 && v <= 1) ||
        history.historicalInterval[0] > history.historicalInterval[1])
    )
      return false;
  }
  try {
    validateAdviceAssessment(
      row.assessment,
      [...row.metrics, ...row.players.flatMap((player) => player.metrics)],
      row.sources.map((source) => source.id),
      row.players.map((player) => player.id),
      row.request.mode === 'betting',
      // Older saved analyses allowed declared numeric support without rendering
      // a placeholder. New generation is stricter; preserve existing history/backups.
      false,
    );
  } catch {
    return false;
  }
  return JSON.stringify(value).length <= 180_000;
}

function isBetModelForecast(value: unknown): boolean {
  const f = obj(value),
    e = obj(f?.evaluation);
  if (
    !f ||
    !e ||
    typeof f.method !== 'string' ||
    ![
      'rolling-residual-v1',
      'market-regularized-v2',
      'market-context-v3',
      'health-weather-total-v4',
    ].includes(String(f.method)) ||
    (f.method !== 'rolling-residual-v1' && e.baselineKind !== 'sportsbook') ||
    (e.baselineKind !== undefined &&
      !['frequency', 'sportsbook'].includes(String(e.baselineKind))) ||
    typeof f.fresh !== 'boolean' ||
    !finite(f.estimate) ||
    !integer(f.residualSamples, 24, 10000) ||
    !['probability', 'rawProbability', 'lower', 'upper', 'pushRate'].every(
      (key) => finite(f[key]) && f[key] >= 0 && f[key] <= 1,
    ) ||
    (f.lower as number) > (f.probability as number) ||
    (f.upper as number) < (f.probability as number)
  )
    return false;
  return (
    integer(e.games, 0, 10000) &&
    integer(e.weeks, 0, f.method !== 'rolling-residual-v1' ? 100 : 40) &&
    integer(e.calibrationSamples, 0, e.games as number) &&
    integer(e.calibrationWeeks, 0, e.weeks as number) &&
    ['brier', 'baselineBrier', 'calibrationObserved', 'calibrationPredicted'].every(
      (key) => finite(e[key]) && e[key] >= 0 && e[key] <= 1,
    ) &&
    finite(e.improvementLower) &&
    e.improvementLower >= -2 &&
    e.improvementLower <= 1
  );
}

export function isAdviceOptions(value: unknown): value is AdviceOptions {
  const row = obj(value);
  return (
    !!row &&
    integer(row.season, 2010, 2099) &&
    integer(row.week, 1, 18) &&
    text(row.model, 160) &&
    optional(row.connection, (v) => v === 'saved' || v === 'claude-cli' || v === 'codex-cli') &&
    optional(
      row.connections,
      (v) =>
        Array.isArray(v) &&
        v.length <= 3 &&
        v.every((value) => {
          const item = obj(value);
          return (
            item &&
            ['saved', 'claude-cli', 'codex-cli'].includes(String(item.id)) &&
            typeof item.id === 'string' &&
            text(item.label, 120) &&
            typeof item.status === 'string' &&
            ['saved', 'signed-in', 'not-installed', 'signed-out', 'unavailable'].includes(
              item.status,
            )
          );
        }) &&
        new Set(v.map((value) => obj(value)?.id)).size === v.length,
    ) &&
    optional(
      row.models,
      (v) =>
        Array.isArray(v) &&
        v.length <= 20 &&
        v.every((value) => {
          const model = obj(value);
          return (
            model &&
            id(model.id) &&
            (model.id as string).length <= 120 &&
            typeof model.reasoning === 'boolean'
          );
        }) &&
        new Set(v.map((item) => (item as { id: string }).id)).size === v.length,
    ) &&
    optional(
      row.recommendedModel,
      (v) =>
        id(v) &&
        Array.isArray(row.models) &&
        row.models.some((value) => obj(value)?.id === v && obj(value)?.reasoning === true),
    ) &&
    Array.isArray(row.players) &&
    row.players.length <= 2_000 &&
    row.players.every((value) => {
      const player = obj(value);
      return (
        player &&
        id(player.id) &&
        text(player.name, 120) &&
        text(player.position, 12) &&
        optional(player.nflTeam, (v) => text(v, 12)) &&
        optional(player.teamId, id)
      );
    }) &&
    Array.isArray(row.games) &&
    row.games.length <= 400 &&
    row.games.every((value) => {
      const game = obj(value);
      return (
        game &&
        id(game.id) &&
        integer(game.season, 2010, 2099) &&
        integer(game.week, 1, 18) &&
        text(game.date, 10) &&
        text(game.home, 12) &&
        text(game.away, 12) &&
        optional(game.neutralSite, (v) => typeof v === 'boolean')
      );
    }) &&
    Array.isArray(row.warnings) &&
    row.warnings.every((v) => text(v, 1_500))
  );
}
