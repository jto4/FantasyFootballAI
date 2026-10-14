import type { FootballGame } from './advice-types.js';
import type { NewsItem } from './domain-types.js';
import { earlierGame, fitOffsetFeatures, type GameRatingModel } from './game-rating-model.js';
import { nflTeamKey } from './advice-math.js';

export interface ExternalTotalTrade {
  id: string;
  at: string;
  shares: number;
  price: number;
  overProbability: number;
  direction: -1 | 1;
  walletHash?: string;
}
export interface ExternalTotalTape {
  gameId: string;
  provider: 'kalshi' | 'polymarket';
  contractId: string;
  line: number;
  kickoffAt: string;
  cutoffAt: string;
  capturedAt: string;
  createdAt: string;
  windowStartAt: string;
  complete: boolean;
  trades: ExternalTotalTrade[];
  prices: { at: string; probability: number; spread?: number }[];
}
export interface ExternalMediaSnapshot {
  capturedAt: string;
  items: NewsItem[];
}
export function validateExternalMediaSnapshot(s: ExternalMediaSnapshot) {
  if (!s || !Number.isFinite(time(s.capturedAt)) || !Array.isArray(s.items) || s.items.length > 100)
    throw new Error('Invalid media snapshot.');
  for (const r of s.items) {
    if (
      !r ||
      typeof r.title !== 'string' ||
      !r.title.length ||
      r.title.length > 500 ||
      typeof r.source !== 'string' ||
      r.source.length > 100 ||
      !Number.isFinite(time(r.publishedAt)) ||
      typeof r.url !== 'string' ||
      r.url.length > 2048
    )
      throw new Error('Invalid media story.');
    const u = new URL(r.url);
    if (u.protocol !== 'https:' || u.username || u.password) throw new Error('Invalid media URL.');
  }
}
export const externalTotalParameters = Object.freeze({
  cutoffMinutes: 30,
  windowHours: 24,
  priceMaxAgeMinutes: 60,
  minimumTrainingGames: 30,
  penalty: 100,
  maxAddedLogit: 0.15,
  largeCashFloor: 500,
  largeQuantile: 0.95,
  walletPriorGames: 20,
  walletMinimumGames: 10,
});
const time = (v: string) =>
  typeof v === 'string' && v.length <= 40 && /(?:Z|[+-]\d\d:\d\d)$/.test(v) ? Date.parse(v) : NaN;
const finite = (v: number, lo: number, hi: number) => Number.isFinite(v) && v >= lo && v <= hi;
export function validateExternalTotalTape(r: ExternalTotalTape) {
  if (
    !r ||
    !['kalshi', 'polymarket'].includes(r.provider) ||
    typeof r.gameId !== 'string' ||
    r.gameId.length > 80 ||
    typeof r.contractId !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,150}$/.test(r.contractId) ||
    !finite(r.line, 1, 150) ||
    r.line % 1 !== 0.5 ||
    ![r.kickoffAt, r.cutoffAt, r.capturedAt, r.createdAt, r.windowStartAt].every((v) =>
      Number.isFinite(time(v)),
    ) ||
    time(r.cutoffAt) >= time(r.kickoffAt) ||
    time(r.cutoffAt) > time(r.capturedAt) ||
    time(r.createdAt) > time(r.cutoffAt) ||
    time(r.windowStartAt) >= time(r.cutoffAt) ||
    time(r.cutoffAt) - time(r.windowStartAt) > 86400000 ||
    typeof r.complete !== 'boolean' ||
    !Array.isArray(r.trades) ||
    r.trades.length > 12000 ||
    !Array.isArray(r.prices) ||
    r.prices.length > 2000
  )
    throw new Error('Invalid external totals tape.');
  const ids = new Set<string>(),
    priceTimes = new Set<string>();
  for (const t of r.trades) {
    if (
      !t ||
      typeof t.id !== 'string' ||
      !/^[a-zA-Z0-9_:-]{1,160}$/.test(t.id) ||
      ids.has(t.id) ||
      !Number.isFinite(time(t.at)) ||
      time(t.at) < time(r.windowStartAt) ||
      time(t.at) > time(r.cutoffAt) ||
      !finite(t.shares, 0.000001, 10000000) ||
      !finite(t.price, 0, 1) ||
      !finite(t.overProbability, 0, 1) ||
      ![-1, 1].includes(t.direction) ||
      (t.walletHash !== undefined && !/^[a-f0-9]{64}$/.test(t.walletHash))
    )
      throw new Error('Invalid external trade.');
    ids.add(t.id);
  }
  for (const p of r.prices) {
    if (
      !p ||
      !Number.isFinite(time(p.at)) ||
      time(p.at) < time(r.windowStartAt) ||
      time(p.at) > time(r.cutoffAt) ||
      !finite(p.probability, 0.001, 0.999) ||
      (p.spread !== undefined && !finite(p.spread, 0, 1)) ||
      priceTimes.has(p.at)
    )
      throw new Error('Invalid external price.');
    priceTimes.add(p.at);
  }
}
const names: Record<string, string> = {
  ARI: 'Cardinals',
  ATL: 'Falcons',
  BAL: 'Ravens',
  BUF: 'Bills',
  CAR: 'Panthers',
  CHI: 'Bears',
  CIN: 'Bengals',
  CLE: 'Browns',
  DAL: 'Cowboys',
  DEN: 'Broncos',
  DET: 'Lions',
  GB: 'Packers',
  HOU: 'Texans',
  IND: 'Colts',
  JAX: 'Jaguars',
  KC: 'Chiefs',
  LA: 'Rams',
  LAC: 'Chargers',
  LV: 'Raiders',
  MIA: 'Dolphins',
  MIN: 'Vikings',
  NE: 'Patriots',
  NO: 'Saints',
  NYG: 'Giants',
  NYJ: 'Jets',
  PHI: 'Eagles',
  PIT: 'Steelers',
  SEA: 'Seahawks',
  SF: '49ers',
  TB: 'Buccaneers',
  TEN: 'Titans',
  WAS: 'Commanders',
};
/** Narrow, auditable headline scoring-language proxy. It is not representative public opinion.
 * A headline's current text cannot be assigned to an earlier cutoff merely because its publication date is old.
 */
export function mediaTotalFeatures(
  game: FootballGame,
  cutoff: string,
  snapshots: ExternalMediaSnapshot[],
) {
  const eligible = snapshots.filter(
    (s) =>
      Number.isFinite(time(s.capturedAt)) &&
      time(s.capturedAt) <= time(cutoff) &&
      time(cutoff) - time(s.capturedAt) <= 3600000,
  );
  const words = [names[nflTeamKey(game.home)], names[nflTeamKey(game.away)]].filter(Boolean);
  const stories = new Map<string, NewsItem>();
  for (const s of eligible)
    for (const item of s.items.slice(0, 100)) {
      if (
        !Number.isFinite(time(item.publishedAt)) ||
        time(item.publishedAt) > time(cutoff) ||
        time(cutoff) - time(item.publishedAt) > 168 * 3600000 ||
        item.title.length > 500
      )
        continue;
      if (words.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(item.title)))
        stories.set(item.title.toLowerCase().replace(/[^a-z0-9]/g, ''), item);
    }
  const rows = [...stories.values()];
  const scoring = rows.map(
    (r) =>
      Number(/shootout|high.scoring|points? fest|over \d+\.5/i.test(r.title)) -
      Number(/low.scoring|defensive struggle|under \d+\.5/i.test(r.title)),
  );
  const sources = new Set(rows.map((r) => r.source)).size;
  return {
    supported: rows.length >= 3 && sources >= 2,
    matched: rows.length,
    publishers: sources,
    x: [
      scoring.reduce((s, v) => s + v, 0) / Math.max(3, rows.length),
      Math.min(rows.length, 20) / 20,
      rows.filter((r) => /injur|questionable|ruled out|quarterback|\bQB\b/i.test(r.title)).length /
        Math.max(3, rows.length),
      Number(rows.length >= 3 && sources >= 2),
    ],
  };
}
function flowFeatures(tape: ExternalTotalTape) {
  const now = time(tape.cutoffAt),
    recent = tape.trades.filter((t) => time(t.at) > now - 3600000),
    prior = tape.trades.filter((t) => time(t.at) <= now - 3600000);
  const amounts = prior.map((t) => t.shares * t.price).sort((a, b) => a - b);
  const threshold = Math.max(
    externalTotalParameters.largeCashFloor,
    amounts[Math.floor((amounts.length - 1) * externalTotalParameters.largeQuantile)] ??
      externalTotalParameters.largeCashFloor,
  );
  const big = recent.filter((t) => t.shares * t.price >= threshold),
    total = recent.reduce((s, t) => s + t.shares, 0),
    volume = prior.reduce((s, t) => s + t.shares, 0);
  const net = (rs: ExternalTotalTrade[]) =>
    rs.reduce((s, t) => s + t.direction * t.shares, 0) /
    Math.max(
      100,
      rs.reduce((s, t) => s + t.shares, 0),
    );
  return {
    supported: tape.complete && prior.length >= 20 && recent.length >= 5,
    x: [
      net(recent),
      net(big),
      Math.min(4, total / (volume / 23 + 100)) / 4,
      Math.min(1, big.length / 10),
    ],
  };
}
export type ExternalTotalFamily = 'price' | 'flow' | 'media' | 'combined';
/** Research-only book residual correction. Unaffected markets call the exact old calculation.
 * Availability gates prohibit learning from synthetic zero-filled histories or today's leaderboards.
 */
export function prepareExternalTotalsModel(
  model: GameRatingModel,
  tapes: ExternalTotalTape[],
  media: ExternalMediaSnapshot[],
  family: ExternalTotalFamily,
) {
  if (
    tapes.length > 1000 ||
    media.length > 1000 ||
    !['price', 'flow', 'media', 'combined'].includes(family)
  )
    throw new Error('Invalid external inputs.');
  tapes.forEach(validateExternalTotalTape);
  media.forEach(validateExternalMediaSnapshot);
  const identities = new Set<string>();
  for (const t of tapes) {
    const key = `${t.gameId}:${t.provider}:${t.cutoffAt}`;
    if (identities.has(key)) throw new Error('Duplicate external snapshot.');
    identities.add(key);
  }
  const fits = new Map<string, number[]>();
  const wallets = new Map<string, Map<string, number>>();
  function walletWeights(origin: FootballGame) {
    const key = `${origin.season}:${origin.week}:${origin.date}`;
    const cached = wallets.get(key);
    if (cached) return cached;
    const scores = new Map<string, { n: number; excess: number }>();
    for (const r of model.observations) {
      const q = r.markets.total;
      if (!q || q.push || !earlierGame(r.game, origin) || !r.game.kickoffAt) continue;
      const t = tapes
        .filter(
          (t) =>
            t.provider === 'polymarket' &&
            t.complete &&
            t.gameId === r.game.id &&
            t.line === r.game.totalLine &&
            t.kickoffAt === r.game.kickoffAt &&
            time(t.cutoffAt) <=
              Date.parse(r.game.kickoffAt) - externalTotalParameters.cutoffMinutes * 60000,
        )
        .sort((a, b) => time(b.cutoffAt) - time(a.cutoffAt))[0];
      if (!t) continue;
      const positions = new Map<string, number>();
      for (const trade of t.trades)
        if (
          trade.walletHash &&
          trade.shares * trade.price >= externalTotalParameters.largeCashFloor
        )
          positions.set(
            trade.walletHash,
            (positions.get(trade.walletHash) ?? 0) + trade.direction * Math.min(5000, trade.shares),
          );
      for (const [wallet, net] of positions) {
        if (Math.abs(net) < 1) continue;
        const score = scores.get(wallet) ?? { n: 0, excess: 0 };
        score.n++;
        score.excess += (net > 0 ? q.y : 1 - q.y) - (net > 0 ? q.baseline : 1 - q.baseline);
        scores.set(wallet, score);
      }
    }
    const weights = new Map(
      [...scores].map(([wallet, r]) => [
        wallet,
        r.n >= externalTotalParameters.walletMinimumGames
          ? Math.max(0, r.excess / (r.n + externalTotalParameters.walletPriorGames))
          : 0,
      ]),
    );
    wallets.set(key, weights);
    if (wallets.size > 1024) wallets.delete(wallets.keys().next().value!);
    return weights;
  }
  function features(game: FootballGame, book: number, cutoffAt: string) {
    if (
      !Number.isFinite(time(cutoffAt)) ||
      !game.kickoffAt ||
      time(cutoffAt) >= time(game.kickoffAt)
    )
      return {
        x: Array<number>(20).fill(0),
        supported: false,
        priceCount: 0,
        flowCount: 0,
        mediaCount: 0,
      };
    const x: number[] = [],
      priceRows: number[] = [],
      flows: number[][] = [];
    for (const provider of ['kalshi', 'polymarket'] as const) {
      const t = tapes
        .filter(
          (t) =>
            t.gameId === game.id &&
            t.provider === provider &&
            t.line === game.totalLine &&
            t.kickoffAt === game.kickoffAt &&
            time(t.cutoffAt) <= time(cutoffAt),
        )
        .sort((a, b) => time(b.cutoffAt) - time(a.cutoffAt))[0];
      const p = t?.prices
        .filter((p) => time(p.at) <= time(cutoffAt) && time(cutoffAt) - time(p.at) <= 3600000)
        .sort((a, b) => time(b.at) - time(a.at))[0];
      const before = t?.prices
        .filter((p) => time(p.at) <= time(cutoffAt) - 6 * 3600000)
        .sort((a, b) => time(b.at) - time(a.at))[0];
      const flow = t && time(cutoffAt) - time(t.cutoffAt) <= 60000 ? flowFeatures(t) : undefined;
      x.push(
        p ? (p.probability - book) * 4 : 0,
        p && before ? (p.probability - before.probability) * 4 : 0,
        Number(!!p),
      );
      if (p) priceRows.push(p.probability);
      if (family === 'price' || family === 'media') x.push(0, 0, 0, 0, 0);
      else {
        x.push(...(flow?.supported ? flow.x : [0, 0, 0, 0]));
        const weights =
          provider === 'polymarket' && t && flow?.supported
            ? walletWeights(game)
            : new Map<string, number>();
        const recent =
          t?.trades.filter(
            (trade) =>
              time(trade.at) > time(cutoffAt) - 3600000 &&
              trade.shares * trade.price >= externalTotalParameters.largeCashFloor,
          ) ?? [];
        const numerator = recent.reduce(
          (s, r) => s + r.direction * r.shares * (weights.get(r.walletHash ?? '') ?? 0),
          0,
        );
        const denominator = recent.reduce(
          (s, r) => s + r.shares * (weights.get(r.walletHash ?? '') ?? 0),
          0,
        );
        x.push(numerator / Math.max(100, denominator));
      }
      if (flow?.supported) flows.push(flow.x);
    }
    const m = mediaTotalFeatures(game, cutoffAt, media);
    if (family === 'flow') for (const start of [0, 8]) x.splice(start, 3, 0, 0, 0);
    if (family === 'media') for (let i = 0; i < x.length; i++) x[i] = 0;
    x.push(...(family === 'media' || family === 'combined' ? m.x : [0, 0, 0, 0]));
    const supported =
      family === 'price'
        ? priceRows.length > 0
        : family === 'flow'
          ? flows.length > 0
          : family === 'media'
            ? m.supported
            : priceRows.length > 0 || flows.length > 0 || m.supported;
    return {
      x,
      supported,
      priceCount: priceRows.length,
      flowCount: flows.length,
      mediaCount: m.matched,
    };
  }
  return {
    features,
    probability(
      kind: 'moneyline' | 'spread' | 'total',
      game: FootballGame,
      raw: number,
      book: number,
      cutoffAt: string,
    ) {
      if (kind !== 'total') return model.adjust(kind, game, raw, book);
      const base = model.adjustJointAvailability(kind, game, raw, book),
        target = features(game, book, cutoffAt);
      if (!target.supported) return base;
      const key = `${game.season}:${game.week}:${cutoffAt}`;
      let c = fits.get(key);
      if (!c) {
        const train = model.observations.flatMap((r) => {
          const q = r.markets.total;
          if (!q || q.push || !r.game.kickoffAt || !earlierGame(r.game, game)) return [];
          const cutoff = new Date(
              Date.parse(r.game.kickoffAt) - externalTotalParameters.cutoffMinutes * 60000,
            ).toISOString(),
            f = features(r.game, q.baseline, cutoff);
          const prior = model.adjustJointAvailability('total', r.game, q.raw, q.baseline);
          return f.supported ? [{ x: f.x, y: q.y, offset: Math.log(prior / (1 - prior)) }] : [];
        });
        if (train.length < externalTotalParameters.minimumTrainingGames) return base;
        c = fitOffsetFeatures(train, externalTotalParameters.penalty, 20);
        fits.set(key, c);
        if (fits.size > 1024) fits.delete(fits.keys().next().value!);
      }
      const correction = Math.max(
        -externalTotalParameters.maxAddedLogit,
        Math.min(
          externalTotalParameters.maxAddedLogit,
          c.reduce((s, v, i) => s + v * target.x[i]!, 0),
        ),
      );
      return 1 / (1 + Math.exp(-(Math.log(base / (1 - base)) + correction)));
    },
  };
}
