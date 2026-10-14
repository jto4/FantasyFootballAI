import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readGameContextSnapshot } from './game-context-snapshot.mjs';
import {
  prepareEvaluation,
  specs,
  specId,
  report,
  seasonalHybridParameters,
} from './seasonal-hybrid-evaluation.mjs';
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--contexts')
  throw new Error('Usage: --contexts <games.json>');
const games = (await readGameContextSnapshot(args[1])).filter((g) => g.season <= 2021),
  evaluate = prepareEvaluation(games, 2018, 2021),
  candidates = [];
let selected, bestAdaptive;
for (const spec of [null, ...specs]) {
  const r = { id: specId(spec), spec, ...report(evaluate(spec)) };
  candidates.push(r);
  if (!selected || r.totals.brier < selected.totals.brier) selected = r;
  if (spec && (!bestAdaptive || r.totals.brier < bestAdaptive.totals.brier)) bestAdaptive = r;
  console.error('developed', r.id);
}
const hash = (v) => createHash('sha256').update(v).digest('hex');
console.log(
  JSON.stringify(
    {
      frozenAt: new Date().toISOString(),
      developmentSeasons: [2018, 2021],
      developmentSha256: hash(JSON.stringify(games)),
      contextSha256: hash(await readFile(args[1])),
      parameters: seasonalHybridParameters,
      candidateCount: candidates.length,
      selection: { id: selected.id, spec: selected.spec, brier: selected.totals.brier },
      bestAdaptive: {
        id: bestAdaptive.id,
        spec: bestAdaptive.spec,
        brier: bestAdaptive.totals.brier,
      },
      candidates,
      warnings: [
        'Hybrid structure is user-requested after reused later audits; this is a new retrospective hypothesis.',
        'Only older 2018–2021 outcomes select adaptation parameters. Current production moneyline/spread remain fixed.',
      ],
    },
    null,
    2,
  ),
);
