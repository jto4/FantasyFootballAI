import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readGameContextSnapshot } from './game-context-snapshot.mjs';
import { HistoricalPredictionMarketData } from '../../packages/integrations/dist/research/historical-prediction-market-data.js';
const args = process.argv.slice(2);
if (args.length !== 6 || args[0] !== '--contexts' || args[2] !== '--catalog' || args[4] !== '--out')
  throw new Error('Usage: --contexts <games.json> --catalog <catalog.json> --out <new-directory>');
const hash = (v) => createHash('sha256').update(v).digest('hex');
const games = await readGameContextSnapshot(args[1]);
const catalog = JSON.parse(await readFile(args[3], 'utf8'));
if (catalog.complete !== true || !Array.isArray(catalog.events) || catalog.events.length > 5000)
  throw new Error('Incomplete catalog.');
const selected = games.filter(
  (g) =>
    g.season >= 2023 &&
    g.season <= 2025 &&
    g.seasonType === 'REG' &&
    g.kickoffAt &&
    Number.isInteger(g.homeScore) &&
    Number.isInteger(g.awayScore),
);
if (!selected.length || selected.length > 900) throw new Error('Invalid game selection.');
await mkdir(args[5], { recursive: false });
await mkdir(`${args[5]}/raw`);
const tapes = [],
  coverage = [],
  responses = [];
const adapter = new HistoricalPredictionMarketData(catalog.events, fetch, async (e, raw) => {
  await writeFile(`${args[5]}/raw/${e.sha256}.json`, raw, { flag: 'wx' }).catch((err) => {
    if (err.code !== 'EEXIST') throw err;
  });
  responses.push(e);
});
let next = 0;
await Promise.all(
  [0, 1].map(async () => {
    while (next < selected.length) {
      const g = selected[next++];
      for (const provider of ['kalshi', 'polymarket']) {
        try {
          const t = await adapter.total(g, provider);
          if (t) tapes.push(t);
          coverage.push({
            gameId: g.id,
            season: g.season,
            provider,
            line: g.totalLine,
            status: t ? 'captured' : 'no exact pre-cutoff contract',
            prices: t?.prices.length ?? 0,
            trades: t?.trades.length ?? 0,
            earlyTrades: t?.earlyTrades?.length ?? 0,
            complete: t?.complete ?? false,
          });
        } catch (error) {
          coverage.push({
            gameId: g.id,
            season: g.season,
            provider,
            line: g.totalLine,
            status: String(error.message).slice(0, 160),
          });
        }
      }
      if (next % 10 === 0)
        console.error('progress', next, '/', selected.length, 'tapes', tapes.length);
      // Checkpoints retain partial acquisition, never mislabeled as a complete snapshot.
      if (next % 40 === 0)
        await writeFile(
          `${args[5]}/checkpoint.json`,
          JSON.stringify({ tapes, coverage, responses, complete: false }),
        );
    }
  }),
);
tapes.sort((a, b) => a.gameId.localeCompare(b.gameId) || a.provider.localeCompare(b.provider));
const snapshot = {
  version: 2,
  capturedAt: new Date().toISOString(),
  contextSha256: hash(await readFile(args[1])),
  catalogSha256: hash(await readFile(args[3])),
  tapes,
  coverage,
  responses,
  complete: true,
};
await writeFile(`${args[5]}/signals.json`, JSON.stringify(snapshot), { flag: 'wx' });
console.log(
  JSON.stringify({
    tapes: tapes.length,
    trades: tapes.reduce((s, t) => s + t.trades.length + (t.earlyTrades?.length ?? 0), 0),
    seasons: [2023, 2024, 2025].map((season) => ({
      season,
      coverage: coverage
        .filter((c) => c.season === season)
        .reduce((s, c) => ((s[c.status] = (s[c.status] ?? 0) + 1), s), {}),
    })),
  }),
);
