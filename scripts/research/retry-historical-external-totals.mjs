import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { HistoricalPredictionMarketData } from '../../packages/integrations/dist/research/historical-prediction-market-data.js';
import { normalizeHistoricalTotalCatalog } from '../../packages/integrations/dist/research/historical-total-catalog.js';
import { readGameContextSnapshot } from './game-context-snapshot.mjs';
const [contexts, catalogPath, acquisition, out] = process.argv.slice(2);
if (!contexts || !catalogPath || !acquisition || !out)
  throw new Error('Usage: <contexts> <catalog> <acquisition-directory> <new-output-directory>');
const snapshot = JSON.parse(await readFile(`${acquisition}/signals.json`, 'utf8')),
  catalog = JSON.parse(await readFile(catalogPath, 'utf8')),
  games = await readGameContextSnapshot(contexts);
await mkdir(out, { recursive: false });
await mkdir(`${out}/raw`);
const cached = new Map(snapshot.responses.filter((r) => r.status === 200).map((r) => [r.url, r]));
const fetcher = async (url, options) => {
  const old = cached.get(String(url));
  return old
    ? new Response(await readFile(`${acquisition}/raw/${old.sha256}.json`, 'utf8'))
    : fetch(url, options);
};
const responses = [...snapshot.responses],
  coverage = [...snapshot.coverage],
  tapes = [...snapshot.tapes];
const adapter = new HistoricalPredictionMarketData(
  normalizeHistoricalTotalCatalog(catalog.events),
  fetcher,
  async (e, raw) => {
    const old = cached.get(e.url);
    if (old?.sha256 === e.sha256) return;
    await writeFile(`${out}/raw/${e.sha256}.json`, raw, { flag: 'wx' }).catch((err) => {
      if (err.code !== 'EEXIST') throw err;
    });
    responses.push(e);
  },
);
const retries = coverage.filter(
  (c) =>
    !['captured', 'no exact pre-cutoff contract'].includes(c.status) ||
    (c.season === 2024 && c.provider === 'polymarket'),
);
for (const c of retries) {
  const g = games.find((g) => g.id === c.gameId);
  let replacement;
  try {
    const t = await adapter.total(g, c.provider);
    if (t) {
      const previous = tapes.findIndex(
        (old) => old.gameId === t.gameId && old.provider === t.provider,
      );
      if (previous >= 0) tapes.splice(previous, 1);
      tapes.push(t);
    }
    replacement = {
      ...c,
      status: t ? 'captured' : 'no exact pre-cutoff contract',
      prices: t?.prices.length ?? 0,
      trades: t?.trades.length ?? 0,
      earlyTrades: t?.earlyTrades?.length ?? 0,
      complete: t?.complete ?? false,
    };
  } catch (error) {
    replacement = { ...c, status: String(error.message).slice(0, 160) };
  }
  coverage[coverage.indexOf(c)] = replacement;
  console.error('retry', c.gameId, c.provider, replacement.status);
}
tapes.sort((a, b) => a.gameId.localeCompare(b.gameId) || a.provider.localeCompare(b.provider));
await writeFile(
  `${out}/signals.json`,
  JSON.stringify({
    ...snapshot,
    tapes,
    coverage,
    responses,
    reprocessedAt: new Date().toISOString(),
    rawAcquisition: acquisition,
    retries: retries.length,
  }),
  { flag: 'wx' },
);
console.log(JSON.stringify({ tapes: tapes.length, retries: retries.length }));
