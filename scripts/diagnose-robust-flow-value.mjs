import { prepare, json, hash } from './trade-flow-evaluation.mjs';
import { prepareDirectionalSeasonalTotalsModel } from '../packages/core/dist/directional-seasonal-totals-model.js';
import { readFile, writeFile } from 'node:fs/promises';
const [contexts, oldPath, correctedPath, out] = process.argv.slice(2);
if (!out) throw new Error('Usage: <contexts> <old-signals> <corrected-signals> <output>');
const parentPath = 'docs/research/2026-10-13-v15-frozen-settings.json',
  parent = await json(parentPath),
  e = await prepare(contexts, oldPath, correctedPath, parent.parentSettingsPath);
if (parent.correctedSignalsSha256 !== hash(await readFile(correctedPath)))
  throw new Error('Corrected input mismatch');
const features = e.featureRows('innovation'),
  adapter = prepareDirectionalSeasonalTotalsModel(e.model, features, e.parent.selected),
  rows = [];
for (const f of features.filter((r) => e.audit(r.game))) {
  const result = adapter.forecast(f.game, f.book, f.x, f.supported);
  rows.push({
    id: f.game.id,
    season: f.game.season,
    week: f.game.week,
    y: f.y,
    book: f.book,
    x: f.x,
    supported: f.supported,
    priceCount: f.priceCount,
    flowCount: f.details.flowCount,
    confirmedCount: f.details.confirmedCount,
    ...result,
  });
}
const prior = await json('docs/research/2026-10-13-v15-audit.json'),
  byId = new Map(
    prior.results.innovation.rows.filter((r) => r.kind === 'total').map((r) => [r.id, r]),
  );
for (const r of rows)
  if (r.probability !== byId.get(r.id)?.p || r.rawProbability !== byId.get(r.id)?.unadapted)
    throw new Error('Parent reproduction mismatch');
const mean = (v) => v.reduce((s, x) => s + x, 0) / Math.max(1, v.length);
const groups = [2025, 2026].map((season) => {
  const rs = rows.filter((r) => r.season === season),
    active = rs.filter((r) => Math.abs(r.rawProbability - r.book) > 1e-12);
  return {
    season,
    n: rs.length,
    supported: rs.filter((r) => r.supported).length,
    flow: rs.filter((r) => r.flowCount).length,
    confirmed: rs.filter((r) => r.confirmedCount).length,
    trainingMean: mean(rs.map((r) => r.fit?.training ?? 0)),
    effectiveTrainingMean: mean(rs.map((r) => r.fit?.effectiveGames ?? 0)),
    meanFeatureAbsoluteByIndex: Array.from({ length: 18 }, (_, i) =>
      mean(rs.map((r) => Math.abs(r.x[i]))),
    ),
    meanAbsCoefficientByIndex: Array.from({ length: 12 }, (_, i) =>
      mean(rs.map((r) => Math.abs(r.fit?.coefficients[i] ?? 0))),
    ),
    meanAbsRaw: mean(rs.map((r) => Math.abs(r.rawProbability - r.book))),
    meanAbsFinal: mean(rs.map((r) => Math.abs(r.probability - r.book))),
    meanReliabilityOnRawActive: mean(active.map((r) => r.reliability.weight)),
    positiveReliability: active.filter((r) => r.reliability.weight > 0).length,
    rawAlignmentGain: mean(rs.map((r) => 2 * (r.rawProbability - r.book) * (r.y - r.book))),
    rawVarianceCost: mean(rs.map((r) => (r.rawProbability - r.book) ** 2)),
    rawDirectionCorrect: active.filter((r) => (r.rawProbability - r.book) * (r.y - r.book) > 0)
      .length,
    rawActive: active.length,
  };
});
await writeFile(
  out,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      parentSettingsSha256: hash(await readFile(parentPath)),
      groups,
      rows,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(groups, null, 2));
