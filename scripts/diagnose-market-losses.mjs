import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readGameContextSnapshot } from './game-context-snapshot.mjs';
import { prepareGameRatingModel } from '../packages/core/dist/game-rating-model.js';
import { prepareRichPersonnelModel } from '../packages/core/dist/rich-personnel-model.js';
import { usablePregameContext } from '../packages/core/dist/game-availability.js';
const args = process.argv.slice(2);
if (args.length !== 4 || args[0] !== '--contexts' || args[2] !== '--frozen-v6')
  throw new Error('Usage: --contexts <games.json> --frozen-v6 <development.json>');
if ((await stat(args[3])).size > 1000000) throw new Error('Frozen reference exceeds limit.');
const games = await readGameContextSnapshot(args[1]),
  frozen = JSON.parse(await readFile(args[3], 'utf8')),
  model = prepareGameRatingModel(games),
  cases = [];
for (const kind of ['moneyline', 'spread', 'total']) {
  const rich = prepareRichPersonnelModel(model, frozen.selection[kind].spec);
  for (const r of model.observations) {
    const q = r.markets[kind];
    if (!q || q.push || r.game.season < 2018 || r.game.season > 2026) continue;
    const v3 = model.adjust(kind, r.game, q.raw, q.baseline),
      previous =
        kind === 'total' ? model.adjustJointAvailability(kind, r.game, q.raw, q.baseline) : v3,
      p = rich.probability(kind, r.game, q.raw, q.baseline),
      context = usablePregameContext(r.game);
    cases.push({
      id: r.game.id,
      season: r.game.season,
      week: r.game.week,
      kind,
      y: q.y,
      p,
      previous,
      v3,
      raw: q.raw,
      book: q.baseline,
      line: kind === 'total' ? r.game.totalLine : r.game.spreadLine,
      healthSupported: model.supportedAvailability(kind, r.game),
      injuryBoth: !!(context?.home.reportUpdatedAt && context?.away.reportUpdatedAt),
      qbBoth:
        context?.home.personnel?.quarterbackEpa !== undefined &&
        context?.away.personnel?.quarterbackEpa !== undefined,
      weather: !!context?.weather,
    });
  }
}
const mean = (v) => v.reduce((s, n) => s + n, 0) / v.length;
function summary(rows, field = 'p') {
  if (!rows.length) return { n: 0 };
  const d = rows.map((r) => r[field] - r.book);
  return {
    n: rows.length,
    modelBrier: mean(rows.map((r) => (r[field] - r.y) ** 2)),
    bookBrier: mean(rows.map((r) => (r.book - r.y) ** 2)),
    excessBrier: mean(rows.map((r) => (r[field] - r.y) ** 2 - (r.book - r.y) ** 2)),
    correctionVarianceCost: mean(d.map((v) => v * v)),
    correctionAlignmentGain: 2 * mean(rows.map((r, i) => d[i] * (r.y - r.book))),
    predictedMean: mean(rows.map((r) => r[field])),
    bookMean: mean(rows.map((r) => r.book)),
    outcomeRate: mean(rows.map((r) => r.y)),
    meanCorrection: mean(d),
    absoluteCorrection: mean(d.map(Math.abs)),
    productionExcess: mean(rows.map((r) => (r.previous - r.y) ** 2 - (r.book - r.y) ** 2)),
    v3Excess: mean(rows.map((r) => (r.v3 - r.y) ** 2 - (r.book - r.y) ** 2)),
    rawExcess: mean(rows.map((r) => (r.raw - r.y) ** 2 - (r.book - r.y) ** 2)),
    personnelIncrement: mean(rows.map((r) => (r.p - r.y) ** 2 - (r.previous - r.y) ** 2)),
    availabilityIncrement: mean(rows.map((r) => (r.previous - r.y) ** 2 - (r.v3 - r.y) ** 2)),
  };
}
const cells = [];
for (const season of [2022, 2023, 2024, 2025, 2026])
  for (const kind of ['moneyline', 'spread', 'total']) {
    const rows = cases.filter((r) => r.season === season && r.kind === kind);
    cells.push({
      season,
      kind,
      ...summary(rows),
      phases: [
        [1, 6],
        [7, 12],
        [13, 18],
      ].map(([from, to]) => ({
        from,
        to,
        ...summary(rows.filter((r) => r.week >= from && r.week <= to)),
      })),
      injuryCoverage: [true, false].map((known) => ({
        known,
        ...summary(rows.filter((r) => r.injuryBoth === known)),
      })),
      weatherCoverage: [true, false].map((known) => ({
        known,
        ...summary(rows.filter((r) => r.weather === known)),
      })),
      lines: (kind === 'total'
        ? [
            [0, 42],
            [42, 48],
            [48, 201],
          ]
        : kind === 'spread'
          ? [
              [-100, 0],
              [0, 4],
              [4, 100],
            ]
          : []
      ).map(([from, to]) => ({
        from,
        to,
        ...summary(rows.filter((r) => r.line >= from && r.line < to)),
      })),
    });
  }
const report = {
  scoredAt: new Date().toISOString(),
  contextSha256: createHash('sha256')
    .update(await readFile(args[1]))
    .digest('hex'),
  decomposition:
    'model-minus-book loss = mean(correction squared) - 2*mean(correction*(outcome-book))',
  warnings: [
    'Subgroups are descriptive/post-hoc and small; they cannot establish causal explanations or authorize tuning on later outcomes.',
    '2026 context coverage reflects only the previously reconstructed snapshot. No missing injury data is filled.',
  ],
  cells,
};
console.log(JSON.stringify(report, null, 2));
