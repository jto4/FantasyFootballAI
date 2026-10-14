import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readGameContextSnapshot } from './game-context-snapshot.mjs';
import { prepareGameRatingModel } from '../packages/core/dist/game-rating-model.js';
import { prepareBoostedMarketModel } from '../packages/core/dist/boosted-market-model.js';
import { expertTotalsParameters } from '../packages/core/dist/expert-totals-model.js';
import { specs, specId, report } from './expert-totals-evaluation.mjs';
const args = process.argv.slice(2);
if (args.length !== 4 || args[0] !== '--contexts' || args[2] !== '--frozen')
  throw new Error('Usage: --contexts <games.json> --frozen <development.json>');
if ((await stat(args[3])).size > 1000000) throw new Error('Frozen file exceeds limit.');
const games = await readGameContextSnapshot(args[1]),
  f = JSON.parse(await readFile(args[3], 'utf8')),
  hash = (v) => createHash('sha256').update(v).digest('hex'),
  s = f.bestAdaptive;
if (
  hash(await readFile(args[1])) !== f.contextSha256 ||
  hash(JSON.stringify(games.filter((g) => g.season <= 2021))) !== f.developmentSha256 ||
  JSON.stringify(f.parameters) !== JSON.stringify(expertTotalsParameters) ||
  !s ||
  !specs.some((spec) => specId(spec) === s.id && JSON.stringify(spec) === JSON.stringify(s.spec))
)
  throw new Error('Frozen control inputs mismatch.');
const weights = [s.spec.bookPrior, ...Array(3).fill((1 - s.spec.bookPrior) / 3)],
  model = prepareGameRatingModel(games),
  slow = prepareBoostedMarketModel(model, expertTotalsParameters.slowTree),
  fast = prepareBoostedMarketModel(model, expertTotalsParameters.fastTree),
  rows = [];
for (const r of model.observations) {
  if (r.game.season < 2022 || r.game.season > 2026) continue;
  for (const kind of ['moneyline', 'spread', 'total']) {
    const q = r.markets[kind];
    if (!q || q.push) continue;
    const previous =
        kind === 'total'
          ? model.adjustJointAvailability(kind, r.game, q.raw, q.baseline)
          : model.adjust(kind, r.game, q.raw, q.baseline),
      p =
        kind === 'total'
          ? weights[0] * q.baseline +
            weights[1] * slow.probability(kind, r.game, q.raw, q.baseline) +
            weights[2] * fast.probability(kind, r.game, q.raw, q.baseline) +
            weights[3] * previous
          : previous;
    rows.push({
      id: r.game.id,
      season: r.game.season,
      week: r.game.week,
      kind,
      y: q.y,
      book: q.baseline,
      previous,
      p,
    });
  }
}
console.log(
  JSON.stringify(
    {
      scoredAt: new Date().toISOString(),
      contextSha256: f.contextSha256,
      frozenSha256: hash(await readFile(args[3])),
      weights,
      controlOnly: true,
      usedForSelection: false,
      archive: report(rows.filter((r) => r.season <= 2025)),
      recent: report(rows.filter((r) => r.season === 2026)),
      warning:
        'Post-audit explanatory ablation of the frozen book prior; no additional parameter search or selection.',
    },
    null,
    2,
  ),
);
