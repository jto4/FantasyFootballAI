import { readFile, stat } from 'node:fs/promises';
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
if (args.length !== 4 || args[0] !== '--contexts' || args[2] !== '--frozen')
  throw new Error('Usage: --contexts <games.json> --frozen <development.json>');
if ((await stat(args[3])).size > 1000000) throw new Error('Frozen file exceeds limit.');
const games = await readGameContextSnapshot(args[1]),
  f = JSON.parse(await readFile(args[3], 'utf8')),
  hash = (v) => createHash('sha256').update(v).digest('hex');
if (
  hash(await readFile(args[1])) !== f.contextSha256 ||
  hash(JSON.stringify(games.filter((g) => g.season <= 2021))) !== f.developmentSha256 ||
  JSON.stringify(f.parameters) !== JSON.stringify(expertTotalsParameters) ||
  !Number.isFinite(Date.parse(f.frozenAt)) ||
  f.developmentSeasons?.join() !== '2018,2021'
)
  throw new Error('Frozen context/parameter mismatch.');
for (const [key, c] of [
  ['selection', f.selection],
  ['bestAdaptive', f.bestAdaptive],
])
  if (
    !c ||
    !(
      (key === 'selection' && c.spec === null && c.id === specId(null)) ||
      specs.some((s) => specId(s) === c.id && JSON.stringify(s) === JSON.stringify(c.spec))
    )
  )
    throw new Error('Invalid expert procedure.');
const evaluate = prepareEvaluation(games, 2022, 2026),
  selected = evaluate(f.selection.spec),
  adapted = evaluate(f.bestAdaptive.spec),
  unadapted = evaluate(null);
console.log(
  JSON.stringify(
    {
      scoredAt: new Date().toISOString(),
      frozenAt: f.frozenAt,
      contextSha256: f.contextSha256,
      frozenSha256: hash(await readFile(args[3])),
      selection: f.selection,
      bestAdaptive: f.bestAdaptive,
      selected: expertReport(selected.filter((r) => r.season <= 2025)),
      recent: expertReport(selected.filter((r) => r.season === 2026)),
      adapted: expertReport(adapted.filter((r) => r.season <= 2025)),
      recentAdapted: expertReport(adapted.filter((r) => r.season === 2026)),
      unadapted: expertReport(unadapted.filter((r) => r.season <= 2025)),
      recentUnadapted: expertReport(unadapted.filter((r) => r.season === 2026)),
      warnings: [
        'All later data is reused retrospective evidence; the 2026 sample still stops at the prior snapshot.',
        'No subgroup-based wagers, prospective v9 forecasts or profitability are established.',
        'Expert weights use only forecasts and outcomes from earlier NFL weeks; book matches are ties.',
      ],
    },
    null,
    2,
  ),
);
