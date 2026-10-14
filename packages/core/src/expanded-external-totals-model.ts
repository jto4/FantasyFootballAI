import type { FootballGame } from './advice-types.js';
import { earlierGame, fitOffsetFeatures, type GameRatingModel } from './game-rating-model.js';
import { validateExpandedTotalTape, type ExpandedTotalTape } from './expanded-total-tape.js';
import type { ExternalTotalTrade } from './external-total-signals.js';

export interface ExpandedTotalSpec {
  family: 'prices' | 'flow' | 'positions';
  anchor: 'book' | 'production';
  penalty: 100 | 400;
}
export const expandedTotalParameters = Object.freeze({
  minimumTrainingGames: 20,
  labelSeasons: 2,
  maxAddedLogit: 0.15,
  largeCashFloor: 500,
  walletPriorGames: 30,
  walletMinimumGames: 10,
  featureCount: 18,
});
const clip = (v: number, bound = 2) => Math.max(-bound, Math.min(bound, v));
const logit = (p: number) =>
  Math.log(Math.max(0.001, Math.min(0.999, p)) / (1 - Math.max(0.001, Math.min(0.999, p))));
const net = (rows: ExternalTotalTrade[], weights?: Map<string, number>) => {
  const w = (r: ExternalTotalTrade) =>
    Math.min(5000, r.shares) * (weights ? (weights.get(r.walletHash ?? '') ?? 0) : 1);
  return (
    rows.reduce((s, r) => s + r.direction * w(r), 0) /
    Math.max(
      100,
      rows.reduce((s, r) => s + w(r), 0),
    )
  );
};
/** Research-only totals adapter. Fits use completed earlier weeks and a rolling two-season window. */
export function prepareExpandedExternalTotalsModel(
  model: GameRatingModel,
  tapes: ExpandedTotalTape[],
  spec: ExpandedTotalSpec,
) {
  if (
    tapes.length > 2500 ||
    !['prices', 'flow', 'positions'].includes(spec.family) ||
    !['book', 'production'].includes(spec.anchor) ||
    ![100, 400].includes(spec.penalty)
  )
    throw new Error('Invalid expanded totals inputs.');
  const pool = new Map<string, ExpandedTotalTape[]>(),
    identities = new Set<string>();
  let totalTrades = 0;
  for (const t of tapes) {
    validateExpandedTotalTape(t);
    totalTrades += t.trades.length + (t.earlyTrades?.length ?? 0);
    const id = `${t.gameId}:${t.provider}:${t.cutoffAt}`;
    if (identities.has(id) || totalTrades > 1000000)
      throw new Error('Duplicate or oversized expanded history.');
    identities.add(id);
    pool.set(t.gameId, [...(pool.get(t.gameId) ?? []), t]);
  }
  const fits = new Map<string, { coefficients: number[]; training: number }>(),
    wallets = new Map<string, Map<string, number>>();
  function matched(g: FootballGame, provider: string, cutoff: string) {
    return (pool.get(g.id) ?? [])
      .filter(
        (t) =>
          t.provider === provider &&
          t.line === g.totalLine &&
          t.kickoffAt === g.kickoffAt &&
          t.cutoffAt <= cutoff,
      )
      .sort((a, b) => b.cutoffAt.localeCompare(a.cutoffAt))[0];
  }
  function walletWeights(origin: FootballGame) {
    const key = `${origin.season}:${origin.week}`;
    const cached = wallets.get(key);
    if (cached) return cached;
    const scores = new Map<string, { n: number; excess: number }>();
    for (const r of model.observations) {
      const q = r.markets.total;
      if (
        !q ||
        q.push ||
        !earlierGame(r.game, origin) ||
        r.game.season < origin.season - expandedTotalParameters.labelSeasons ||
        !r.game.kickoffAt
      )
        continue;
      const t = matched(
        r.game,
        'polymarket',
        new Date(Date.parse(r.game.kickoffAt) - 1800000).toISOString(),
      );
      if (!t?.complete) continue;
      const positions = new Map<string, number>();
      for (const trade of [...t.trades, ...(t.earlyComplete ? (t.earlyTrades ?? []) : [])]) {
        if (
          !trade.walletHash ||
          trade.shares * trade.price < expandedTotalParameters.largeCashFloor
        )
          continue;
        positions.set(
          trade.walletHash,
          (positions.get(trade.walletHash) ?? 0) + trade.direction * Math.min(5000, trade.shares),
        );
      }
      for (const [wallet, position] of positions) {
        if (Math.abs(position) < 1) continue;
        const score = scores.get(wallet) ?? { n: 0, excess: 0 };
        score.n++;
        score.excess += position > 0 ? q.y - q.baseline : q.baseline - q.y;
        scores.set(wallet, score);
      }
    }
    const weights = new Map(
      [...scores].map(([wallet, r]) => [
        wallet,
        r.n >= expandedTotalParameters.walletMinimumGames
          ? Math.max(0, r.excess / (r.n + expandedTotalParameters.walletPriorGames))
          : 0,
      ]),
    );
    wallets.set(key, weights);
    if (wallets.size > 256) wallets.delete(wallets.keys().next().value!);
    return weights;
  }
  function features(g: FootballGame, book: number, cutoff: string) {
    const x: number[] = [];
    let priceCount = 0,
      flowCount = 0,
      earlyCount = 0,
      walletCount = 0;
    if (!g.kickoffAt || !Number.isFinite(Date.parse(cutoff)) || cutoff >= g.kickoffAt)
      return {
        x: Array<number>(18).fill(0),
        supported: false,
        priceCount,
        flowCount,
        earlyCount,
        walletCount,
      };
    for (const provider of ['kalshi', 'polymarket']) {
      const t = matched(g, provider, cutoff),
        now = Date.parse(cutoff);
      const prices =
        t?.prices.filter((p) => Date.parse(p.at) <= now).sort((a, b) => b.at.localeCompare(a.at)) ??
        [];
      const last = prices.find((p) => now - Date.parse(p.at) <= 3600000);
      const before = prices.find((p) => Date.parse(p.at) <= now - 6 * 3600000);
      x.push(
        last ? clip(logit(last.probability) - logit(book)) : 0,
        last && before ? clip(4 * (last.probability - before.probability)) : 0,
        Number(!!last),
      );
      if (last) priceCount++;
      const recent = t?.trades.filter((r) => Date.parse(r.at) > now - 3600000) ?? [],
        prior = t?.trades.filter((r) => Date.parse(r.at) <= now - 3600000) ?? [];
      const supported =
        spec.family !== 'prices' &&
        !!t?.complete &&
        now - Date.parse(t.cutoffAt) <= 60000 &&
        recent.length >= 5 &&
        prior.length >= 20;
      if (!supported) {
        x.push(0, 0, 0, 0, 0, 0);
        continue;
      }
      flowCount++;
      const amounts = prior.map((r) => r.shares * r.price).sort((a, b) => a - b),
        threshold = Math.max(500, amounts[Math.floor((amounts.length - 1) * 0.95)] ?? 500);
      const large = recent.filter((r) => r.shares * r.price >= threshold);
      const volume = (rows: ExternalTotalTrade[]) =>
        rows.reduce((s, r) => s + Math.min(5000, r.shares), 0);
      const early =
        spec.family === 'positions' && t?.earlyComplete
          ? (t.earlyTrades ?? []).filter((r) => r.shares * r.price >= 500)
          : [];
      const eligible = [...early, ...recent.filter((r) => r.shares * r.price >= 500)];
      const weights =
        provider === 'polymarket' && spec.family === 'positions'
          ? walletWeights(g)
          : new Map<string, number>();
      const wallet = net(eligible, weights);
      if (early.length >= 5) earlyCount++;
      if (wallet !== 0) walletCount++;
      x.push(
        net(recent),
        net(large),
        clip(Math.log((volume(recent) + 100) / (volume(prior) / 23 + 100))),
        early.length >= 5 ? net(early) : 0,
        wallet,
        1,
      );
    }
    return {
      x,
      supported: priceCount > 0 || flowCount > 0,
      priceCount,
      flowCount,
      earlyCount,
      walletCount,
    };
  }
  function fit(origin: FootballGame) {
    const key = `${origin.season}:${origin.week}`;
    const cached = fits.get(key);
    if (cached) return cached;
    const rows = model.observations.flatMap((r) => {
      const q = r.markets.total;
      if (
        !q ||
        q.push ||
        !r.game.kickoffAt ||
        !earlierGame(r.game, origin) ||
        r.game.season < origin.season - expandedTotalParameters.labelSeasons
      )
        return [];
      const f = features(
        r.game,
        q.baseline,
        new Date(Date.parse(r.game.kickoffAt) - 1800000).toISOString(),
      );
      if (!f.supported) return [];
      const base =
        spec.anchor === 'book'
          ? q.baseline
          : model.adjustJointAvailability('total', r.game, q.raw, q.baseline);
      return [{ offset: logit(base), x: f.x, y: q.y }];
    });
    const result = {
      coefficients:
        rows.length >= expandedTotalParameters.minimumTrainingGames
          ? fitOffsetFeatures(rows, spec.penalty, 18)
          : Array<number>(18).fill(0),
      training: rows.length,
    };
    fits.set(key, result);
    if (fits.size > 256) fits.delete(fits.keys().next().value!);
    return result;
  }
  function probability(g: FootballGame, raw: number, book: number, cutoff: string) {
    const base =
        spec.anchor === 'book' ? book : model.adjustJointAvailability('total', g, raw, book),
      f = features(g, book, cutoff);
    if (!f.supported) return base;
    const fitResult = fit(g);
    if (fitResult.training < expandedTotalParameters.minimumTrainingGames) return base;
    const correction = clip(
      f.x.reduce((s, v, i) => s + v * fitResult.coefficients[i]!, 0),
      expandedTotalParameters.maxAddedLogit,
    );
    return correction === 0 ? base : 1 / (1 + Math.exp(-(logit(base) + correction)));
  }
  return { features, probability, fit };
}
