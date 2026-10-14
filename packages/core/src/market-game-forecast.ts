import type {
  BetTerms,
  FootballDataSnapshot,
  BetModelForecast,
  AdviceMetric,
  FootballGame,
} from './advice-types.js';
import { usablePregameContext, usablePersonnel } from './game-availability.js';
import { americanOdds, wilsonInterval, isUpcomingFootballGame } from './advice-math.js';
import {
  prepareGameRatingModel,
  canonicalTerms,
  residualProbability,
  ratingMean,
  gameRatingParameters,
  type GameRatingModel,
} from './game-rating-model.js';
import type { BetForecastOutput } from './bet-forecast.js';

// Four bounded immutable public-game contexts; exact canonical content detects in-place source changes.
const contexts = new Map<string, GameRatingModel>();
export function gameForecastContext(games: FootballGame[]): GameRatingModel {
  const key = JSON.stringify(
    games.map((g) => [
      g.id,
      g.season,
      g.week,
      g.seasonType,
      g.date,
      g.home,
      g.away,
      g.homeScore,
      g.awayScore,
      g.neutralSite,
      g.spreadLine,
      g.totalLine,
      g.archivedOdds,
      g.pregame,
    ]),
  );
  const cached = contexts.get(key);
  if (cached) return cached;
  const model = prepareGameRatingModel(games);
  contexts.set(key, model);
  while (contexts.size > 4) contexts.delete(contexts.keys().next().value!);
  return model;
}
/** Book odds are an explicit feature. Every correction and its validation uses earlier NFL weeks only. */
export function buildMarketGameForecast(
  terms: BetTerms,
  data: FootballDataSnapshot,
  asOf: string,
  prepared?: GameRatingModel,
): BetForecastOutput | undefined {
  if (terms.kind === 'player-prop' || terms.oppositeAmericanOdds === undefined) return;
  const targets = data.games.filter((g) => g.id === terms.gameId),
    target = targets.length === 1 ? targets[0] : undefined;
  if (!target || !isUpcomingFootballGame(target, asOf)) return;
  // A live forecast issued days before kickoff cannot know later, mislabeled prior-week outcomes.
  // Three nested market/blend validation windows, residual history and rating warmup are sufficient.
  const earliestSeason =
    target.season -
    (3 * gameRatingParameters.marketSeasons +
      gameRatingParameters.residualSeasons +
      gameRatingParameters.fitSeasons);
  const model =
      prepared && asOf.slice(0, 10) >= target.date
        ? prepared
        : gameForecastContext(
            data.games.filter(
              (g) =>
                g.season >= earliestSeason &&
                g.date < asOf.slice(0, 10) &&
                Number.isInteger(g.homeScore) &&
                Number.isInteger(g.awayScore),
            ),
          ),
    kind = terms.kind,
    observed = model.marketRows(kind, target);
  // Thin/missing archived market coverage retains the existing scores-only fallback.
  if (observed.length < 200) return;
  const point = model.point(target),
    errors = model.residuals(target, kind);
  if (!point || errors.length < 100) return;
  const orientation = canonicalTerms(terms),
    estimate = kind === 'total' ? point.total : point.margin;
  const raw = residualProbability(estimate, errors, orientation.threshold),
    chosen = americanOdds(terms.americanOdds).breakEvenRate,
    opposite = americanOdds(terms.oppositeAmericanOdds).breakEvenRate;
  const chosenBaseline = chosen / (chosen + opposite),
    baseline = orientation.reverse ? 1 - chosenBaseline : chosenBaseline;
  // Current handicap/total comes from the selected quote, not the target's archive fields.
  const quoteTarget = {
    ...target,
    ...(kind === 'spread'
      ? { spreadLine: orientation.threshold }
      : kind === 'total'
        ? { totalLine: orientation.threshold }
        : {}),
  };
  const pregame = usablePregameContext(quoteTarget, asOf);
  const enhanced = kind === 'total' && !!pregame && model.supportedAvailability(kind, quoteTarget);
  const adjust = (game: FootballGame, raw: number, book: number) =>
    enhanced
      ? model.adjustJointAvailability(kind, game, raw, book, 200)
      : model.adjust(kind, game, raw, book);
  const canonical = adjust(quoteTarget, raw.probability, baseline),
    p = orientation.reverse ? 1 - canonical : canonical;
  const evaluated = observed.map((r) => {
    const estimate = adjust(r.game, r.raw, r.baseline);
    return {
      game: r.game,
      p: orientation.reverse ? 1 - estimate : estimate,
      y: orientation.reverse ? 1 - r.y : r.y,
      baseline: orientation.reverse ? 1 - r.baseline : r.baseline,
    };
  });
  const bucket = (x: number) => Math.min(4, Math.floor(x * 5));
  const similar = evaluated.filter((r) => bucket(r.p) === bucket(p)),
    similarWeeks = new Set(similar.map((r) => `${r.game.season}:${r.game.week}`)).size;
  const effective = similar.length ? ratingMean(similar.map((r) => r.y)) * similarWeeks : 0;
  const bounds = similarWeeks
    ? [
        wilsonInterval(Math.floor(effective), similarWeeks)[0],
        wilsonInterval(Math.ceil(effective), similarWeeks)[1],
      ]
    : [0, 1];
  const weekly = new Map<string, number[]>();
  for (const r of evaluated) {
    const key = `${r.game.season}:${r.game.week}`,
      improvement = (r.baseline - r.y) ** 2 - (r.p - r.y) ** 2;
    weekly.set(key, [...(weekly.get(key) ?? []), improvement]);
  }
  const difference = ratingMean([...weekly.values()].flat()),
    se =
      weekly.size > 1
        ? Math.sqrt(
            (weekly.size / (weekly.size - 1)) *
              [...weekly.values()].reduce(
                (s, w) => s + (w.reduce((a, b) => a + b, 0) - difference * w.length) ** 2,
                0,
              ),
          ) / evaluated.length
        : 1;
  const source = data.sources.find((s) => s.id === 'games'),
    retrieved = Date.parse(source?.retrievedAt ?? ''),
    clock = Date.parse(asOf);
  const forecast: BetModelForecast = {
    method: enhanced ? 'health-weather-total-v4' : 'market-context-v3',
    estimate,
    rawProbability: orientation.reverse ? 1 - raw.probability : raw.probability,
    probability: p,
    lower: Math.min(bounds[0]!, p),
    upper: Math.max(bounds[1]!, p),
    pushRate: raw.pushRate,
    residualSamples: errors.length,
    fresh:
      source?.status === 'available' &&
      Number.isFinite(retrieved) &&
      retrieved <= clock &&
      clock - retrieved <= 86400000,
    evaluation: {
      baselineKind: 'sportsbook',
      games: evaluated.length,
      weeks: weekly.size,
      brier: ratingMean(evaluated.map((r) => (r.p - r.y) ** 2)),
      baselineBrier: ratingMean(evaluated.map((r) => (r.baseline - r.y) ** 2)),
      improvementLower: difference - 1.96 * se,
      calibrationSamples: similar.length,
      calibrationWeeks: similarWeeks,
      calibrationObserved: similar.length ? ratingMean(similar.map((r) => r.y)) : 0,
      calibrationPredicted: similar.length ? ratingMean(similar.map((r) => r.p)) : 0,
    },
  };
  const sources = [
      'games',
      'entered-odds',
      ...(pregame
        ? data.sources
            .filter(
              (s) =>
                (s.id === 'injuries' || s.id.startsWith('game-context-')) &&
                s.status === 'available',
            )
            .map((s) => s.id)
        : []),
    ],
    metrics: AdviceMetric[] = [];
  const add = (
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
      sourceIds: sources,
      ...(sampleSize === undefined ? {} : { sampleSize }),
      description,
    });
  add(
    'estimate',
    'Opponent-adjusted score estimate',
    estimate,
    'points',
    'Recency-weighted regularized offense/defense ratings fit before each NFL week, with a learned home effect removed at verified neutral venues. The score rating itself excludes injury/personnel/weather adjustments; supported totals can learn an additional probability correction.',
  );
  add(
    'probability',
    'Market-aware conditional win estimate',
    p * 100,
    '%',
    'Sportsbook no-vig probability plus a penalized earlier-week correction using score ratings, schedule rest, season phase, market line and prior team performance against the line. Moneyline corrections shrink using earlier out-of-week probability losses. This uses the book as an input and is not an independent betting edge.',
    observed.length,
  );
  add(
    'market-baseline',
    'Sportsbook no-vig probability',
    chosenBaseline * 100,
    '%',
    'Normalizes both entered/fetched prices to remove the paired implied margin. A probability baseline, not an executable price.',
  );
  add(
    'market-adjustment',
    'Learned adjustment from sportsbook baseline',
    (p - chosenBaseline) * 100,
    'percentage points',
    'Strongly regularized correction fit only on earlier archived-price games. A small positive adjustment does not establish an actionable edge.',
  );
  add(
    'lower',
    'Similar-estimate calibration band: lower',
    forecast.lower * 100,
    '%',
    'Weekly-effective Wilson-style empirical band, widened to include the forecast. It is not an individual-game certainty interval.',
    similarWeeks,
  );
  add(
    'upper',
    'Similar-estimate calibration band: upper',
    forecast.upper * 100,
    '%',
    'Correlations, source-publication timing, market drift and future personnel uncertainty remain outside this empirical band.',
    similarWeeks,
  );
  add(
    'push',
    'Rolling model push estimate',
    forecast.pushRate * 100,
    '%',
    'Earlier opponent-adjusted integer score residuals at the selected threshold.',
    errors.length,
  );
  add(
    'evaluation',
    'Chronologically evaluated non-push games',
    evaluated.length,
    'games',
    'Historical paired prices and each game’s own handicap/total. Every fitted score, residual distribution and market correction precedes the evaluated NFL week.',
  );
  add(
    'brier',
    'Market-aware probability Brier score',
    forecast.evaluation.brier,
    'score',
    'Mean squared probability error on matched historical priced games, excluding pushes; lower is better.',
    evaluated.length,
  );
  add(
    'baseline-brier',
    'Sportsbook baseline Brier score',
    forecast.evaluation.baselineBrier,
    'score',
    'No-vig paired sportsbook probabilities on exactly the same historical games, not a generic frequency baseline.',
    evaluated.length,
  );
  add(
    'improvement-lower',
    'Weekly market-baseline improvement lower bound',
    forecast.evaluation.improvementLower,
    'score',
    'Normal approximation for paired book-minus-model losses clustered by NFL week. Positive lower-bound improvement and adequate calibration are required for tentative support.',
    weekly.size,
  );
  const odds = americanOdds(terms.americanOdds);
  add(
    'return',
    'Market-aware hypothetical return per unit',
    (1 - raw.pushRate) * (p * odds.profitPerUnit - (1 - p)) * 100,
    '%',
    'Model-implied return at the selected odds, not measured ROI or guaranteed profit.',
  );
  if (pregame) {
    const history = observed.flatMap((r) => {
      const p = usablePregameContext(r.game);
      return p ? [p] : [];
    });
    add(
      'injury-context-games',
      'Earlier games with dated injury reports',
      history.filter((p) => p.home.reportUpdatedAt && p.away.reportUpdatedAt).length,
      'games',
      'Only published report updates before each prediction cutoff. This includes descriptive official article coverage excluded from quantitative correction. Reported Out counts do not measure every injury or prove unlisted players healthy.',
    );
    add(
      'weather-context-games',
      'Earlier games with regional weather forecasts',
      history.filter((p) => p.weather).length,
      'games',
      'JMA GSM archived 48-hour-lead wind, temperature and precipitation; coarse regional forecasts, not observed stadium weather.',
    );
    add(
      'quarterback-change-games',
      'Earlier captured quarterback chart changes',
      history.filter((p) => p.home.quarterbackChanged || p.away.quarterbackChanged).length,
      'games',
      'Dated rank-one depth-chart changes relative to earlier recorded starters. These are not independently confirmed game-day starters. Older undated depth charts are excluded.',
    );
    for (const [side, team] of [
      ['home', pregame.home],
      ['away', pregame.away],
    ] as const) {
      const personnel = usablePersonnel(quoteTarget, side);
      if (personnel) {
        add(
          `${side}-personnel-matches`,
          `${side}: injury players matched to prior snap roles`,
          personnel.matchedReports,
          'players',
          `Matched ${personnel.matchedReports} of ${personnel.reportedPlayers} reported players to the last three earlier completed team games. Missing matches stay unknown; absence is not zero participation.`,
        );
        if (personnel.quarterbackQuality !== undefined)
          add(
            `${side}-quarterback-efficiency`,
            `${side}: recent quarterback passing efficiency`,
            personnel.quarterbackQuality,
            'relative index',
            'Shrunken adjusted net passing yards per dropback from up to eight earlier appearances, using strict IDs or a unique name. The captured chart or last starter is not confirmed participation. This research context does not change production probabilities.',
          );
        for (const [key, label] of [
          ['quarterbackEpa', 'recent quarterback passing and rushing EPA'],
          ['quarterbackTeamDelta', 'quarterback EPA relative to recent team QBs'],
        ] as const)
          if (personnel[key] !== undefined)
            add(
              `${side}-${key}`,
              `${side}: ${label}`,
              personnel[key],
              'EPA per play',
              'Up to eight earlier completed appearances, recency weighted and shrunk by 100 plays toward zero. Includes passing, sacks and rushing exposure; not opponent-adjusted intrinsic value or a confirmed starter. Archive revisions/publication timing are not verified. This descriptive input does not change production probabilities.',
            );
        for (const [key, label] of [
          ['offensiveLineOutSnaps', 'reported Out offensive-line roles'],
          ['offenseDnpSnaps', 'injury-related missed-practice offensive roles'],
          ['defenseDnpSnaps', 'injury-related missed-practice defensive roles'],
        ] as const)
          if (personnel[key] !== undefined)
            add(
              `${side}-${key}`,
              `${side}: ${label}`,
              personnel[key],
              'starter equivalents',
              'Prior snap roles, with incomplete matches or practice observations withheld. Rest/personal absences are excluded from practice burden. Designations are observations, not participation probabilities or point penalties. These experimental inputs do not change production probabilities.',
            );
        for (const [key, label] of [
          ['offenseOutSnaps', 'offensive'],
          ['defenseOutSnaps', 'defensive'],
        ] as const)
          if (personnel[key] !== undefined)
            add(
              `${side}-${key}`,
              `${side}: reported absent ${label} snap roles`,
              personnel[key],
              'starter equivalents',
              'Sum of prior snap fractions for reported Out players, only when every identity in this group has a prior role match. A role estimate is not an injury severity or point penalty. Experimental snap-weight corrections were rejected; these values are descriptive.',
            );
      }
      if (team.reportUpdatedAt) {
        add(
          `${side}-offense-out`,
          `${side}: reported offensive absences`,
          team.offenseOut ?? 0,
          'players',
          'Players with a dated Out game designation, excluding QB. No fixed points penalty or assumed playing probability.',
        );
        add(
          `${side}-defense-out`,
          `${side}: reported defensive absences`,
          team.defenseOut ?? 0,
          'players',
          'Dated Out game designations; injury severity, IR omissions and uncertain participation remain outside these counts.',
        );
      }
      if (team.quarterbackOut !== undefined)
        add(
          `${side}-quarterback-out`,
          `${side}: previous quarterback reported Out${team.previousQuarterbackName ? ` (${team.previousQuarterbackName})` : ''}`,
          Number(team.quarterbackOut),
          'indicator',
          'One means the last recorded starter has a dated Out report. Zero means not reported Out, not proven healthy.',
        );
      if (team.quarterbackChanged !== undefined)
        add(
          `${side}-quarterback-changed`,
          `${side}: quarterback depth chart changed${team.expectedQuarterbackName ? ` (${team.expectedQuarterbackName})` : ''}`,
          Number(team.quarterbackChanged),
          'indicator',
          'Captured rank-one quarterback differs from the most recent recorded starter. A depth-chart listing is not confirmed participation.',
        );
    }
    if (pregame.weather) {
      add(
        'weather-wind',
        'Kickoff regional forecast wind',
        pregame.weather.windKph,
        'km/h',
        'Sustained 10-metre wind in the archived 48-hour-lead JMA GSM forecast, not stadium gusts.',
      );
      add(
        'weather-temperature',
        'Kickoff regional forecast temperature',
        pregame.weather.temperatureC,
        '°C',
        'Outdoor supported venue only; covered/retractable/unverified venues remain unknown.',
      );
      add(
        'weather-rain',
        'Kickoff regional forecast precipitation',
        pregame.weather.precipitationMm,
        'mm/hour',
        'Forecast precipitation at kickoff hour; no postgame observations.',
      );
    }
  }
  const warnings = [
    'This experimental game model uses both entered/fetched sportsbook prices as inputs; improvement over the old scores-only model is not an independent market edge.',
    'Opponent-adjusted ratings, rest, season phase, prior team results against the line and regularized corrections use earlier NFL weeks. Moneyline corrections shrink toward the book based on earlier chronological evaluation. Personnel/weather effects are only learned for supported v4 totals. Price movement, injury severity and confirmed participation remain outside the model.',
    'Historical market-publication times and sportsbook identity are unavailable. Archive-price validation cannot establish historical availability, executable fills or future profitability.',
    'Calibration bands use weeks as effective samples, not individual-game certainty. Missing paired current prices or enough priced history retains the legacy fallback.',
  ];
  if (pregame) {
    if (pregame.home.personnel || pregame.away.personnel)
      warnings.push(
        'Prior snap roles and quarterback efficiency are descriptive context. Their tested corrections worsened older development error, so production probabilities retain the existing v3/v4 procedures.',
      );
    if (
      pregame.home.reportSource === 'nfl-official' ||
      pregame.away.reportSource === 'nfl-official'
    )
      warnings.push(
        'Official NFL injury articles are dated descriptive context; their experimental numerical correction was rejected and is disabled. Their latest modification must precede the prediction cutoff. Coverage is partial; an early original publication does not authorize later edits.',
      );
    if (pregame.home.reportSource === 'espn' || pregame.away.reportSource === 'espn')
      warnings.push(
        'Current injury inputs are dated event-linked ESPN publisher statuses; historical fitting uses earlier nflverse reports. Cross-provider coverage/definitions and future accuracy remain unverified. Injured-reserve states are not converted to game Out labels.',
      );
    warnings.push(
      enhanced
        ? 'V4 totals learn a regularized correction using supported injury designations, dated quarterback chart changes and regional weather forecasts. These effects are learned from earlier games, not fixed point penalties.'
        : 'Injury, quarterback and weather context is descriptive for this estimate. Older development tests favored retaining v3 for moneylines/spreads; no quantitative improvement was inferred for those markets.',
    );
    if (!pregame.weather)
      warnings.push(
        'Weather input is unavailable or the venue exposure/identity is unsupported; no outdoor weather effect was invented.',
      );
    if (!pregame.home.reportUpdatedAt || !pregame.away.reportUpdatedAt)
      warnings.push(
        'Dated injury coverage is incomplete. Missing reports do not establish healthy teams.',
      );
    if (
      pregame.home.quarterbackChanged === undefined ||
      pregame.away.quarterbackChanged === undefined
    )
      warnings.push(
        'A dated quarterback depth-chart change is not supported for both teams. Target archive starters and undated charts are excluded.',
      );
  }
  if (target.neutralSite === undefined)
    warnings.push(
      'Venue classification is missing; the score model uses the listed home role without independent venue confirmation.',
    );
  if (
    forecast.evaluation.improvementLower <= 0 ||
    forecast.evaluation.brier >= forecast.evaluation.baselineBrier
  )
    warnings.push(
      'Earlier paired evaluation does not establish an accuracy advantage over the sportsbook baseline. Withhold an actionable model pick.',
    );
  return {
    forecast,
    metrics,
    warnings,
    evaluationCases: evaluated.map((r) => ({
      gameId: r.game.id,
      season: r.game.season,
      week: r.game.week,
      probability: r.p,
      outcome: r.y,
    })),
  };
}
