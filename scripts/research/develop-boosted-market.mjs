import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readGameContextSnapshot } from './game-context-snapshot.mjs';
import {
  prepareEvaluation,
  specs,
  specId,
  summarize,
  kinds,
  boostedMarketParameters,
} from './boosted-market-evaluation.mjs';
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--contexts')
  throw new Error('Usage: --contexts <games.json>');
const games = (await readGameContextSnapshot(args[1])).filter((g) => g.season <= 2021),
  evaluate = prepareEvaluation(games),
  candidates = [],
  selection = {},
  bestTree = {};
for (const kind of kinds) {
  let best;
  for (const spec of specs) {
    const rows = evaluate(kind, spec, 2018, 2021),
      result = {
        kind,
        id: specId(spec),
        spec,
        ...summarize(rows),
        seasons: [2018, 2019, 2020, 2021].map((season) => ({
          season,
          ...summarize(rows.filter((r) => r.season === season)),
        })),
      };
    candidates.push(result);
    if (!best || result.brier < best.brier) best = result;
    console.error('developed', kind, result.id);
  }
  bestTree[kind] = { id: best.id, spec: best.spec, brier: best.brier };
  const refs = ['book', 'previous'].map((reference) => ({
    kind,
    id: reference,
    spec: null,
    ...summarize(evaluate(kind, null, 2018, 2021, reference)),
  }));
  candidates.push(...refs);
  const chosen = [best, ...refs].reduce((a, b) => (a.brier < b.brier ? a : b));
  selection[kind] = { id: chosen.id, spec: chosen.spec, brier: chosen.brier };
}
const hash = (v) => createHash('sha256').update(v).digest('hex');
console.log(
  JSON.stringify(
    {
      frozenAt: new Date().toISOString(),
      developmentSeasons: [2018, 2021],
      developmentSha256: hash(JSON.stringify(games)),
      contextSha256: hash(await readFile(args[1])),
      parameters: boostedMarketParameters,
      candidateCountPerMarket: specs.length + 2,
      candidates,
      selection,
      bestTree,
      warnings: [
        'Later seasons were examined for diagnosis and are reused audits; this is not an untouched holdout.',
        'Structures/rules chosen only on 2018–2021. No later-season subgroup thresholds or return optimization.',
      ],
    },
    null,
    2,
  ),
);
