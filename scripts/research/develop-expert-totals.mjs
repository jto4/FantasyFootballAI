import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readGameContextSnapshot } from './game-context-snapshot.mjs';
import {
  prepareEvaluation,
  specs,
  specId,
  expertReport,
  expertTotalsParameters,
} from './expert-totals-evaluation.mjs';
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--contexts')
  throw new Error('Usage: --contexts <games.json>');
const games = (await readGameContextSnapshot(args[1])).filter((g) => g.season <= 2021),
  evaluate = prepareEvaluation(games, 2018, 2021),
  candidates = [];
let selected, bestAdaptive;
for (const spec of [null, ...specs]) {
  const r = { id: specId(spec), spec, ...expertReport(evaluate(spec)) };
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
      parameters: expertTotalsParameters,
      candidateCount: candidates.length,
      selection: { id: selected.id, spec: selected.spec, brier: selected.totals.brier },
      bestAdaptive: {
        id: bestAdaptive.id,
        spec: bestAdaptive.spec,
        brier: bestAdaptive.totals.brier,
      },
      candidates,
      warnings: [
        '2026 diagnostics motivated the new family; all later audits are reused, not fresh holdouts.',
        'Only 2018–2021 selects mixture settings. Moneyline and spread stay on production v3.',
      ],
    },
    null,
    2,
  ),
);
