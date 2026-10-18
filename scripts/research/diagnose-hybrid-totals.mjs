import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readGameContextSnapshot } from './game-context-snapshot.mjs';
import { prepareEvaluation } from './seasonal-hybrid-evaluation.mjs';
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--contexts')
  throw new Error('Usage: --contexts <games.json>');
const games = await readGameContextSnapshot(args[1]),
  evaluate = prepareEvaluation(games, 2022, 2026),
  rows = evaluate(null).filter((r) => r.kind === 'total'),
  mean = (v) => v.reduce((s, n) => s + n, 0) / v.length;
function summary(cases) {
  if (!cases.length) return { n: 0 };
  const d = cases.map((r) => r.p - r.book);
  return {
    n: cases.length,
    brier: mean(cases.map((r) => (r.p - r.y) ** 2)),
    bookBrier: mean(cases.map((r) => (r.book - r.y) ** 2)),
    excessBrier: mean(cases.map((r) => (r.p - r.y) ** 2 - (r.book - r.y) ** 2)),
    varianceCost: mean(d.map((v) => v * v)),
    alignmentGain: 2 * mean(cases.map((r, i) => d[i] * (r.y - r.book))),
    predictedMean: mean(cases.map((r) => r.p)),
    bookMean: mean(cases.map((r) => r.book)),
    outcomeRate: mean(cases.map((r) => r.y)),
    correctionCorrect: cases.filter((r) => (r.p - r.book) * (r.y - r.book) > 0).length,
    meanAbsoluteCorrection: mean(d.map(Math.abs)),
  };
}
const recent = rows.filter((r) => r.season === 2026);
console.log(
  JSON.stringify(
    {
      scoredAt: new Date().toISOString(),
      contextSha256: createHash('sha256')
        .update(await readFile(args[1]))
        .digest('hex'),
      seasons: [2022, 2023, 2024, 2025, 2026].map((season) => ({
        season,
        ...summary(rows.filter((r) => r.season === season)),
      })),
      recent: {
        ...summary(recent),
        weeks: [1, 2, 3, 4, 5].map((week) => ({
          week,
          ...summary(recent.filter((r) => r.week === week)),
        })),
        directions: [true, false].map((over) => ({
          over,
          ...summary(recent.filter((r) => r.p > r.book === over)),
        })),
        magnitudes: [
          [0, 0.025],
          [0.025, 0.05],
          [0.05, 1],
        ].map(([from, to]) => ({
          from,
          to,
          ...summary(
            recent.filter((r) => Math.abs(r.p - r.book) >= from && Math.abs(r.p - r.book) < to),
          ),
        })),
      },
      warnings: [
        'This is post-hoc error attribution on 77 reused 2026 totals, not causal proof or a fresh test.',
        'No subgroup threshold or individual failed game is used for parameter selection.',
      ],
    },
    null,
    2,
  ),
);
