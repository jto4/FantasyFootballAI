import { readFile, stat } from 'node:fs/promises';
import { readGameContextSnapshot } from './game-context-snapshot.mjs';
import {
  prepareEvaluation,
  specs,
  specId,
  parameters,
  hash,
  readSignals,
  detailedReport,
  diagnostics,
} from './matchup-totals-evaluation.mjs';
const args = process.argv.slice(2);
if (
  args.length !== 6 ||
  args[0] !== '--contexts' ||
  args[2] !== '--signals' ||
  args[4] !== '--frozen'
)
  throw new Error(
    'Usage: --contexts <games.json> --signals <signals.json> --frozen <development.json>',
  );
if ((await stat(args[5])).size > 1000000) throw new Error('Frozen file too large.');
const f = JSON.parse(await readFile(args[5], 'utf8')),
  games = await readGameContextSnapshot(args[1]),
  stats = await readSignals(args[3]);
if (
  f.contextSha256 !== hash(await readFile(args[1])) ||
  f.signalsSha256 !== hash(await readFile(args[3])) ||
  f.developmentGamesSha256 !== hash(JSON.stringify(games.filter((g) => g.season <= 2021))) ||
  f.developmentStatsSha256 !== hash(JSON.stringify(stats.filter((r) => r.season <= 2021))) ||
  JSON.stringify(f.parameters) !== JSON.stringify(parameters) ||
  !specs.some(
    (s) =>
      specId(s) === f.bestSignals.id && JSON.stringify(s) === JSON.stringify(f.bestSignals.spec),
  ) ||
  !f.candidates.some(
    (s) => s.id === f.selection.id && JSON.stringify(s.spec) === JSON.stringify(f.selection.spec),
  )
)
  throw new Error('Frozen input mismatch.');
const evaluate = prepareEvaluation(games, stats, 2022, 2026),
  rows = evaluate(f.bestSignals.spec),
  selected = evaluate(f.selection.spec),
  ablation = evaluate({ ...f.bestSignals.spec, signals: false }),
  fixed = evaluate('static'),
  cases = (rs, from, to) => rs.filter((r) => r.season >= from && r.season <= to),
  totals = (rs) => rs.filter((r) => r.kind === 'total'),
  diagnostic = (rs) => ({
    ...diagnostics(totals(rs)),
    directions: [true, false].map((over) => ({
      over,
      ...diagnostics(totals(rs).filter((r) => r.p > r.book === over)),
    })),
    weeks: [1, 2, 3, 4, 5].map((week) => ({
      week,
      ...diagnostics(totals(rs).filter((r) => r.week === week)),
    })),
    largestLosses: totals(rs)
      .map((r) => ({
        id: r.id,
        p: r.p,
        book: r.book,
        y: r.y,
        excess: (r.p - r.y) ** 2 - (r.book - r.y) ** 2,
      }))
      .sort((a, b) => b.excess - a.excess)
      .slice(0, 8),
  });
console.log(
  JSON.stringify(
    {
      scoredAt: new Date().toISOString(),
      frozenSha256: hash(await readFile(args[5])),
      contextSha256: f.contextSha256,
      signalsSha256: f.signalsSha256,
      selection: f.selection,
      bestSignals: f.bestSignals,
      archive: detailedReport(cases(rows, 2022, 2025)),
      recent: detailedReport(cases(rows, 2026, 2026)),
      selectedArchive: detailedReport(cases(selected, 2022, 2025)),
      selectedRecent: detailedReport(cases(selected, 2026, 2026)),
      featureAblation: {
        spec: { ...f.bestSignals.spec, signals: false },
        archive: detailedReport(cases(ablation, 2022, 2025)),
        recent: detailedReport(cases(ablation, 2026, 2026)),
      },
      fixed2026Diagnostics: diagnostic(cases(fixed, 2026, 2026)),
      fixed2024Diagnostics: diagnostic(cases(fixed, 2024, 2024)),
      recentPredictions: cases(rows, 2026, 2026),
      warnings: [
        'Reused retrospective samples; 77 current totals in 5 week clusters. No prospective edge or profit claim.',
        'All moneyline/spread probabilities are identical to production. No live model change.',
      ],
    },
    null,
    2,
  ),
);
