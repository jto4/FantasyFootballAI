import type {
  AdviceMetric,
  BetModelForecast,
  BetTerms,
  FootballDataSnapshot,
  FootballGame,
} from './advice-types.js';
import {
  footballRowSourceIds,
  americanOdds,
  nflTeamKey,
  wilsonInterval,
  isUpcomingFootballGame,
} from './advice-math.js';
import { buildMarketGameForecast } from './market-game-forecast.js';
import type { GameRatingModel } from './game-rating-model.js';

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const bucket = (p: number) => Math.min(4, Math.floor(p * 5));
const before = (a: FootballGame, b: FootballGame) =>
  a.date < b.date && (a.season < b.season || a.week < b.week);
const delta = (value: number, terms: BetTerms) =>
  terms.kind === 'moneyline'
    ? terms.side === 'away'
      ? -value
      : value
    : terms.kind === 'spread'
      ? (terms.side === 'away' ? -value : value) + terms.line!
      : terms.side === 'under'
        ? terms.line! - value
        : value - terms.line!;
const probability = (estimate: number, residuals: number[], terms: BetTerms) => {
  // Counts/scores are integer-valued; keep pushes separate from conditional win probability.
  const outcomes = residuals.map((error) => delta(Math.round(estimate + error), terms));
  const wins = outcomes.filter((value) => value > 0).length,
    losses = outcomes.filter((value) => value < 0).length;
  return {
    p: (wins + 0.5) / (wins + losses + 1),
    pushRate: (outcomes.length - wins - losses) / outcomes.length,
  };
};

export function betForecastQualified(forecast: BetModelForecast): boolean {
  return forecast.fresh && betForecastEvaluationQualified(forecast);
}
/** Numerical evaluation gate alone; historical replay cannot establish source availability then. */
export function betForecastEvaluationQualified(forecast: BetModelForecast): boolean {
  const e = forecast.evaluation;
  return (
    e.baselineKind === 'sportsbook' &&
    e.games >= 100 &&
    e.weeks >= 12 &&
    e.calibrationSamples >= 40 &&
    e.calibrationWeeks >= 8 &&
    e.improvementLower > 0 &&
    e.brier < e.baselineBrier &&
    Math.abs(e.calibrationObserved - e.calibrationPredicted) <= 0.1
  );
}

/** Fixed method and chronological evaluation: no target outcomes, future fitting or sportsbook-line hindsight. */
export function buildBetForecastLegacy(
  terms: BetTerms,
  data: FootballDataSnapshot,
  asOf: string,
): {
  forecast?: BetModelForecast;
  metrics: AdviceMetric[];
  warnings: string[];
  evaluationCases: {
    gameId: string;
    season: number;
    week: number;
    probability: number;
    outcome: number;
  }[];
} {
  const warnings = [
    'This rolling model is experimental. It uses prior scoring/workload and empirical errors, without quantitative adjustments for current injuries, depth charts, weather or price movement.',
    'Evaluation applies your entered threshold to earlier games as a fixed scenario. It is not a backtest of historical sportsbook prices or betting profits.',
    'Calibration bands describe prior similar model estimates, not a guaranteed interval for this game. Team/player changes and correlated games can invalidate them.',
  ];
  if (terms.kind === 'player-prop')
    warnings.push(
      'Prop evaluation compares against historical frequency, not matched historical sportsbook prices. Even favorable model errors or hypothetical returns cannot establish an actionable sportsbook edge.',
    );
  const targets = data.games.filter((game) => game.id === terms.gameId);
  const target = targets.length === 1 ? targets[0] : undefined;
  if (!target || !isUpcomingFootballGame(target, asOf))
    return {
      metrics: [],
      evaluationCases: [],
      warnings: [
        'No uniquely supported upcoming regular-season target is available for the rolling forecast.',
      ],
    };
  // Exclude all conflicting identities; copied rows cannot increase evaluation sample counts.
  const groups = new Map<string, FootballGame[]>();
  for (const game of data.games) {
    if (
      game.seasonType !== 'REG' ||
      game.week > 18 ||
      game.season < target.season - 1 ||
      game.season > target.season ||
      !before(game, target) ||
      game.date >= asOf.slice(0, 10) ||
      !Number.isInteger(game.homeScore) ||
      !Number.isInteger(game.awayScore) ||
      game.homeScore! < 0 ||
      game.awayScore! < 0
    )
      continue;
    const normalized = { ...game, home: nflTeamKey(game.home), away: nflTeamKey(game.away) };
    const key = `${game.season}:${game.week}:${normalized.home}:${normalized.away}`;
    groups.set(key, [...(groups.get(key) ?? []), normalized]);
  }
  const games = [...groups.values()]
    .flatMap((rows) =>
      new Set(rows.map((row) => JSON.stringify(row))).size === 1 ? [rows[0]!] : [],
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const idCounts = new Map<string, number>();
  for (const game of games) idCounts.set(game.id, (idCounts.get(game.id) ?? 0) + 1);
  const teamWeeks = new Map<string, number>();
  for (const game of games)
    for (const team of [game.home, game.away]) {
      const key = `${game.season}:${game.week}:${team}`;
      teamWeeks.set(key, (teamWeeks.get(key) ?? 0) + 1);
    }
  const unique = games.filter(
    (game) =>
      idCounts.get(game.id) === 1 &&
      [game.home, game.away].every(
        (team) => teamWeeks.get(`${game.season}:${game.week}:${team}`) === 1,
      ),
  );
  const normalizedTarget = {
    ...target,
    home: nflTeamKey(target.home),
    away: nflTeamKey(target.away),
  };
  const gameById = new Map(unique.map((game) => [game.id, game]));
  const sourceIds =
    terms.kind === 'player-prop'
      ? [
          'games',
          ...new Set(
            data.players
              .filter(
                (row) =>
                  gameById.has(row.gameId) &&
                  row.playerId === terms.playerId &&
                  terms.stat &&
                  Number.isFinite(row.stats[terms.stat]),
              )
              .flatMap(footballRowSourceIds),
          ),
        ]
      : ['games'];
  const playerValues = new Map<string, number[]>();
  if (terms.kind === 'player-prop')
    for (const row of data.players) {
      const game = gameById.get(row.gameId),
        value = terms.stat && row.stats[terms.stat];
      if (
        !game ||
        row.playerId !== terms.playerId ||
        row.seasonType !== 'REG' ||
        row.season !== game.season ||
        row.week !== game.week ||
        !Number.isFinite(value) ||
        ![game.home, game.away].includes(nflTeamKey(row.team)) ||
        nflTeamKey(row.opponent) !== (nflTeamKey(row.team) === game.home ? game.away : game.home)
      )
        continue;
      playerValues.set(game.id, [...(playerValues.get(game.id) ?? []), value!]);
    }
  const playerStat = new Map(
    [...playerValues].flatMap(([id, values]) =>
      values.length === 1 ? [[id, values[0]!] as const] : [],
    ),
  );
  const history =
    terms.kind === 'player-prop' ? unique.filter((game) => playerStat.has(game.id)) : unique;
  const prediction = (game: FootballGame): number | undefined => {
    const prior = history.filter((row) => before(row, game));
    if (terms.kind === 'player-prop') {
      const values = prior.slice(-8).map((row) => playerStat.get(row.id)!);
      return values.length === 8 ? mean(values) : undefined;
    }
    const form = (team: string) =>
      prior.filter((row) => row.home === team || row.away === team).slice(-8);
    const home = form(game.home),
      away = form(game.away);
    if (home.length < 8 || away.length < 8) return undefined;
    const points = (rows: FootballGame[], team: string, offense: boolean) =>
      mean(rows.map((row) => ((row.home === team) === offense ? row.homeScore! : row.awayScore!)));
    const homeScore = (points(home, game.home, true) + points(away, game.away, false)) / 2;
    const awayScore = (points(away, game.away, true) + points(home, game.home, false)) / 2;
    return terms.kind === 'total' ? homeScore + awayScore : homeScore - awayScore;
  };
  const observations: { game: FootballGame; estimate: number; actual: number; error: number }[] =
    [];
  for (const game of history) {
    const estimate = prediction(game);
    if (estimate === undefined) continue;
    const actual =
      terms.kind === 'player-prop'
        ? playerStat.get(game.id)!
        : terms.kind === 'total'
          ? game.homeScore! + game.awayScore!
          : game.homeScore! - game.awayScore!;
    observations.push({ game, estimate, actual, error: actual - estimate });
  }
  const estimate = prediction(normalizedTarget);
  if (estimate === undefined || observations.length < 24)
    return {
      metrics: [],
      evaluationCases: [],
      warnings: [
        ...warnings,
        'The rolling forecast needs complete recent form and at least two dozen earlier prediction errors. No model probability was produced.',
      ],
    };
  const calibration = Array.from({ length: 5 }, () => ({ wins: 0, games: 0, predicted: 0 }));
  const evaluations: {
    game: FootballGame;
    raw: number;
    y: number;
    predicted: number;
    week: string;
    loss: number;
    baselineLoss: number;
  }[] = [];
  for (const observation of observations) {
    const residuals = observations
      .filter((row) => before(row.game, observation.game))
      .map((row) => row.error);
    if (residuals.length < 24) continue;
    const earlier = evaluations.filter((row) => before(row.game, observation.game));
    const raw = probability(observation.estimate, residuals, terms).p;
    const similar = earlier.filter((row) => bucket(row.raw) === bucket(raw));
    const predicted =
        (similar.reduce((sum, row) => sum + row.y, 0) + 20 * raw) / (similar.length + 20),
      baseline = (earlier.reduce((sum, row) => sum + row.y, 0) + 1) / (earlier.length + 2);
    const outcome = delta(observation.actual, terms);
    if (!outcome) continue;
    const y = Number(outcome > 0);
    evaluations.push({
      game: observation.game,
      raw,
      y,
      predicted,
      week: `${observation.game.season}:${observation.game.week}`,
      loss: (predicted - y) ** 2,
      baselineLoss: (baseline - y) ** 2,
    });
  }
  for (const row of evaluations) {
    const bin = calibration[bucket(row.raw)]!;
    bin.games++;
    bin.wins += row.y;
    bin.predicted += row.predicted;
  }
  const residuals = observations.map((row) => row.error),
    raw = probability(estimate, residuals, terms);
  const bin = calibration[bucket(raw.p)]!;
  const calibrated = (bin.wins + 20 * raw.p) / (bin.games + 20);
  const calibrationWeeks = new Set(
    evaluations.filter((row) => bucket(row.raw) === bucket(raw.p)).map((row) => row.week),
  ).size;
  // Games in the same week may be correlated. Use weeks as the effective band sample,
  // rather than treating every game/player-game as independent evidence.
  const effectiveWins = bin.games ? (bin.wins / bin.games) * calibrationWeeks : 0;
  const [lower, upper] =
    bin.games && calibrationWeeks
      ? [
          wilsonInterval(Math.floor(effectiveWins), calibrationWeeks)[0],
          wilsonInterval(Math.ceil(effectiveWins), calibrationWeeks)[1],
        ]
      : [0, 1];
  const weeks = new Map<string, number[]>();
  for (const evaluation of evaluations)
    weeks.set(evaluation.week, [
      ...(weeks.get(evaluation.week) ?? []),
      evaluation.baselineLoss - evaluation.loss,
    ]);
  const improvements = [...weeks.values()].map((values) => mean(values));
  const improvement = improvements.length ? mean(improvements) : 0;
  const se =
    improvements.length > 1
      ? Math.sqrt(
          improvements.reduce((sum, value) => sum + (value - improvement) ** 2, 0) /
            (improvements.length - 1) /
            improvements.length,
        )
      : 1;
  const fresh = sourceIds.every((id) => {
    const source = data.sources.find((source) => source.id === id),
      time = Date.parse(source?.retrievedAt ?? '');
    return (
      source?.status === 'available' &&
      Number.isFinite(time) &&
      time <= Date.parse(asOf) &&
      Date.parse(asOf) - time <= 24 * 3_600_000
    );
  });
  const forecast: BetModelForecast = {
    method: 'rolling-residual-v1',
    estimate,
    rawProbability: raw.p,
    probability: calibrated,
    lower: Math.min(lower, calibrated),
    upper: Math.max(upper, calibrated),
    pushRate: raw.pushRate,
    residualSamples: residuals.length,
    fresh,
    evaluation: {
      baselineKind: 'frequency',
      games: evaluations.length,
      weeks: weeks.size,
      brier: evaluations.length ? mean(evaluations.map((row) => row.loss)) : 1,
      baselineBrier: evaluations.length ? mean(evaluations.map((row) => row.baselineLoss)) : 1,
      improvementLower: improvement - 1.96 * se,
      calibrationSamples: bin.games,
      calibrationWeeks,
      calibrationObserved: bin.games ? bin.wins / bin.games : 0,
      calibrationPredicted: bin.games ? bin.predicted / bin.games : 0,
    },
  };
  if (!betForecastQualified(forecast))
    warnings.push(
      'Rolling evaluation is not strong enough for an actionable model pick. Inspect sample counts, baseline comparison, calibration and source freshness.',
    );
  const metrics: AdviceMetric[] = [];
  const metric = (
    id: string,
    label: string,
    value: number,
    unit: string,
    description: string,
    sampleSize?: number,
  ) =>
    metrics.push({
      id: `bet-model-${id}`,
      label,
      value,
      unit,
      sourceIds,
      ...(sampleSize !== undefined ? { sampleSize } : {}),
      description,
    });
  metric(
    'estimate',
    'Rolling model central estimate',
    estimate,
    terms.kind === 'player-prop' ? terms.stat! : 'points',
    'Eight earlier player appearances for props, or a blend of each team’s prior eight offensive and opposing defensive scores. No home advantage, injury or weather adjustment.',
  );
  metric(
    'probability',
    'Rolling model conditional win estimate',
    calibrated * 100,
    '%',
    'Prequential five-bin calibration shrunk toward the residual estimate. Conditional on a non-push outcome; experimental, not the AI judgment.',
    bin.games,
  );
  metric(
    'lower',
    'Similar-estimate calibration band: lower',
    forecast.lower * 100,
    '%',
    'Wilson-style band for earlier similar estimates, using weeks as an effective sample with outward rounding and widening to include the estimate. Not an individual-game certainty bound.',
    calibrationWeeks,
  );
  metric(
    'upper',
    'Similar-estimate calibration band: upper',
    forecast.upper * 100,
    '%',
    'Same weekly-effective empirical band; model shift and correlations between weeks remain outside this band.',
    calibrationWeeks,
  );
  metric(
    'push',
    'Rolling model push estimate',
    raw.pushRate * 100,
    '%',
    'Empirical prediction errors shifted to the current estimate, rounded to integer outcomes.',
    residuals.length,
  );
  metric(
    'evaluation',
    'Chronologically evaluated non-push games',
    evaluations.length,
    'games',
    'Each point estimate, error distribution and calibration step uses earlier weeks only. Today’s threshold is a fixed retrospective scenario.',
  );
  metric(
    'brier',
    'Rolling probability Brier score',
    forecast.evaluation.brier,
    'score',
    'Mean squared probability error; lower is better. Evaluated on later games before adding their outcomes to calibration.',
    evaluations.length,
  );
  metric(
    'baseline-brier',
    'Rolling-frequency baseline Brier score',
    forecast.evaluation.baselineBrier,
    'score',
    'Baseline uses only earlier evaluated outcomes at the same fixed threshold, without team/player features.',
    evaluations.length,
  );
  metric(
    'improvement-lower',
    'Weekly improvement lower bound',
    forecast.evaluation.improvementLower,
    'score',
    'Normal approximation over weekly mean loss differences. At least twelve weeks and a positive lower bound are required for support; this is not a profit test.',
    weeks.size,
  );
  const odds = americanOdds(terms.americanOdds);
  metrics.push({
    id: 'bet-model-return',
    label: 'Rolling model hypothetical return per unit',
    value: (1 - raw.pushRate) * (calibrated * odds.profitPerUnit - (1 - calibrated)) * 100,
    unit: '%',
    sourceIds: [...sourceIds, 'entered-odds'],
    description:
      'Model-implied return at entered odds with empirical push refunds; not historical betting ROI, realized profit or a guarantee.',
  });
  return {
    forecast,
    metrics,
    warnings,
    evaluationCases: evaluations.map((row) => ({
      gameId: row.game.id,
      season: row.game.season,
      week: row.game.week,
      probability: row.predicted,
      outcome: row.y,
    })),
  };
}
export type BetForecastOutput = ReturnType<typeof buildBetForecastLegacy>;
export function buildBetForecast(
  terms: BetTerms,
  data: FootballDataSnapshot,
  asOf: string,
  prepared?: GameRatingModel,
): BetForecastOutput {
  const market = buildMarketGameForecast(terms, data, asOf, prepared);
  if (market) return market;
  const fallback = buildBetForecastLegacy(terms, data, asOf);
  if (terms.kind !== 'player-prop' && fallback.forecast) {
    fallback.forecast.evaluation.baselineKind = 'frequency';
    fallback.warnings.push(
      'This scores-only fallback lacks paired sportsbook-baseline validation. Its frequency comparison does not support an actionable game-market edge.',
    );
  }
  return fallback;
}
