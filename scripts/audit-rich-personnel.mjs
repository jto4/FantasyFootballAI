import { readFile, stat } from 'node:fs/promises';
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
if (
  ![4, 6].includes(args.length) ||
  args[0] !== '--contexts' ||
  args[2] !== '--frozen' ||
  (args.length === 6 && args[4] !== '--recent-contexts')
)
  throw new Error(
    'Usage: --contexts <games.json> --frozen <development.json> [--recent-contexts <recent-games.json>]',
  );
if ((await stat(args[3])).size > 1000000) throw new Error('Frozen selection exceeds limit.');
const frozen = JSON.parse(await readFile(args[3], 'utf8')),
  games = await readGameContextSnapshot(args[1]);
const hash = (value) => createHash('sha256').update(value).digest('hex');
if (
  hash(await readFile(args[1])) !== frozen.contextSha256 ||
  hash(JSON.stringify(games.filter((g) => g.season <= 2021))) !== frozen.developmentSha256 ||
  !Number.isFinite(Date.parse(frozen.frozenAt)) ||
  frozen.developmentSeasons?.join() !== '2018,2021'
)
  throw new Error('Frozen selection and context hashes do not match.');
for (const kind of kinds) {
  const s = frozen.selection?.[kind];
  if (
    !s ||
    !(s.id === 'previous'
      ? s.spec === null
      : specs.some(
          (spec) => specId(spec) === s.id && JSON.stringify(spec) === JSON.stringify(s.spec),
        ))
  )
    throw new Error('Invalid frozen procedure.');
}
const evaluate = prepareEvaluation(games),
  rows = [],
  markets = [];
for (const kind of kinds) {
  const cases = evaluate(kind, frozen.selection[kind].spec, 2022, 2025);
  rows.push(...cases);
  for (const season of [2022, 2023, 2024, 2025])
    markets.push({ season, kind, ...summarize(cases.filter((r) => r.season === season)) });
  console.error('audited', kind);
}
const consistency = {
  comparisons: markets.length,
  beatsBook: markets.filter((r) => r.brier < r.bookBrier).length,
  beatsPrevious: markets.filter((r) => r.brier < r.previousBrier).length,
  simultaneousPositive: markets.filter((r) => r.simultaneousBookInterval?.[0] > 0).length,
};
let recent;
if (args[5]) {
  const recentGames = await readGameContextSnapshot(args[5]);
  if (
    hash(JSON.stringify(recentGames.filter((g) => g.season <= 2025))) !==
    hash(JSON.stringify(games.filter((g) => g.season <= 2025)))
  )
    throw new Error('Recent context changes frozen historical rows.');
  const evaluateRecent = prepareEvaluation(recentGames),
    recentRows = [];
  for (const kind of kinds) {
    recentRows.push(...evaluateRecent(kind, frozen.selection[kind].spec, 2026, 2026));
    console.error('audited recent', kind);
  }
  recent = {
    season: 2026,
    snapshotSha256: hash(await readFile(args[5])),
    pooled: summarize(recentRows),
    markets: kinds.map((kind) => ({
      kind,
      ...summarize(recentRows.filter((r) => r.kind === kind)),
    })),
    prospective: false,
    usedForSelection: false,
  };
}
console.log(
  JSON.stringify(
    {
      scoredAt: new Date().toISOString(),
      frozenAt: frozen.frozenAt,
      contextSha256: frozen.contextSha256,
      frozenSha256: hash(await readFile(args[3])),
      selection: frozen.selection,
      ...(recent ? { recent } : {}),
      pooled: summarize(rows),
      markets,
      consistency,
      eligibleForProduction:
        consistency.beatsBook === 12 &&
        consistency.beatsPrevious === 12 &&
        consistency.simultaneousPositive === 12,
      warnings: [
        '2022–2025 is a reused retrospective archive, not fresh independent evidence.',
        'Brier and log loss measure probability accuracy; no profitability or executable pregame prices are established.',
        'Intervals cluster by NFL season/week; simultaneous intervals use twelve-comparison Bonferroni normal approximation.',
        'Publication/revision timing of EPA statistics is not verified. Consistent superiority requires newly recorded outcomes.',
      ],
    },
    null,
    2,
  ),
);
