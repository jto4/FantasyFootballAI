import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { specs as richSpecs, specId as richSpecId } from './rich-personnel-evaluation.mjs';
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
if (args.length !== 6 || args[0] !== '--contexts' || args[2] !== '--frozen' || args[4] !== '--v6')
  throw new Error(
    'Usage: --contexts <games.json> --frozen <development.json> --v6 <v6-development.json>',
  );
for (const path of [args[3], args[5]])
  if ((await stat(path)).size > 1000000) throw new Error('Frozen file exceeds limit.');
const games = await readGameContextSnapshot(args[1]),
  frozen = JSON.parse(await readFile(args[3], 'utf8')),
  v6 = JSON.parse(await readFile(args[5], 'utf8')),
  hash = (v) => createHash('sha256').update(v).digest('hex');
if (
  hash(await readFile(args[1])) !== frozen.contextSha256 ||
  hash(JSON.stringify(games.filter((g) => g.season <= 2021))) !== frozen.developmentSha256 ||
  JSON.stringify(frozen.parameters) !== JSON.stringify(boostedMarketParameters) ||
  !Number.isFinite(Date.parse(frozen.frozenAt)) ||
  frozen.developmentSeasons?.join() !== '2018,2021'
)
  throw new Error('Frozen context/parameters mismatch.');
for (const collection of [frozen.selection, frozen.bestTree])
  for (const kind of kinds) {
    const c = collection?.[kind];
    if (
      !c ||
      !(
        (c.spec === null && ['book', 'previous'].includes(c.id)) ||
        specs.some((s) => specId(s) === c.id && JSON.stringify(s) === JSON.stringify(c.spec))
      )
    )
      throw new Error('Invalid frozen procedure.');
  }
if (hash(JSON.stringify(games.filter((g) => g.season <= 2021))) !== v6.developmentSha256)
  throw new Error('V6 development history mismatch.');
for (const kind of kinds) {
  const s = v6.selection?.[kind];
  if (
    !s ||
    !(
      (s.id === 'previous' && s.spec === null) ||
      richSpecs.some((r) => richSpecId(r) === s.id && JSON.stringify(r) === JSON.stringify(s.spec))
    )
  )
    throw new Error('Invalid v6 reference procedure.');
}
const evaluate = prepareEvaluation(games, v6.selection),
  rows = [],
  treeRows = [],
  v6Rows = [];
for (const kind of kinds) {
  rows.push(...evaluate(kind, frozen.selection[kind].spec, 2022, 2026, frozen.selection[kind].id));
  treeRows.push(...evaluate(kind, frozen.bestTree[kind].spec, 2022, 2026));
  v6Rows.push(...evaluate(kind, null, 2022, 2026, 'v6'));
  console.error('audited', kind);
}
function report(cases) {
  const archive = cases.filter((r) => r.season <= 2025),
    recent = cases.filter((r) => r.season === 2026),
    markets = [];
  for (const season of [2022, 2023, 2024, 2025])
    for (const kind of kinds)
      markets.push({
        season,
        kind,
        ...summarize(archive.filter((r) => r.season === season && r.kind === kind)),
      });
  return {
    pooled: summarize(archive),
    markets,
    recent: {
      pooled: summarize(recent),
      markets: kinds.map((kind) => ({ kind, ...summarize(recent.filter((r) => r.kind === kind)) })),
    },
    consistency: {
      beatsBook: markets.filter((r) => r.brier < r.bookBrier - 1e-12).length,
      equalsBook: markets.filter((r) => Math.abs(r.brier - r.bookBrier) <= 1e-12).length,
      losesBook: markets.filter((r) => r.brier > r.bookBrier + 1e-12).length,
      simultaneousPositive: markets.filter((r) => r.simultaneousBookInterval?.[0] > 0).length,
    },
    bookFallbackFraction:
      cases.filter((r) => Math.abs(r.p - r.book) <= 1e-12).length / cases.length,
    meanBlendWeight: cases.reduce((s, r) => s + r.weight, 0) / cases.length,
  };
}
console.log(
  JSON.stringify(
    {
      scoredAt: new Date().toISOString(),
      frozenAt: frozen.frozenAt,
      contextSha256: frozen.contextSha256,
      frozenSha256: hash(await readFile(args[3])),
      v6FrozenSha256: hash(await readFile(args[5])),
      selection: frozen.selection,
      bestTree: frozen.bestTree,
      selected: report(rows),
      tree: report(treeRows),
      v6: report(v6Rows),
      warnings: [
        'All later cases are reused retrospective data. Current-season archive stops at the prior snapshot cutoff.',
        'Exact sportsbook fallbacks are ties, not evidence of beating the book.',
        'Weekly-cluster intervals use a twelve-cell simultaneous normal approximation; no profit is inferred.',
      ],
    },
    null,
    2,
  ),
);
