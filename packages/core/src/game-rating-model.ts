import type { FootballGame, BetTerms } from './advice-types.js';
import { nflTeamKey, americanOdds } from './advice-math.js';
import {
  availabilityFeatures,
  usablePregameContext,
  usablePersonnel,
  personnelFeatures,
} from './game-availability.js';
import { priorMarketContext, correctionWeight, type PriorMarketContext } from './market-context.js';

// Score parameters retained from v2; context/blend selected only on 2016–2021 development cases.
// Later seasons are a reused historical audit, not untouched evidence of a sportsbook edge.
export const gameRatingParameters = Object.freeze({
  ridge: 4,
  halfLifeDays: 240,
  marketRidge: 200,
  fitSeasons: 2,
  residualSeasons: 3,
  marketSeasons: 4,
});
type Kind = 'moneyline' | 'spread' | 'total';
export const earlierGame = (a: FootballGame, b: FootballGame) =>
  a.date < b.date && (a.season < b.season || (a.season === b.season && a.week < b.week));
const mean = (v: number[]) => v.reduce((s, n) => s + n, 0) / v.length;
const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const clipped = (x: number) => Math.max(-4, Math.min(4, x));
export interface RatingObservation {
  game: FootballGame;
  margin: number;
  total: number;
  marginError: number;
  totalError: number;
  markets: Partial<Record<Kind, MarketObservation>>;
}
export interface MarketObservation {
  game: FootballGame;
  raw: number;
  baseline: number;
  y: number;
  push: boolean;
  context: PriorMarketContext;
}
export interface ScoreEstimate {
  margin: number;
  total: number;
}
/** Sparse ridge coordinates: two score equations per prior game, opponent offense/defense and neutral-aware home effect. */
export function fitTeamScores(
  prior: FootballGame[],
  origin: FootballGame,
): (game: FootballGame) => ScoreEstimate | undefined {
  const rows = prior.filter(
    (g) => earlierGame(g, origin) && g.season >= origin.season - gameRatingParameters.fitSeasons,
  );
  const teams = [...new Set(rows.flatMap((g) => [g.home, g.away]))].sort();
  if (rows.length < 200 || teams.length > 64) return () => undefined;
  const idx = new Map(teams.map((t, i) => [t, i]));
  const n = 2 + teams.length * 2,
    links: { row: number; x: number; weight: number }[][] = Array.from({ length: n }, () => []),
    coefficients = new Float64Array(n),
    residuals: number[] = [];
  let sum = 0,
    weight = 0;
  for (const game of rows) {
    const w =
      2 **
      (-Math.max(0, (Date.parse(origin.date) - Date.parse(game.date)) / 86400000) /
        gameRatingParameters.halfLifeDays);
    for (const home of [true, false]) {
      const team = home ? game.home : game.away,
        opponent = home ? game.away : game.home,
        y = home ? game.homeScore! : game.awayScore!;
      const features = [
        [0, 1],
        [1, game.neutralSite ? 0 : home ? 0.5 : -0.5],
        [2 + idx.get(team)!, 1],
        [2 + teams.length + idx.get(opponent)!, 1],
      ];
      const row = residuals.length;
      residuals.push(y);
      sum += w * y;
      weight += w;
      for (const [k, x] of features) if (x) links[k!]!.push({ row, x: x!, weight: w });
    }
  }
  coefficients[0] = sum / weight;
  for (let i = 0; i < residuals.length; i++) residuals[i]! -= coefficients[0]!;
  for (let round = 0; round < 35; round++) {
    let maximum = 0;
    for (let k = 0; k < n; k++) {
      const penalty =
        k === 0 ? 0 : k === 1 ? gameRatingParameters.ridge * 2 : gameRatingParameters.ridge;
      let numerator = 0,
        denominator = penalty;
      for (const r of links[k]!) {
        numerator += r.weight * r.x * residuals[r.row]!;
        denominator += r.weight * r.x * r.x;
      }
      if (!denominator) continue;
      const delta = (numerator - penalty * coefficients[k]!) / denominator;
      coefficients[k]! += delta;
      maximum = Math.max(maximum, Math.abs(delta));
      for (const r of links[k]!) residuals[r.row]! -= delta * r.x;
    }
    if (maximum < 1e-5) break;
  }
  return (game) => {
    const home = idx.get(game.home),
      away = idx.get(game.away);
    if (home === undefined || away === undefined) return;
    const h =
      coefficients[0]! +
      (game.neutralSite ? 0 : coefficients[1]! / 2) +
      coefficients[2 + home]! +
      coefficients[2 + teams.length + away]!;
    const a =
      coefficients[0]! -
      (game.neutralSite ? 0 : coefficients[1]! / 2) +
      coefficients[2 + away]! +
      coefficients[2 + teams.length + home]!;
    return { margin: h - a, total: h + a };
  };
}
export function residualProbability(estimate: number, errors: number[], threshold: number) {
  let wins = 0,
    losses = 0;
  for (const error of errors) {
    const outcome = Math.round(estimate + error) - threshold;
    if (outcome > 0) wins++;
    else if (outcome < 0) losses++;
  }
  return {
    probability: (wins + 0.5) / (wins + losses + 1),
    pushRate: errors.length ? (errors.length - wins - losses) / errors.length : 0,
  };
}
export function canonicalBookProbability(game: FootballGame, kind: Kind): number | undefined {
  const odds = game.archivedOdds;
  if (!odds) return;
  const a =
      kind === 'moneyline'
        ? odds.homeMoneyline
        : kind === 'spread'
          ? odds.homeSpreadOdds
          : odds.overOdds,
    b =
      kind === 'moneyline'
        ? odds.awayMoneyline
        : kind === 'spread'
          ? odds.awaySpreadOdds
          : odds.underOdds;
  if (
    a === undefined ||
    b === undefined ||
    ![a, b].every((n) => Number.isInteger(n) && Math.abs(n) >= 100 && Math.abs(n) <= 100000)
  )
    return;
  const p = americanOdds(a).breakEvenRate,
    q = americanOdds(b).breakEvenRate;
  return p / (p + q);
}
const threshold = (game: FootballGame, kind: Kind) =>
  kind === 'moneyline' ? 0 : kind === 'spread' ? game.spreadLine : game.totalLine;
function validGames(input: FootballGame[]): FootballGame[] {
  if (input.length > 10000) return [];
  const groups = new Map<string, FootballGame[]>();
  for (const g of input) {
    if (
      g.seasonType !== 'REG' ||
      g.week < 1 ||
      g.week > 18 ||
      !Number.isFinite(Date.parse(g.date)) ||
      !Number.isInteger(g.homeScore) ||
      !Number.isInteger(g.awayScore) ||
      g.homeScore! < 0 ||
      g.awayScore! < 0 ||
      g.homeScore! > 100 ||
      g.awayScore! > 100
    )
      continue;
    const game = { ...g, home: nflTeamKey(g.home), away: nflTeamKey(g.away) };
    const pregame = usablePregameContext(game);
    if (pregame) game.pregame = structuredClone(pregame);
    else delete game.pregame;
    const key = `${g.season}:${g.week}:${game.home}:${game.away}`;
    groups.set(key, [...(groups.get(key) ?? []), game]);
  }
  const rows = [...groups.values()].flatMap((g) =>
      new Set(g.map((r) => JSON.stringify(r))).size === 1 ? [g[0]!] : [],
    ),
    ids = new Map<string, number>(),
    weeks = new Map<string, number>();
  for (const g of rows) {
    ids.set(g.id, (ids.get(g.id) ?? 0) + 1);
    for (const t of [g.home, g.away]) {
      const k = `${g.season}:${g.week}:${t}`;
      weeks.set(k, (weeks.get(k) ?? 0) + 1);
    }
  }
  return rows
    .filter(
      (g) =>
        ids.get(g.id) === 1 &&
        [g.home, g.away].every((t) => weeks.get(`${g.season}:${g.week}:${t}`) === 1),
    )
    .sort(
      (a, b) =>
        a.season - b.season ||
        a.week - b.week ||
        a.date.localeCompare(b.date) ||
        a.id.localeCompare(b.id),
    );
}
/** Fits every origin before its outcomes. A replay may contain future rows, but no fit or query reads their outcomes. */
export function prepareGameRatingModel(
  input: FootballGame[],
  research: { includeExperimentalOfficialReports?: boolean } = {},
) {
  // Research-only counterfactual; HTTP/live callers never enable rejected source corrections.
  const includeOfficial = research.includeExperimentalOfficialReports === true;
  const games = validGames(input),
    observations: RatingObservation[] = [],
    pointFits = new Map<string, ReturnType<typeof fitTeamScores>>();
  const origins = new Map<string, FootballGame[]>();
  const context = (origin: FootballGame) => priorMarketContext(games, origin);
  for (const g of games) {
    const key = `${g.season}:${g.week}`;
    origins.set(key, [...(origins.get(key) ?? []), g]);
  }
  for (const [key, targets] of origins) {
    const origin = targets.reduce((a, b) => (a.date < b.date ? a : b)),
      prior = games.filter((g) => earlierGame(g, origin));
    const fit = fitTeamScores(prior, origin);
    pointFits.set(key, fit);
    const earlier = observations.filter(
      (r) =>
        earlierGame(r.game, origin) &&
        r.game.season >= origin.season - gameRatingParameters.residualSeasons,
    );
    const margins = earlier.map((r) => r.marginError),
      totals = earlier.map((r) => r.totalError);
    for (const g of targets) {
      const point = fit(g);
      if (!point) continue;
      const r: RatingObservation = {
        game: g,
        ...point,
        marginError: g.homeScore! - g.awayScore! - point.margin,
        totalError: g.homeScore! + g.awayScore! - point.total,
        markets: {},
      };
      const priorContext = context(g);
      for (const kind of ['moneyline', 'spread', 'total'] as const) {
        const baseline = canonicalBookProbability(g, kind),
          line = threshold(g, kind),
          errors = kind === 'total' ? totals : margins;
        if (baseline === undefined || line === undefined || errors.length < 100) continue;
        const actual =
          (kind === 'total' ? g.homeScore! + g.awayScore! : g.homeScore! - g.awayScore!) - line;
        const raw = residualProbability(
          kind === 'total' ? point.total : point.margin,
          errors,
          line,
        ).probability;
        r.markets[kind] = {
          game: g,
          raw,
          baseline,
          y: actual > 0 ? 1 : 0,
          push: actual === 0,
          context: priorContext,
        };
      }
      observations.push(r);
    }
  }
  const coefficients = new Map<string, number[]>();
  const marketRows = (kind: Kind, origin: FootballGame) =>
    observations.flatMap((r) =>
      earlierGame(r.game, origin) &&
      r.game.season >= origin.season - gameRatingParameters.marketSeasons &&
      r.markets[kind] &&
      !r.markets[kind]!.push
        ? [r.markets[kind]!]
        : [],
    );
  const weights = new Map<string, number>();
  const contexts = new Map<string, PriorMarketContext>();
  function candidateAdjust(
    kind: Kind,
    origin: FootballGame,
    raw: number,
    baseline: number,
    legacy = false,
    availability = false,
    penalty = gameRatingParameters.marketRidge,
  ) {
    const key = `${legacy ? 'v2' : availability ? `v4-${penalty}` : 'v3'}:${kind}:${origin.season}:${origin.week}:${origin.date}`;
    let c = coefficients.get(key);
    if (!c) {
      c = fitMarketAdjustment(
        marketRows(kind, origin),
        kind,
        legacy,
        availability,
        penalty,
        includeOfficial,
      );
      coefficients.set(key, c);
      while (coefficients.size > 2048) coefficients.delete(coefficients.keys().next().value!);
    } else {
      coefficients.delete(key);
      coefficients.set(key, c);
    }
    const contextKey = `${origin.id}:${origin.season}:${origin.week}:${origin.date}:${origin.home}:${origin.away}`;
    let features = contexts.get(contextKey);
    if (!features) {
      features = context(origin);
      contexts.set(contextKey, features);
      while (contexts.size > 10000) contexts.delete(contexts.keys().next().value!);
    }
    const x = marketFeatures(
      kind,
      origin,
      raw,
      baseline,
      features,
      legacy,
      availability,
      includeOfficial,
    );
    return sigmoid(logit(baseline) + c.reduce((sum, value, i) => sum + value * x[i]!, 0));
  }
  const meaningful = (g: FootballGame) => {
    const p = usablePregameContext(g);
    return (
      !!p &&
      !!(
        p.weather ||
        (p.home.reportUpdatedAt &&
          p.away.reportUpdatedAt &&
          (includeOfficial ||
            (p.home.reportSource !== 'nfl-official' && p.away.reportSource !== 'nfl-official'))) ||
        (p.home.quarterbackChanged !== undefined && p.away.quarterbackChanged !== undefined)
      )
    );
  };
  const availabilityHistory = new Set(
    observations.filter((r) => meaningful(r.game)).map((r) => r.game.id),
  );
  const availabilityCounts = new Map<string, number>();
  function supportedAvailability(kind: Kind, origin: FootballGame) {
    if (!meaningful(origin)) return false;
    const key = `${kind}:${origin.season}:${origin.week}:${origin.date}`;
    let count = availabilityCounts.get(key);
    if (count === undefined) {
      count = marketRows(kind, origin).filter((r) => availabilityHistory.has(r.game.id)).length;
      availabilityCounts.set(key, count);
      while (availabilityCounts.size > 2048)
        availabilityCounts.delete(availabilityCounts.keys().next().value!);
    }
    return count >= 200;
  }
  function adjust(
    kind: Kind,
    origin: FootballGame,
    raw: number,
    baseline: number,
    availability = false,
    penalty = gameRatingParameters.marketRidge,
  ): number {
    if (availability && !supportedAvailability(kind, origin))
      return adjust(kind, origin, raw, baseline);
    const candidate = candidateAdjust(kind, origin, raw, baseline, false, availability, penalty);
    if (kind !== 'moneyline') return candidate;
    const key = `${availability ? `v4-${penalty}` : 'v3'}:${origin.season}:${origin.week}:${origin.date}`;
    let weight = weights.get(key);
    if (weight === undefined) {
      weight = correctionWeight(
        marketRows(kind, origin).map((r) => ({
          probability:
            availability && !supportedAvailability(kind, r.game)
              ? adjust(kind, r.game, r.raw, r.baseline)
              : candidateAdjust(kind, r.game, r.raw, r.baseline, false, availability, penalty),
          baseline: r.baseline,
          outcome: r.y,
        })),
      );
      weights.set(key, weight);
      while (weights.size > 2048) weights.delete(weights.keys().next().value!);
    } else {
      weights.delete(key);
      weights.set(key, weight);
    }
    return baseline + weight * (candidate - baseline);
  }
  const offsetProbabilities = new Map<string, number>();
  const offsetCoefficients = new Map<string, number[]>();
  const personnelInputs = (
    kind: Kind,
    game: FootballGame,
    family: 'all' | 'quarterback' | 'injuries',
  ) =>
    personnelFeatures(kind, game).map((x, i) =>
      (family === 'quarterback' && i >= 2) || (family === 'injuries' && i < 2) ? 0 : x,
    );
  const personnelHistory = new Map(
    ['all', 'quarterback', 'injuries'].map((family) => [
      family,
      new Set(
        observations
          .filter(
            (r) =>
              usablePersonnel(r.game, 'home') &&
              usablePersonnel(r.game, 'away') &&
              ['moneyline', 'total'].some((kind) =>
                personnelInputs(
                  kind as Kind,
                  r.game,
                  family as 'all' | 'quarterback' | 'injuries',
                ).some((x) => x !== 0),
              ),
          )
          .map((r) => r.game.id),
      ),
    ]),
  );
  const personnelCounts = new Map<string, number>();
  function supportedPersonnel(
    kind: Kind,
    origin: FootballGame,
    family: 'all' | 'quarterback' | 'injuries' = 'all',
  ) {
    if (
      !usablePersonnel(origin, 'home') ||
      !usablePersonnel(origin, 'away') ||
      !personnelInputs(kind, origin, family).some((x) => x !== 0)
    )
      return false;
    const key = `${family}:${kind}:${origin.season}:${origin.week}:${origin.date}`;
    let count = personnelCounts.get(key);
    if (count === undefined) {
      count = marketRows(kind, origin).filter((r) =>
        personnelHistory.get(family)!.has(r.game.id),
      ).length;
      personnelCounts.set(key, count);
      while (personnelCounts.size > 2048)
        personnelCounts.delete(personnelCounts.keys().next().value!);
    }
    return count >= 200;
  }
  function adjustOffset(
    kind: Kind,
    origin: FootballGame,
    raw: number,
    baseline: number,
    penalty: number,
    personnel = false,
    family: 'all' | 'quarterback' | 'injuries' = 'all',
  ): number {
    const previous = (game: FootballGame, raw: number, book: number) =>
      kind === 'total' && personnel
        ? adjust(kind, game, raw, book, true, 200)
        : adjust(kind, game, raw, book);
    const base = previous(origin, raw, baseline);
    if (
      personnel ? !supportedPersonnel(kind, origin, family) : !supportedAvailability(kind, origin)
    )
      return base;
    const key = `${personnel ? `personnel-${family}` : 'availability'}:${kind}:${penalty}:${origin.season}:${origin.week}:${origin.date}`;
    let c = offsetCoefficients.get(key);
    if (!c) {
      const rows = marketRows(kind, origin).map((r) => {
        const key = `${personnel ? 'personnel' : 'availability'}:${kind}:${r.game.id}`;
        let probability = offsetProbabilities.get(key);
        if (probability === undefined) {
          probability = previous(r.game, r.raw, r.baseline);
          offsetProbabilities.set(key, probability);
        }
        return {
          offset: logit(probability),
          x: personnel
            ? personnelInputs(kind, r.game, family)
            : availabilityFeatures(kind, r.game, undefined, includeOfficial),
          y: r.y,
        };
      });
      c = fitOffsetFeatures(rows, penalty, personnel ? 6 : 8);
      offsetCoefficients.set(key, c);
      while (offsetCoefficients.size > 2048)
        offsetCoefficients.delete(offsetCoefficients.keys().next().value!);
      while (offsetProbabilities.size > 30000)
        offsetProbabilities.delete(offsetProbabilities.keys().next().value!);
    } else {
      offsetCoefficients.delete(key);
      offsetCoefficients.set(key, c);
    }
    const x = personnel
      ? personnelInputs(kind, origin, family)
      : availabilityFeatures(kind, origin, undefined, includeOfficial);
    return sigmoid(logit(base) + c.reduce((sum, v, i) => sum + v * x[i]!, 0));
  }
  return {
    observations,
    marketRows,
    adjust: (kind: Kind, origin: FootballGame, raw: number, baseline: number) =>
      adjust(kind, origin, raw, baseline),
    supportedAvailability,
    supportedPersonnel,
    adjustPersonnel: (
      kind: Kind,
      origin: FootballGame,
      raw: number,
      baseline: number,
      penalty = 200,
      family: 'all' | 'quarterback' | 'injuries' = 'all',
    ) => adjustOffset(kind, origin, raw, baseline, penalty, true, family),
    adjustJointAvailability: (
      kind: Kind,
      origin: FootballGame,
      raw: number,
      baseline: number,
      penalty = gameRatingParameters.marketRidge,
    ) => adjust(kind, origin, raw, baseline, true, penalty),
    adjustWithAvailability: (
      kind: Kind,
      origin: FootballGame,
      raw: number,
      baseline: number,
      penalty = gameRatingParameters.marketRidge,
    ) => adjustOffset(kind, origin, raw, baseline, penalty),
    adjustV2: (kind: Kind, origin: FootballGame, raw: number, baseline: number) =>
      candidateAdjust(kind, origin, raw, baseline, true),
    point(origin: FootballGame) {
      const normalized = {
        ...origin,
        home: nflTeamKey(origin.home),
        away: nflTeamKey(origin.away),
      };
      // The target itself (even a completed archived row) is never passed to this fit.
      const key = `${origin.season}:${origin.week}`;
      let fit = pointFits.get(key);
      if (!fit) {
        fit = fitTeamScores(
          games.filter((g) => earlierGame(g, origin)),
          origin,
        );
        pointFits.set(key, fit);
      }
      return fit(normalized);
    },
    residuals(origin: FootballGame, kind: Kind) {
      return observations
        .filter(
          (r) =>
            earlierGame(r.game, origin) &&
            r.game.season >= origin.season - gameRatingParameters.residualSeasons,
        )
        .map((r) => (kind === 'total' ? r.totalError : r.marginError));
    },
  };
}
export type GameRatingModel = ReturnType<typeof prepareGameRatingModel>;
function marketFeatures(
  kind: Kind,
  game: FootballGame,
  raw: number,
  baseline: number,
  context: PriorMarketContext,
  legacy: boolean,
  availability = false,
  includeOfficial = false,
) {
  const b = logit(baseline),
    x = [1, b, clipped(logit(raw) - b)];
  if (!legacy)
    x.push(
      context.restDifference,
      context.restTotal,
      (game.week - 9) / 9,
      kind === 'total'
        ? clipped(((game.totalLine ?? 45) - 45) / 10)
        : kind === 'spread'
          ? clipped((game.spreadLine ?? 0) / 10)
          : clipped((b * Math.abs(b)) / 4),
      kind === 'total' ? context.teamTotal : context.teamMargin,
    );
  if (availability) x.push(...availabilityFeatures(kind, game, undefined, includeOfficial));
  return x;
}
/** Ridge correction to the book; v2/v3 are retained for matched upgrade comparisons. */
function fitMarketAdjustment(
  rows: MarketObservation[],
  kind: Kind,
  legacy: boolean,
  availability = false,
  penalty = gameRatingParameters.marketRidge,
  includeOfficial = false,
): number[] {
  const prepared = rows.map((r) => ({
    offset: logit(r.baseline),
    x: marketFeatures(
      kind,
      r.game,
      r.raw,
      r.baseline,
      r.context,
      legacy,
      availability,
      includeOfficial,
    ),
    y: r.y,
  }));
  return fitOffsetFeatures(prepared, penalty, legacy ? 3 : availability ? 16 : 8);
}
/** Extra evidence corrects earlier out-of-week v3 predictions; zero inputs leave v3 exactly unchanged. */
export function fitOffsetFeatures(
  prepared: { offset: number; x: number[]; y: number }[],
  penalty: number,
  n = 8,
): number[] {
  const c = Array<number>(n).fill(0);
  for (let step = 0; step < 12; step++) {
    const gradient = c.map((v) => -penalty * v),
      hessian = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => (i === j ? penalty : 0)),
      );
    for (const r of prepared) {
      const p = sigmoid(r.offset + c.reduce((s, v, i) => s + v * r.x[i]!, 0));
      for (let i = 0; i < n; i++) {
        gradient[i]! += r.x[i]! * (r.y - p);
        for (let j = 0; j < n; j++) hessian[i]![j]! += r.x[i]! * r.x[j]! * p * (1 - p);
      }
    }
    const a = hessian.map((r, i) => [...r, gradient[i]!]);
    for (let i = 0; i < n; i++) {
      const d = a[i]![i]!;
      for (let k = i; k <= n; k++) a[i]![k]! /= d;
      for (let j = 0; j < n; j++)
        if (j !== i) {
          const v = a[j]![i]!;
          for (let k = i; k <= n; k++) a[j]![k]! -= v * a[i]![k]!;
        }
    }
    const delta = a.map((r) => r[n]!);
    for (let i = 0; i < n; i++) c[i]! += delta[i]!;
    if (Math.max(...delta.map(Math.abs)) < 1e-5) break;
  }
  return c;
}
export function canonicalTerms(terms: BetTerms) {
  return {
    reverse: terms.side === 'away' || terms.side === 'under',
    threshold:
      terms.kind === 'moneyline'
        ? 0
        : terms.kind === 'spread'
          ? terms.side === 'home'
            ? -terms.line!
            : terms.line!
          : terms.line!,
  };
}
export const ratingMean = mean;
