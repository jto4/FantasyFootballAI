import { readFile } from 'node:fs/promises';
import {
  inputs,
  overview,
  hash,
  expandedTotalParameters,
  summarize,
} from './expanded-total-evaluation.mjs';
import { prepareExternalTotalsModel } from '../../packages/core/dist/external-total-signals.js';
const [context, signals, frozenPath] = process.argv.slice(2);
if (!context || !signals || !frozenPath)
  throw new Error('Usage: <contexts> <signals> <frozen-settings.json>');
const f = JSON.parse(await readFile(frozenPath));
if (
  JSON.stringify(f.parameters) !== JSON.stringify(expandedTotalParameters) ||
  f.contextSha256 !== hash(await readFile(context)) ||
  f.signalsSha256 !== hash(await readFile(signals))
)
  throw new Error('Frozen snapshot mismatch.');
for (const [p, h] of Object.entries(f.codeHashes))
  if (hash(await readFile(p)) !== h) throw new Error('Frozen code mismatch.');
const e = await inputs(context, signals),
  rows = e.evaluate(f.selected, () => true);
const legacy = prepareExternalTotalsModel(e.model, e.signals.tapes, [], 'combined');
const previousRows = e.base.map(({ game, raw, ...r }) => ({
  ...r,
  p:
    r.kind === 'total'
      ? legacy.probability(
          'total',
          game,
          raw,
          r.book,
          new Date(Date.parse(game.kickoffAt) - 1800000).toISOString(),
        )
      : r.previous,
}));
const auditRows = rows.filter(e.audit);
const result = {
  scoredAt: new Date().toISOString(),
  frozenAt: f.frozenAt,
  selected: f.selected,
  contextSha256: f.contextSha256,
  signalsSha256: f.signalsSha256,
  frozenSha256: hash(await readFile(frozenPath)),
  audit: overview(auditRows),
  auditLegacyCombined: summarize(previousRows.filter((r) => e.audit(r) && r.kind === 'total')),
  all: overview(rows),
  seasons: [2023, 2024, 2025, 2026].map((season) => ({
    season,
    phase:
      season === 2025
        ? 'development W1–8; audit W9–18'
        : season === 2026
          ? 'reused audit'
          : season === 2024
            ? 'development'
            : 'coverage control',
    ...overview(rows.filter((r) => r.season === season)),
    legacyCombined: summarize(
      previousRows.filter((r) => r.season === season && r.kind === 'total'),
    ),
  })),
  markets: ['moneyline', 'spread'].map((kind) => ({
    kind,
    ...summarize(rows.filter((r) => r.kind === kind)),
  })),
  rows,
  warnings: [
    'Retrospective matched lines have no historical sportsbook observation timestamps; no executable edge or return on stake is established.',
    'All later seasons were previously examined in this project. Development selection is frozen before this audit, but these are reused research seasons.',
    '2023/2024 empty source histories and all exact-book fallbacks are ties, never model wins. No sentiment, current leaderboard, current holdings, post-cutoff execution or terminal price is backfilled.',
  ],
};
console.log(JSON.stringify(result, null, 2));
