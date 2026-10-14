import { readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readGameContextSnapshot } from './game-context-snapshot.mjs';
import { PublicSportsbookLines } from '../packages/integrations/dist/sportsbook-lines.js';
import { summarize } from './rich-personnel-evaluation.mjs';
const args = process.argv.slice(2);
if (
  args.length !== 8 ||
  args[0] !== '--contexts' ||
  args[2] !== '--record' ||
  args[4] !== '--seal' ||
  args[6] !== '--out'
)
  throw new Error(
    'Usage: --contexts <games.json> --record <pending.json> --seal <seal.json> --out <new-result.json>',
  );
for (const path of [args[3], args[5]])
  if ((await stat(path)).size > 1000000) throw new Error('Forward input too large.');
const hash = (v) => createHash('sha256').update(v).digest('hex'),
  record = JSON.parse(await readFile(args[3], 'utf8')),
  seal = JSON.parse(await readFile(args[5], 'utf8'));
if (
  hash(await readFile(args[3])) !== seal.recordSha256 ||
  hash(await readFile(args[1])) !== record.contextSha256
)
  throw new Error('Forward record or context mismatch.');
if (!Array.isArray(record.pending) || record.pending.length > 100)
  throw new Error('Invalid forward records.');
const games = await readGameContextSnapshot(args[1]),
  byId = new Map(games.map((g) => [g.id, g])),
  source = new PublicSportsbookLines(),
  outcomes = [],
  rows = [];
const now = Date.now();
for (const r of record.pending) {
  const g = byId.get(r.gameId);
  if (
    !g ||
    g.kickoffAt !== r.kickoffAt ||
    !Number.isFinite(Date.parse(r.issuedAt)) ||
    Date.parse(r.issuedAt) >= Date.parse(r.kickoffAt) ||
    r.outcome !== 'pending'
  )
    throw new Error('Unverified forward game or issue time.');
  const final = Date.parse(r.kickoffAt) < now ? await source.result(g) : undefined;
  if (!final) {
    outcomes.push({ gameId: r.gameId, status: 'pending' });
    continue;
  }
  const delta = final.homeScore + final.awayScore - r.line;
  outcomes.push({
    gameId: r.gameId,
    status: delta === 0 ? 'push' : 'resolved',
    final,
    y: delta > 0 ? 1 : 0,
  });
  if (delta === 0) continue;
  for (const family of ['price', 'flow', 'media', 'combined']) {
    const p = r.probabilities[family];
    if (
      ![p, r.book, r.production].every(
        (v) => typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1,
      )
    )
      throw new Error('Invalid issued probability.');
    rows.push({
      family,
      id: g.id,
      season: g.season,
      week: g.week,
      p,
      book: r.book,
      previous: r.production,
      y: delta > 0 ? 1 : 0,
    });
  }
}
const result = {
  checkedAt: new Date().toISOString(),
  recordSha256: seal.recordSha256,
  contextSha256: record.contextSha256,
  outcomes,
  resolvedGames: outcomes.filter((r) => r.status === 'resolved').length,
  pendingGames: outcomes.filter((r) => r.status === 'pending').length,
  results: Object.fromEntries(
    ['price', 'flow', 'media', 'combined'].map((f) => [
      f,
      summarize(rows.filter((r) => r.family === f)),
    ]),
  ),
  warning:
    'Independent result sidecar; issued probabilities and book quotes are never replaced. Markets/variants from one game are correlated. No accuracy claim from pending games.',
};
await writeFile(args[7], JSON.stringify(result, null, 2), { flag: 'wx' });
console.log(
  JSON.stringify({ resolvedGames: result.resolvedGames, pendingGames: result.pendingGames }),
);
