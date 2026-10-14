import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { prepareGameRatingModel } from '../packages/core/dist/game-rating-model.js';
import { prepareBoostedMarketModel } from '../packages/core/dist/boosted-market-model.js';
import { expertTotalsParameters } from '../packages/core/dist/expert-totals-model.js';
import {
  prepareMatchupTotalsModel,
  matchupTotalsParameters,
} from '../packages/core/dist/matchup-totals-model.js';
import {
  validateTeamTotalStats,
  totalSignalParameters,
} from '../packages/core/dist/team-total-signals.js';
import { boostedMarketParameters } from '../packages/core/dist/boosted-market-model.js';
import { report } from './seasonal-hybrid-evaluation.mjs';
export { report };
export const hash = (v) => createHash('sha256').update(v).digest('hex');
export const parameters = {
  signals: totalSignalParameters,
  matchup: matchupTotalsParameters,
  tree: boostedMarketParameters,
  fixedWeights: [0.5, 1 / 6, 1 / 6, 1 / 6],
};
export async function readSignals(path) {
  if ((await stat(path)).size > 5000000) throw new Error('Signals snapshot too large.');
  const rows = JSON.parse(await readFile(path, 'utf8'));
  if (!Array.isArray(rows)) throw new Error('Invalid signals snapshot.');
  validateTeamTotalStats(rows);
  return rows;
}
export const specs = [120, 365].flatMap((halfLifeDays) =>
  ['tree', 'ridge'].flatMap((method) =>
    [false, true].flatMap((signals) =>
      ['book', 'static'].flatMap((anchor) =>
        [0.25, 0.5].map((strength) => ({ halfLifeDays, signals, method, anchor, strength })),
      ),
    ),
  ),
);
export const specId = (s) =>
  `matchup-${s.halfLifeDays}-${s.signals}-${s.method}-${s.anchor}-${s.strength}`;
export function prepareEvaluation(games, stats, from, to) {
  const model = prepareGameRatingModel(games),
    slow = prepareBoostedMarketModel(model, expertTotalsParameters.slowTree),
    fast = prepareBoostedMarketModel(model, expertTotalsParameters.fastTree),
    trees = new Map(),
    rows = [];
  for (const r of model.observations) {
    if (r.game.season < from || r.game.season > to) continue;
    for (const kind of ['moneyline', 'spread', 'total']) {
      const q = r.markets[kind];
      if (!q || q.push) continue;
      const previous =
        kind === 'total'
          ? model.adjustJointAvailability(kind, r.game, q.raw, q.baseline)
          : model.adjust(kind, r.game, q.raw, q.baseline);
      const fixed =
        kind === 'total'
          ? 0.5 * q.baseline +
            slow.probability(kind, r.game, q.raw, q.baseline) / 6 +
            fast.probability(kind, r.game, q.raw, q.baseline) / 6 +
            previous / 6
          : previous;
      const plain = kind === 'total' ? slow.probability(kind, r.game, q.raw, q.baseline) : previous;
      rows.push({
        id: r.game.id,
        season: r.game.season,
        week: r.game.week,
        kind,
        y: q.y,
        book: q.baseline,
        previous,
        static: fixed,
        plain,
        p: fixed,
        q,
      });
    }
  }
  return (spec) => {
    if (typeof spec === 'string')
      return rows.map(({ q: _q, ...r }) => ({
        ...r,
        p: r.kind !== 'total' ? r.previous : r[spec],
      }));
    const key = `${spec.halfLifeDays}:${spec.signals}:${spec.method}`;
    let tree = trees.get(key);
    if (!tree) {
      tree = prepareMatchupTotalsModel(model, stats, spec);
      trees.set(key, tree);
    }
    return rows.map(({ q, ...r }) => {
      if (r.kind !== 'total') return r;
      const signal = tree.signals.features(q.game),
        p = tree.probability(q),
        anchor = r[spec.anchor];
      return {
        ...r,
        p:
          signal.supported || !spec.signals
            ? (1 - spec.strength) * anchor + spec.strength * p
            : anchor,
        signalProbability: p,
        supported: signal.supported,
        coverage: signal.coverage,
        signalFeatures: signal.x,
        joinedRows: tree.signals.joinedRows,
        rejectedJoinRows: tree.signals.rejectedJoinRows,
      };
    });
  };
}
const mean = (v) => v.reduce((s, n) => s + n, 0) / v.length;
export function diagnostics(cases) {
  if (!cases.length) return { n: 0 };
  return {
    n: cases.length,
    excessBrier: mean(cases.map((r) => (r.p - r.y) ** 2 - (r.book - r.y) ** 2)),
    varianceCost: mean(cases.map((r) => (r.p - r.book) ** 2)),
    alignmentGain: 2 * mean(cases.map((r) => (r.p - r.book) * (r.y - r.book))),
    predictedMean: mean(cases.map((r) => r.p)),
    bookMean: mean(cases.map((r) => r.book)),
    outcomeRate: mean(cases.map((r) => r.y)),
    correctionCorrect: cases.filter((r) => (r.p - r.book) * (r.y - r.book) > 0).length,
    meanAbsoluteCorrection: mean(cases.map((r) => Math.abs(r.p - r.book))),
    supported: cases.filter((r) => r.supported).length,
  };
}
export function detailedReport(rows) {
  const totals = rows.filter((r) => r.kind === 'total');
  return {
    ...report(rows),
    staticControl: report(rows.map((r) => ({ ...r, p: r.static }))),
    diagnostics: diagnostics(totals),
    weeklyDiagnostics: [...new Set(totals.map((r) => `${r.season}:${r.week}`))].map((key) => {
      const group = totals.filter((r) => `${r.season}:${r.week}` === key);
      return { season: group[0].season, week: group[0].week, ...diagnostics(group) };
    }),
    signalCoverage: {
      supported: totals.filter((r) => r.supported).length,
      total: totals.length,
      joinedRows: totals[0]?.joinedRows,
      rejectedJoinRows: totals[0]?.rejectedJoinRows,
    },
  };
}
