import { readFile, stat } from 'node:fs/promises';
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
if (args.length !== 4 || args[0] !== '--contexts' || args[2] !== '--frozen')
  throw new Error('Usage: --contexts <games.json> --frozen <development.json>');
if ((await stat(args[3])).size > 1000000) throw new Error('Frozen file exceeds limit.');
const games = await readGameContextSnapshot(args[1]),
  frozen = JSON.parse(await readFile(args[3], 'utf8')),
  hash = (v) => createHash('sha256').update(v).digest('hex');
if (
  hash(await readFile(args[1])) !== frozen.contextSha256 ||
  hash(JSON.stringify(games.filter((g) => g.season <= 2021))) !== frozen.developmentSha256 ||
  JSON.stringify(frozen.parameters) !== JSON.stringify(seasonalHybridParameters) ||
  !Number.isFinite(Date.parse(frozen.frozenAt)) ||
  frozen.developmentSeasons?.join() !== '2018,2021'
)
  throw new Error('Frozen context/parameters mismatch.');
const c = frozen.selection;
const a = frozen.bestAdaptive;
if (!a || !specs.some((s) => specId(s) === a.id && JSON.stringify(s) === JSON.stringify(a.spec)))
  throw new Error('Invalid frozen adaptation procedure.');
if (
  !c ||
  !(
    (c.spec === null && c.id === specId(null)) ||
    specs.some((s) => specId(s) === c.id && JSON.stringify(s) === JSON.stringify(c.spec))
  )
)
  throw new Error('Invalid frozen hybrid procedure.');
const evaluate = prepareEvaluation(games, 2022, 2026),
  selected = evaluate(c.spec),
  unadapted = evaluate(null),
  adapted = evaluate(a.spec);
console.log(
  JSON.stringify(
    {
      scoredAt: new Date().toISOString(),
      frozenAt: frozen.frozenAt,
      contextSha256: frozen.contextSha256,
      frozenSha256: hash(await readFile(args[3])),
      selection: c,
      bestAdaptive: a,
      selected: report(selected.filter((r) => r.season <= 2025)),
      unadapted: report(unadapted.filter((r) => r.season <= 2025)),
      recent: report(selected.filter((r) => r.season === 2026)),
      recentUnadapted: report(unadapted.filter((r) => r.season === 2026)),
      adapted: report(adapted.filter((r) => r.season <= 2025)),
      recentAdapted: report(adapted.filter((r) => r.season === 2026)),
      warnings: [
        'Later seasons and the fixed current-season snapshot are reused retrospective evidence, not an untouched holdout.',
        'Book fallbacks are ties, and a lower aggregate Brier is not proof of consistent advantage or profit.',
        'Whole target weeks are withheld from tree, seasonal calibration and book-blend fits.',
      ],
    },
    null,
    2,
  ),
);
