import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateExpandedTotalTape } from '../../packages/core/dist/index.js';
import { readGameContextSnapshot } from './game-context-snapshot.mjs';
const [contexts, expandedPath, legacyPath, out] = process.argv.slice(2);
if (!contexts || !expandedPath || !legacyPath || !out)
  throw new Error('Usage: <contexts> <expanded-history> <v11-history> <new-combined.json>');
for (const p of [expandedPath, legacyPath])
  if ((await stat(p)).size > 200000000) throw new Error('History too large.');
const hash = (v) => createHash('sha256').update(v).digest('hex');
const games = await readGameContextSnapshot(contexts),
  contextSha256 = hash(await readFile(contexts)),
  expanded = JSON.parse(await readFile(expandedPath)),
  legacy = JSON.parse(await readFile(legacyPath));
if (
  expanded.version !== 2 ||
  expanded.complete !== true ||
  legacy.version !== 1 ||
  legacy.mode !== 'history' ||
  [expanded, legacy].some((s) => s.contextSha256 !== contextSha256)
)
  throw new Error('History context mismatch.');
const dates = new Map(games.map((g) => [g.id, g]));
const tapes = [...expanded.tapes, ...legacy.tapes];
if (tapes.length > 2500) throw new Error('History too large.');
const seen = new Set();
for (const t of tapes) {
  validateExpandedTotalTape(t);
  const g = dates.get(t.gameId),
    key = `${t.gameId}:${t.provider}:${t.cutoffAt}`;
  if (!g || g.kickoffAt !== t.kickoffAt || g.totalLine !== t.line || seen.has(key))
    throw new Error('History identity mismatch.');
  seen.add(key);
}
const snapshot = {
  version: 2,
  complete: true,
  assembledAt: new Date().toISOString(),
  contextSha256,
  catalogSha256: expanded.catalogSha256,
  expandedHistorySha256: hash(await readFile(expandedPath)),
  legacyHistorySha256: hash(await readFile(legacyPath)),
  tapes,
  coverage: [
    ...expanded.coverage,
    ...legacy.coverage.map((c) => ({ ...c, season: dates.get(c.gameId)?.season })),
  ],
  responses: [...expanded.responses, ...legacy.responses],
  warnings: [
    'Original v11 2026 history is reused byte-for-byte per tape; no new 2026 forecasts or outcome selection.',
    'Seven-day trade histories apply only to expanded earlier-season sources; missing early histories remain unavailable.',
  ],
};
await writeFile(out, JSON.stringify(snapshot), { flag: 'wx' });
console.log(
  JSON.stringify({
    tapes: tapes.length,
    trades: tapes.reduce((s, t) => s + t.trades.length + (t.earlyTrades?.length ?? 0), 0),
    earlyTrades: tapes.reduce((s, t) => s + (t.earlyTrades?.length ?? 0), 0),
    seasons: [2023, 2024, 2025, 2026].map((season) => ({
      season,
      tapes: tapes.filter((t) => dates.get(t.gameId)?.season === season).length,
      prices: tapes
        .filter((t) => dates.get(t.gameId)?.season === season)
        .reduce((s, t) => s + t.prices.length, 0),
    })),
  }),
);
