import type { FootballGame } from '../advice-types.js';
import { earlierGame, type GameRatingModel } from '../game-rating-model.js';

export interface TotalFeedbackRow {
  game: FootballGame;
  book: number;
  rawProbability: number;
  y: 0 | 1;
  supported: boolean;
}
export interface RecentTotalFeedbackSpec {
  halfLifeWeeks: 2 | 4;
  maxWeight: 0.5 | 1;
  priorSeed: boolean;
}
export const recentTotalFeedbackParameters = Object.freeze({
  currentWindowWeeks: 6,
  priorSeedWindowWeeks: 4,
  priorSeedEquivalentGames: 16,
  priorSeedFadeWeeks: 4,
  minimumGames: 24,
  minimumWeeks: 2,
  minimumEffectiveGames: 12,
  feedbackRidge: 0.02,
  publicationLagHours: 48,
  maxRows: 10000,
});

function validGame(game: FootballGame) {
  return (
    game &&
    typeof game.id === 'string' &&
    game.id.length > 0 &&
    game.id.length <= 80 &&
    Number.isInteger(game.season) &&
    game.season >= 1990 &&
    game.season <= 2099 &&
    Number.isInteger(game.week) &&
    game.week >= 1 &&
    game.week <= 18 &&
    Number.isFinite(Date.parse(game.date)) &&
    !!game.kickoffAt &&
    Number.isFinite(Date.parse(game.kickoffAt))
  );
}
const validProbability = (p: number) => Number.isFinite(p) && p > 0 && p < 1;
/** The source probabilities are immutable forecasts fitted at their own earlier origins.
 * Feedback has its own short memory, independent of the source model's training window.
 * Zero trust still observes later raw forecasts, allowing recovery without selective feedback.
 */
export function prepareRecentTotalFeedback(
  model: GameRatingModel,
  input: TotalFeedbackRow[],
  spec: RecentTotalFeedbackSpec,
) {
  if (
    !Array.isArray(input) ||
    input.length > 10000 ||
    ![2, 4].includes(spec.halfLifeWeeks) ||
    ![0.5, 1].includes(spec.maxWeight) ||
    typeof spec.priorSeed !== 'boolean' ||
    Object.keys(spec).some((k) => !['halfLifeWeeks', 'maxWeight', 'priorSeed'].includes(k))
  )
    throw new Error('Invalid recent totals feedback specification.');
  const seen = new Set<string>();
  for (const r of input) {
    if (
      !r ||
      !validGame(r.game) ||
      seen.has(r.game.id) ||
      !validProbability(r.book) ||
      !validProbability(r.rawProbability) ||
      ![0, 1].includes(r.y) ||
      typeof r.supported !== 'boolean' ||
      (!r.supported && r.rawProbability !== r.book)
    )
      throw new Error('Invalid recent totals feedback row.');
    seen.add(r.game.id);
  }
  const rows = input
    .map((r) => ({ ...r, game: { ...r.game } }))
    .sort((a, b) => a.game.date.localeCompare(b.game.date) || a.game.id.localeCompare(b.game.id));
  const identities = new Map(rows.map((r) => [r.game.id, r]));
  function eligible(g: FootballGame, origin: FootballGame) {
    return earlierGame(g, origin) && Date.parse(origin.date) - Date.parse(g.date) >= 48 * 3600000;
  }
  const cache = new Map<string, ReturnType<typeof fit>>();
  function fit(origin: FootballGame) {
    const prior = rows.filter(
      (r) => r.supported && Math.abs(r.rawProbability - r.book) > 1e-12 && eligible(r.game, origin),
    );
    const current = prior.filter(
      (r) => r.game.season === origin.season && origin.week - r.game.week <= 6,
    );
    const seed =
      spec.priorSeed && origin.week <= 4
        ? prior.filter((r) => r.game.season === origin.season - 1 && r.game.week >= 15)
        : [];
    const seedWeights = seed.map((r) => 2 ** (-(18 - r.game.week) / spec.halfLifeWeeks));
    const seedSum = seedWeights.reduce((s, w) => s + w, 0);
    // The entire prior season has at most one NFL week of influence, fading to zero at Week 5.
    const seedBudget = 16 * Math.max(0, 1 - (origin.week - 1) / 4);
    const seedScale = seedSum ? Math.min(1, seedBudget / seedSum) : 0;
    let linear = 0,
      quadratic = 0,
      effectiveGames = 0;
    const weeks = new Set<string>();
    const contributions: {
      id: string;
      season: number;
      week: number;
      weight: number;
      linear: number;
      quadratic: number;
    }[] = [];
    for (const [r, w] of [
      ...current.map((r) => [r, 2 ** (-(origin.week - r.game.week) / spec.halfLifeWeeks)] as const),
      ...seed.map((r, i) => [r, seedWeights[i]! * seedScale] as const),
    ]) {
      const d = r.rawProbability - r.book,
        l = w * d * (r.y - r.book),
        q = w * d * d;
      linear += l;
      quadratic += q;
      effectiveGames += w;
      weeks.add(`${r.game.season}:${r.game.week}`);
      contributions.push({
        id: r.game.id,
        season: r.game.season,
        week: r.game.week,
        weight: w,
        linear: l,
        quadratic: q,
      });
    }
    const games = current.length + seed.length;
    const sufficient = games >= 24 && weeks.size >= 2 && effectiveGames >= 12;
    const weight = sufficient
      ? Math.max(0, Math.min(spec.maxWeight, linear / (quadratic + 0.02)))
      : 0;
    return {
      weight,
      games,
      weeks: weeks.size,
      effectiveGames,
      currentGames: current.length,
      seedGames: seed.length,
      seedEffectiveGames: seedSum * seedScale,
      linear,
      quadratic,
      sufficient,
      contributions,
    };
  }
  function reliability(game: FootballGame) {
    if (!validGame(game)) throw new Error('Invalid recent feedback origin.');
    const key = `${game.season}:${game.week}:${game.date}`;
    let out = cache.get(key);
    if (!out) {
      out = fit(game);
      cache.set(key, out);
    }
    return out;
  }
  function forecast(game: FootballGame, book: number, rawProbability: number, supported: boolean) {
    if (
      !validGame(game) ||
      !validProbability(book) ||
      !validProbability(rawProbability) ||
      typeof supported !== 'boolean' ||
      (!supported && rawProbability !== book)
    )
      throw new Error('Invalid recent totals feedback forecast.');
    const old = identities.get(game.id);
    if (
      old &&
      (old.game.season !== game.season ||
        old.game.week !== game.week ||
        old.game.date !== game.date ||
        old.game.kickoffAt !== game.kickoffAt ||
        old.game.home !== game.home ||
        old.game.away !== game.away ||
        old.game.totalLine !== game.totalLine ||
        old.book !== book ||
        old.rawProbability !== rawProbability ||
        old.supported !== supported)
    )
      throw new Error('Recent totals feedback identity mismatch.');
    const feedback = reliability(game);
    return {
      probability: book + feedback.weight * (rawProbability - book),
      rawProbability,
      reliability: feedback,
    };
  }
  function probability(
    kind: 'moneyline' | 'spread' | 'total',
    game: FootballGame,
    raw: number,
    book: number,
    supported: boolean,
  ) {
    return kind === 'total'
      ? forecast(game, book, raw, supported).probability
      : model.adjust(kind, game, raw, book);
  }
  return { forecast, probability, reliability };
}
