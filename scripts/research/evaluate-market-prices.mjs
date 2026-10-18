import { createHash } from 'node:crypto';
import {
  PublicFootballData,
  PublicPregameEvidence,
} from '../../packages/integrations/dist/index.js';
import { evaluateArchivedMarkets } from '../../packages/core/dist/index.js';
const compare = process.argv.slice(2).length === 1 && process.argv[2] === '--compare';
if (process.argv.slice(2).length && !compare) throw new Error('Supported option: --compare');
const now = new Date(),
  season = now.getUTCMonth() < 2 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
let data = await new PublicFootballData().get(season);
data = await new PublicPregameEvidence().history(data, new Date().toISOString());
const asOf = new Date().toISOString(),
  started = performance.now();
const reports = (
  compare
    ? [
        [season - 4, season - 3],
        [season - 2, season - 1],
      ]
    : [[season - 2, season - 1]]
).map((years) => evaluateArchivedMarkets(data, years, asOf));
console.log(
  JSON.stringify(
    {
      source: {
        url: data.sources.find((s) => s.id === 'games')?.url,
        retrievedAt: data.sources.find((s) => s.id === 'games')?.retrievedAt,
      },
      elapsedMs: Math.round(performance.now() - started),
      normalizedGamesSha256: createHash('sha256').update(JSON.stringify(data.games)).digest('hex'),
      ...(compare ? { reports } : { report: reports[0] }),
    },
    null,
    2,
  ),
);
