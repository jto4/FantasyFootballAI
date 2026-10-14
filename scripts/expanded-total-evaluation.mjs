import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readGameContextSnapshot } from './game-context-snapshot.mjs';
import { prepareGameRatingModel } from '../packages/core/dist/game-rating-model.js';
import {
  prepareExpandedExternalTotalsModel,
  expandedTotalParameters,
} from '../packages/core/dist/expanded-external-totals-model.js';
import { summarize } from './rich-personnel-evaluation.mjs';
export { expandedTotalParameters, summarize };
export const hash = (v) => createHash('sha256').update(v).digest('hex');
export const specs = ['prices', 'flow', 'positions'].flatMap((family) =>
  ['book', 'production'].flatMap((anchor) =>
    [100, 400].map((penalty) => ({ family, anchor, penalty })),
  ),
);
export const specId = (s) => `${s.family}-${s.anchor}-${s.penalty}`;
export const frozenFiles = [
  'packages/core/src/expanded-total-tape.ts',
  'packages/core/src/expanded-external-totals-model.ts',
  'packages/core/src/external-total-signals.ts',
  'packages/core/src/game-rating-model.ts',
  'packages/core/src/game-availability.ts',
  'packages/core/src/market-context.ts',
  'packages/integrations/src/historical-prediction-market-data.ts',
  'packages/integrations/src/prediction-market-data.ts',
  'scripts/expanded-total-evaluation.mjs',
];
export async function inputs(contextPath, signalPath) {
  if ((await stat(signalPath)).size > 200000000) throw new Error('Expanded input too large.');
  const raw = await readFile(signalPath),
    games = await readGameContextSnapshot(contextPath),
    signals = JSON.parse(raw);
  if (
    signals.version !== 2 ||
    signals.complete !== true ||
    signals.contextSha256 !== hash(await readFile(contextPath)) ||
    !Array.isArray(signals.tapes)
  )
    throw new Error('Expanded snapshot mismatch.');
  const model = prepareGameRatingModel(games),
    base = model.observations.flatMap((r) => {
      if (
        r.game.season < 2023 ||
        r.game.season > 2026 ||
        r.game.seasonType !== 'REG' ||
        !r.game.kickoffAt ||
        (r.game.season === 2026 && r.game.week > 5)
      )
        return [];
      return ['moneyline', 'spread', 'total'].flatMap((kind) => {
        const q = r.markets[kind];
        if (!q || q.push) return [];
        return [
          {
            game: r.game,
            raw: q.raw,
            id: r.game.id,
            season: r.game.season,
            week: r.game.week,
            kind,
            y: q.y,
            book: q.baseline,
            previous:
              kind === 'total'
                ? model.adjustJointAvailability(kind, r.game, q.raw, q.baseline)
                : model.adjust(kind, r.game, q.raw, q.baseline),
          },
        ];
      });
    });
  const development = (r) => r.season === 2024 || (r.season === 2025 && r.week <= 8);
  const audit = (r) => (r.season === 2025 && r.week >= 9) || r.season === 2026;
  const evaluate = (spec, predicate) => {
    const adapter = prepareExpandedExternalTotalsModel(model, signals.tapes, spec);
    return base.filter(predicate).map(({ game, raw, ...r }) => {
      if (r.kind !== 'total') return { ...r, p: r.previous };
      const cutoff = new Date(Date.parse(game.kickoffAt) - 1800000).toISOString(),
        f = adapter.features(game, r.book, cutoff);
      return {
        ...r,
        p: adapter.probability(game, raw, r.book, cutoff),
        supported: f.supported,
        priceCount: f.priceCount,
        flowCount: f.flowCount,
        earlyCount: f.earlyCount,
        walletCount: f.walletCount,
      };
    });
  };
  return { model, signals, base, evaluate, development, audit };
}
export function overview(rows) {
  const total = rows.filter((r) => r.kind === 'total');
  return {
    totals: summarize(total),
    supported: summarize(total.filter((r) => r.supported)),
    changed: total.filter((r) => Math.abs(r.p - r.book) > 1e-12).length,
    coverage: total.filter((r) => r.supported).length,
    priceGames: total.filter((r) => r.priceCount).length,
    flowGames: total.filter((r) => r.flowCount).length,
    earlyGames: total.filter((r) => r.earlyCount).length,
    walletGames: total.filter((r) => r.walletCount).length,
    nonTotalMaximumProductionDifference: Math.max(
      0,
      ...rows.filter((r) => r.kind !== 'total').map((r) => Math.abs(r.p - r.previous)),
    ),
  };
}
