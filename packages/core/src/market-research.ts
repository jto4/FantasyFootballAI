import { type FootballGame } from './advice-types.js';
import type { NewsItem } from './domain-types.js';
import { buildAdvicePerception } from './advice-perception.js';
import { validateExternalTotalTape, type ExternalTotalTape } from './external-total-signals.js';
import { isSportsbookQuote, type SportsbookQuote } from './sportsbook-types.js';

export const marketResearchProtocol = 'external-price-v1' as const;
export interface MarketSignalsSnapshot {
  id: string;
  capturedAt: string;
  cutoffAt: string;
  game: FootballGame;
  line: number;
  provider: ExternalTotalTape['provider'];
  contractId?: string;
  complete: boolean;
  prices: { at: string; probability: number }[];
  activity: {
    at: string;
    overCash: number;
    underCash: number;
    largeCash: number;
    trades: number;
  }[];
  largeTradeThreshold: number;
  headlines: { title: string; source: string; url: string; publishedAt: string }[];
  mediaStatus: 'current' | 'stale' | 'unavailable';
  baseline?: SportsbookQuote;
  warnings: string[];
}
export interface MarketResearchRecord {
  id: string;
  protocol: typeof marketResearchProtocol;
  frozenAt: string;
  snapshot: MarketSignalsSnapshot;
  candidateProbability: number;
  baselineProbability: number;
  result?: { observedAt: string; total: number; sourceUrl: string };
}
export const noVigOver = (q: SportsbookQuote) => {
  const implied = (n: number) => (n < 0 ? -n / (100 - n) : 100 / (100 + n));
  const selected = implied(q.americanOdds),
    opposite = implied(q.oppositeAmericanOdds);
  return (q.side === 'over' ? selected : opposite) / (selected + opposite);
};

/** Descriptive covariates only. Never called by production forecast/advice assembly. */
export function buildMarketSignals(input: {
  id: string;
  game: FootballGame;
  line: number;
  provider: ExternalTotalTape['provider'];
  cutoffAt: string;
  capturedAt: string;
  tape?: ExternalTotalTape;
  baseline?: SportsbookQuote;
  news?: { items: NewsItem[]; stale: boolean; refreshedAt?: string; error?: string };
}): MarketSignalsSnapshot {
  const { tape, game } = input;
  if (tape) {
    validateExternalTotalTape(tape);
    if (
      tape.gameId !== game.id ||
      tape.line !== input.line ||
      tape.provider !== input.provider ||
      tape.kickoffAt !== game.kickoffAt ||
      tape.cutoffAt !== input.cutoffAt ||
      Date.parse(tape.capturedAt) > Date.parse(input.capturedAt)
    )
      throw new Error('Mismatched research tape.');
  }
  const media = buildAdvicePerception(
    input.news,
    [],
    [game.home, game.away],
    [],
    input.capturedAt,
    true,
  );
  const bins = new Map<string, MarketSignalsSnapshot['activity'][number]>();
  // Fixed $500 executed cash threshold; no hindsight quantiles or inferred trader skill.
  for (const trade of tape?.trades ?? []) {
    const at = new Date(Math.floor(Date.parse(trade.at) / 3600000) * 3600000).toISOString();
    const bin = bins.get(at) ?? { at, overCash: 0, underCash: 0, largeCash: 0, trades: 0 };
    const cash = trade.shares * trade.price;
    if (trade.direction === 1) bin.overCash += cash;
    else bin.underCash += cash;
    if (cash >= 500) bin.largeCash += cash;
    bin.trades++;
    bins.set(at, bin);
  }
  const baseline = input.baseline;
  if (
    baseline &&
    (!isSportsbookQuote(baseline) ||
      baseline.gameId !== game.id ||
      baseline.espnId !== game.espnId ||
      baseline.kickoffAt !== game.kickoffAt ||
      baseline.kind !== 'total' ||
      baseline.line !== input.line ||
      Date.parse(baseline.observedAt) > Date.parse(input.capturedAt))
  )
    throw new Error('Mismatched baseline.');
  return {
    id: input.id,
    capturedAt: input.capturedAt,
    cutoffAt: input.cutoffAt,
    // Exclude archive outcomes, archived prices and personnel fields from frozen research.
    game: {
      id: game.id,
      season: game.season,
      week: game.week,
      seasonType: game.seasonType,
      date: game.date,
      home: game.home,
      away: game.away,
      ...(game.kickoffAt ? { kickoffAt: game.kickoffAt } : {}),
      ...(game.espnId ? { espnId: game.espnId } : {}),
    },
    line: input.line,
    provider: input.provider,
    ...(tape ? { contractId: tape.contractId } : {}),
    complete: tape?.complete ?? false,
    prices: [...(tape?.prices ?? [])]
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
      .map(({ at, probability }) => ({ at, probability })),
    activity: [...bins.values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)),
    largeTradeThreshold: 500,
    headlines: media.news
      .filter((h) => Date.parse(h.publishedAt) <= Date.parse(input.cutoffAt))
      .map(({ title, source, url, publishedAt }) => ({ title, source, url, publishedAt })),
    mediaStatus: media.evidence.feedStatus,
    ...(baseline ? { baseline } : {}),
    warnings: [
      ...(!tape
        ? ['No verified contract at this exact total, or the provider could not be read.']
        : !tape.complete
          ? ['Trade pagination is incomplete; displayed activity is a partial sample.']
          : []),
      ...(!baseline
        ? [
            'No matched current two-sided sportsbook baseline. Prospective comparison is unavailable.',
          ]
        : []),
      ...media.warnings,
    ],
  };
}
export function freezeMarketResearch(
  s: MarketSignalsSnapshot,
  frozenAt: string,
): MarketResearchRecord {
  const now = Date.parse(frozenAt),
    p = s.prices.at(-1),
    q = s.baseline;
  if (
    !Number.isFinite(now) ||
    !isMarketSignalsSnapshot(s) ||
    !p ||
    !q ||
    !s.complete ||
    now < Date.parse(s.capturedAt) ||
    now - Date.parse(s.capturedAt) > 300000 ||
    now >= Date.parse(s.game.kickoffAt!) ||
    now - Date.parse(p.at) > 3600000 ||
    now - Date.parse(q.observedAt) > 300000
  )
    throw new Error(
      'Refresh before freezing: complete pregame prices and a fresh matched sportsbook baseline are required.',
    );
  return {
    id: `${s.game.id}:${s.provider}:${s.line}`,
    protocol: marketResearchProtocol,
    frozenAt,
    snapshot: structuredClone(s),
    candidateProbability: p.probability,
    baselineProbability: noVigOver(q),
  };
}
const obj = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === 'object' && !Array.isArray(x);
const str = (x: unknown, max = 500): x is string =>
  typeof x === 'string' && x.length > 0 && x.length <= max && !/[\u0000-\u001f\u007f]/.test(x);
const time = (x: unknown): x is string =>
  str(x, 40) && /(?:Z|[+-]\d\d:\d\d)$/.test(x) && Number.isFinite(Date.parse(x));
const num = (x: unknown, min: number, max: number): x is number =>
  typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
const https = (x: unknown) => {
  try {
    const u = new URL(String(x));
    return str(x, 2000) && u.protocol === 'https:' && !u.username && !u.password;
  } catch {
    return false;
  }
};
export function isMarketSignalsSnapshot(x: unknown): x is MarketSignalsSnapshot {
  if (
    !obj(x) ||
    !str(x.id, 80) ||
    !time(x.capturedAt) ||
    !time(x.cutoffAt) ||
    !obj(x.game) ||
    !str(x.game.id, 80) ||
    !str(x.game.home, 4) ||
    !str(x.game.away, 4) ||
    !num(x.game.season, 2010, 2099) ||
    !num(x.game.week, 1, 18) ||
    x.game.seasonType !== 'REG' ||
    x.game.homeScore !== undefined ||
    x.game.awayScore !== undefined ||
    x.game.archivedOdds !== undefined ||
    !str(x.game.date, 10) ||
    !time(x.game.kickoffAt) ||
    Date.parse(x.cutoffAt) >= Date.parse(x.game.kickoffAt) ||
    Date.parse(x.cutoffAt) > Date.parse(x.capturedAt) ||
    !num(x.line, 1, 150) ||
    x.line % 1 !== 0.5 ||
    !['kalshi', 'polymarket'].includes(String(x.provider)) ||
    (x.contractId !== undefined && !str(x.contractId, 150)) ||
    typeof x.complete !== 'boolean' ||
    x.largeTradeThreshold !== 500 ||
    !['current', 'stale', 'unavailable'].includes(String(x.mediaStatus))
  )
    return false;
  const cutoff = Date.parse(x.cutoffAt),
    from = cutoff - 86400000;
  return (
    Array.isArray(x.prices) &&
    x.prices.length <= 2000 &&
    x.prices.every(
      (p, i, ps) =>
        obj(p) &&
        time(p.at) &&
        Date.parse(p.at) <= cutoff &&
        Date.parse(p.at) >= from &&
        num(p.probability, 0.000001, 0.999999) &&
        (!i || Date.parse(ps[i - 1].at) < Date.parse(p.at)),
    ) &&
    Array.isArray(x.activity) &&
    x.activity.length <= 25 &&
    x.activity.every(
      (b) =>
        obj(b) &&
        time(b.at) &&
        Date.parse(b.at) <= cutoff &&
        Date.parse(b.at) >= from - 3600000 &&
        ['overCash', 'underCash', 'largeCash'].every((k) => num(b[k], 0, 1e12)) &&
        num(b.trades, 1, 12000),
    ) &&
    Array.isArray(x.headlines) &&
    x.headlines.length <= 8 &&
    x.headlines.every(
      (h) =>
        obj(h) &&
        str(h.title) &&
        str(h.source, 100) &&
        https(h.url) &&
        time(h.publishedAt) &&
        Date.parse(h.publishedAt) <= cutoff &&
        Date.parse(h.publishedAt) >= cutoff - 604800000,
    ) &&
    (x.baseline === undefined ||
      (isSportsbookQuote(x.baseline) &&
        x.baseline.gameId === x.game.id &&
        x.baseline.kickoffAt === x.game.kickoffAt &&
        x.baseline.espnId === x.game.espnId &&
        x.baseline.kind === 'total' &&
        x.baseline.line === x.line &&
        Date.parse(x.baseline.observedAt) <= Date.parse(x.capturedAt))) &&
    Array.isArray(x.warnings) &&
    x.warnings.length <= 12 &&
    x.warnings.every((w) => str(w, 1000))
  );
}
export function isMarketResearchRecord(x: unknown): x is MarketResearchRecord {
  if (
    !obj(x) ||
    x.protocol !== marketResearchProtocol ||
    !time(x.frozenAt) ||
    !isMarketSignalsSnapshot(x.snapshot)
  )
    return false;
  try {
    const expected = freezeMarketResearch(x.snapshot, x.frozenAt);
    return (
      x.id === expected.id &&
      x.candidateProbability === expected.candidateProbability &&
      x.baselineProbability === expected.baselineProbability &&
      (x.result === undefined ||
        (obj(x.result) &&
          time(x.result.observedAt) &&
          Date.parse(x.result.observedAt) > Date.parse(x.snapshot.game.kickoffAt!) &&
          num(x.result.total, 0, 200) &&
          Number.isInteger(x.result.total) &&
          x.result.sourceUrl ===
            `https://www.espn.com/nfl/game/_/gameId/${x.snapshot.game.espnId}`))
    );
  } catch {
    return false;
  }
}
