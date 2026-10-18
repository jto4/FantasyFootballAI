import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readGameContextSnapshot } from './game-context-snapshot.mjs';
import {
  kinds,
  specs,
  specId,
  prepareEvaluation,
  summarize,
} from './rich-personnel-evaluation.mjs';
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--contexts')
  throw new Error('Usage: --contexts <games.json>');
// Strip all audit rows before preparing *any* model. Later results cannot choose structure or rule.
const games = (await readGameContextSnapshot(args[1])).filter((g) => g.season <= 2021),
  evaluate = prepareEvaluation(games),
  candidates = [],
  selection = {};
for (const kind of kinds) {
  const previous = {
    id: 'previous',
    kind,
    spec: null,
    ...summarize(evaluate(kind, null, 2018, 2021)),
  };
  let selected = previous;
  candidates.push(previous);
  for (const spec of specs) {
    const rows = evaluate(kind, spec, 2018, 2021),
      result = {
        id: specId(spec),
        kind,
        spec,
        ...summarize(rows),
        seasons: [2018, 2019, 2020, 2021].map((season) => ({
          season,
          ...summarize(rows.filter((r) => r.season === season)),
        })),
      };
    candidates.push(result);
    if (result.brier < selected.brier) selected = result;
    console.error('scored', kind, result.id);
  }
  selection[kind] = { id: selected.id, spec: selected.spec, brier: selected.brier };
}
console.log(
  JSON.stringify(
    {
      frozenAt: new Date().toISOString(),
      developmentSeasons: [2018, 2021],
      developmentSha256: createHash('sha256').update(JSON.stringify(games)).digest('hex'),
      contextSha256: createHash('sha256')
        .update(await readFile(args[1]))
        .digest('hex'),
      candidateCountPerMarket: specs.length + 1,
      candidates,
      selection,
      warning:
        'Selection is restricted to older data, but later archive audits are reused evidence, not an untouched holdout.',
    },
    null,
    2,
  ),
);
