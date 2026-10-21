import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { canonicalKalshiDirection } from '../../packages/integrations/dist/research/canonical-prediction-trades.js';
const [oldPath, patchPath, out] = process.argv.slice(2);
if (!oldPath || !patchPath || !out)
  throw new Error('Usage: <original-signals> <saved-direction-patch> <new-reconstructed-signals>');
for (const p of [oldPath, patchPath])
  if ((await stat(p)).size > 200000000) throw new Error('Repair artifact too large');
const sha = (x) => createHash('sha256').update(x).digest('hex'),
  oldBytes = await readFile(oldPath),
  patchBytes = await readFile(patchPath),
  s = JSON.parse(oldBytes),
  p = JSON.parse(patchBytes);
if (
  p.version !== 1 ||
  p.sourceSignalsSha256 !== sha(oldBytes) ||
  !Array.isArray(p.patch) ||
  p.patch.length > 1000000
)
  throw new Error('Patch source mismatch');
const map = new Map();
for (const r of p.patch) {
  const key = r.gameId + ':' + r.contractId + ':' + r.tradeId;
  if (map.has(key)) throw new Error('Duplicate repair row');
  map.set(key, r);
}
let applied = 0;
const tapes = s.tapes.map((t) => {
  if (t.provider !== 'kalshi') return t;
  const repair = (r) => {
    const e = map.get(t.gameId + ':' + t.contractId + ':' + r.id);
    if (!e || e.at !== r.at || e.oldDirection !== r.direction)
      throw new Error('Repair identity mismatch');
    const canonical = canonicalKalshiDirection({
      taker_outcome_side: e.takerOutcomeSide,
      taker_book_side: e.takerBookSide,
      is_block_trade: e.isBlockTrade,
    });
    if (canonical.direction !== e.direction) throw new Error('Repair direction mismatch');
    applied++;
    return { ...r, ...canonical };
  };
  return {
    ...t,
    directionSchema: 'kalshi-exposure-v1',
    trades: t.trades.map(repair),
    ...(t.earlyTrades ? { earlyTrades: t.earlyTrades.map(repair) } : {}),
  };
});
if (applied !== map.size) throw new Error('Unused repair evidence');
const result = {
  ...s,
  tapes,
  directionCorrection: {
    version: 1,
    sourceSignalsSha256: sha(oldBytes),
    patchSha256: sha(patchBytes),
    rule: 'Canonical Kalshi yes/bid => Over, no/ask => Under; both fields must agree; no outcomes or price heuristics used.',
  },
};
const raw = Buffer.from(JSON.stringify(result));
await writeFile(out, raw, { flag: 'wx' });
console.log(JSON.stringify({ applied, sha256: sha(raw) }));
