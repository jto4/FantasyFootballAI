import { readFile } from 'node:fs/promises';
import { readGameContextSnapshot } from './game-context-snapshot.mjs';
import {
  prepareEvaluation,
  specs,
  specId,
  report,
  parameters,
  hash,
  readSignals,
} from './matchup-totals-evaluation.mjs';
const args = process.argv.slice(2);
if (args.length !== 4 || args[0] !== '--contexts' || args[2] !== '--signals')
  throw new Error('Usage: --contexts <games.json> --signals <signals.json>');
const games = (await readGameContextSnapshot(args[1])).filter((g) => g.season <= 2021),
  stats = (await readSignals(args[3])).filter((r) => r.season <= 2021),
  evaluate = prepareEvaluation(games, stats, 2018, 2021),
  candidates = [];
let selected, bestSignals;
for (const spec of ['book', 'previous', 'static', 'plain', ...specs]) {
  const row = {
    id: typeof spec === 'string' ? spec : specId(spec),
    spec,
    ...report(evaluate(spec)),
  };
  candidates.push(row);
  if (!selected || row.totals.brier < selected.totals.brier) selected = row;
  if (
    typeof spec !== 'string' &&
    spec.signals &&
    (!bestSignals || row.totals.brier < bestSignals.totals.brier)
  )
    bestSignals = row;
  console.error('developed', row.id);
}
console.log(
  JSON.stringify(
    {
      frozenAt: new Date().toISOString(),
      developmentSeasons: [2018, 2021],
      contextSha256: hash(await readFile(args[1])),
      signalsSha256: hash(await readFile(args[3])),
      developmentGamesSha256: hash(JSON.stringify(games)),
      developmentStatsSha256: hash(JSON.stringify(stats)),
      parameters,
      candidateCount: candidates.length,
      selection: { id: selected.id, spec: selected.spec, brier: selected.totals.brier },
      bestSignals: { id: bestSignals.id, spec: bestSignals.spec, brier: bestSignals.totals.brier },
      candidates,
      warnings: [
        'Only 2018–2021 selected parameters; all later data were removed before preparation.',
        'Family motivated by reused 2026 failures; later audit is retrospective, not untouched.',
        'Latest revised stats with 48h game-start lag, not authenticated historical publication snapshots.',
      ],
    },
    null,
    2,
  ),
);
