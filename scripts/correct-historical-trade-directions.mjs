import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { canonicalKalshiDirection } from '../packages/integrations/dist/canonical-prediction-trades.js';
import { validateExpandedTotalTape } from '../packages/core/dist/index.js';
const [inputPath, out, patchPath, ...roots] = process.argv.slice(2);
if (!inputPath || !out || !patchPath || !roots.length)
  throw new Error(
    'Usage: <old-signals> <new-corrected-signals> <new-evidence-patch> <raw-root...>',
  );
if ((await stat(inputPath)).size > 200000000) throw new Error('Signal input too large');
const sha = (x) => createHash('sha256').update(x).digest('hex'),
  inputBytes = await readFile(inputPath),
  s = JSON.parse(inputBytes);
if (
  s.version !== 2 ||
  s.complete !== true ||
  !Array.isArray(s.responses) ||
  s.responses.length > 10000 ||
  !Array.isArray(s.tapes) ||
  s.tapes.length > 2500
)
  throw new Error('Invalid source snapshot');
const rawTrades = new Map(),
  responses = [];
for (const e of s.responses) {
  if (
    e.status !== 200 ||
    !e.url.startsWith('https://external-api.kalshi.com/') ||
    !e.url.includes('/trades?')
  )
    continue;
  if (!/^[a-f0-9]{64}$/.test(e.sha256)) throw new Error('Invalid response hash');
  let bytes;
  for (const root of roots) {
    try {
      const path = root + '/' + e.sha256 + '.json';
      if ((await stat(path)).size > 2000000) throw new Error('Raw response too large');
      bytes = await readFile(path);
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  if (!bytes || sha(bytes) !== e.sha256)
    throw new Error('Missing or modified captured raw response');
  const data = JSON.parse(bytes),
    ticker = new URL(e.url).searchParams.get('ticker');
  if (!Array.isArray(data.trades) || data.trades.length > 1000) throw new Error('Invalid raw rows');
  responses.push({ url: e.url, capturedAt: e.capturedAt, sha256: e.sha256 });
  for (const r of data.trades) {
    if (
      r.ticker !== ticker ||
      typeof r.trade_id !== 'string' ||
      !/^[a-f0-9-]{1,80}$/.test(r.trade_id)
    )
      throw new Error('Raw identity mismatch');
    const key = r.ticker + ':' + r.trade_id,
      v = { ...r, evidenceSha256: e.sha256 };
    const old = rawTrades.get(key);
    if (
      old &&
      JSON.stringify({ ...old, evidenceSha256: undefined }) !==
        JSON.stringify({ ...v, evidenceSha256: undefined })
    )
      throw new Error('Conflicting raw trade');
    rawTrades.set(key, v);
  }
}
const patch = [],
  tapes = s.tapes.map((t) => {
    validateExpandedTotalTape(t);
    if (t.provider !== 'kalshi') return t;
    const correct = (trade) => {
      const r = rawTrades.get(t.contractId + ':' + trade.id);
      if (!r) throw new Error('Missing raw direction evidence');
      if (
        new Date(r.created_time).toISOString() !== trade.at ||
        Number(r.count_fp) !== trade.shares ||
        Number(r.yes_price_dollars) !== trade.overProbability ||
        Math.abs(Number(r.yes_price_dollars) + Number(r.no_price_dollars) - 1) > 0.00001
      )
        throw new Error('Raw-to-normalized join mismatch');
      const canonical = canonicalKalshiDirection(r);
      patch.push({
        gameId: t.gameId,
        contractId: t.contractId,
        tradeId: trade.id,
        at: trade.at,
        takerOutcomeSide: r.taker_outcome_side,
        takerBookSide: r.taker_book_side,
        isBlockTrade: canonical.isBlockTrade,
        oldDirection: trade.direction,
        direction: canonical.direction,
        evidenceSha256: r.evidenceSha256,
      });
      return { ...trade, ...canonical };
    };
    return {
      ...t,
      directionSchema: 'kalshi-exposure-v1',
      trades: t.trades.map(correct),
      ...(t.earlyTrades ? { earlyTrades: t.earlyTrades.map(correct) } : {}),
    };
  });
const evidence = {
  version: 1,
  correctedAt: new Date().toISOString(),
  sourceSignalsSha256: sha(inputBytes),
  source: 'https://docs.kalshi.com/getting_started/order_direction',
  responses,
  patch,
  counts: {
    joined: patch.length,
    changed: patch.filter((p) => p.oldDirection !== p.direction).length,
    over: patch.filter((p) => p.direction === 1).length,
    under: patch.filter((p) => p.direction === -1).length,
    blocks: patch.filter((p) => p.isBlockTrade).length,
  },
};
const patchBytes = Buffer.from(JSON.stringify(evidence));
await writeFile(patchPath, patchBytes, { flag: 'wx' });
await writeFile(
  out,
  JSON.stringify({
    ...s,
    tapes,
    directionCorrection: {
      version: 1,
      sourceSignalsSha256: evidence.sourceSignalsSha256,
      patchSha256: sha(patchBytes),
      rule: 'Canonical Kalshi yes/bid => Over, no/ask => Under; both fields must agree; no outcomes or price heuristics used.',
    },
  }),
  { flag: 'wx' },
);
console.log(JSON.stringify(evidence.counts));
