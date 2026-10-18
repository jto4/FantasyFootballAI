import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  PublicFootballData,
  PublicSportsbookLines,
  PublicPredictionMarketData,
  FootballNewsCache,
  SleeperPlayerCatalog,
} from '../packages/integrations/dist/index.js';
import {
  buildMarketSignals,
  freezeMarketResearch,
  buildPropGameLog,
  propHistoryIdentityResolver,
  isUpcomingFootballGame,
} from '../packages/core/dist/index.js';
// Explicit opt-in public-data capture. No owner profile, credentials, AI, messages or wagers.
const directory = process.argv[2];
if (!directory) throw Error('Provide an output directory outside the repository.');
const output = resolve(directory);
await mkdir(output, { recursive: true, mode: 0o700 });
const now = Date.now(),
  season = new Date(now).getUTCFullYear() - (new Date(now).getUTCMonth() < 2 ? 1 : 0);
const data = await new PublicFootballData().get(season);
const game = data.games
  .filter((g) => g.season === season && isUpcomingFootballGame(g, new Date().toISOString()))
  .sort((a, b) => Date.parse(a.kickoffAt) - Date.parse(b.kickoffAt))[0];
if (!game) throw Error('No verified upcoming NFL game.');
const odds = await new PublicSportsbookLines().get(game),
  baseline = odds.quotes.find((q) => q.kind === 'total' && q.side === 'over' && q.line % 1 === 0.5);
if (!baseline) throw Error('No complete live two-sided half-point total baseline.');
const cutoffAt = new Date().toISOString(),
  evidence = [];
const markets = new PublicPredictionMarketData(fetch, Date.now, async (e) => {
  evidence.push(e);
});
const [market, media, players] = await Promise.allSettled([
  markets.getTotal(
    { ...game, totalLine: baseline.line },
    'kalshi',
    cutoffAt,
    AbortSignal.timeout(90000),
  ),
  new FootballNewsCache().getForAdvice(),
  new SleeperPlayerCatalog().get(),
]);
const tape = market.status === 'fulfilled' ? market.value : undefined,
  news = media.status === 'fulfilled' ? media.value : undefined,
  catalog = players.status === 'fulfilled' ? players.value : new Map();
const snapshot = buildMarketSignals({
  id: randomUUID(),
  game,
  line: baseline.line,
  provider: 'kalshi',
  cutoffAt,
  capturedAt: new Date().toISOString(),
  ...(tape ? { tape } : {}),
  baseline,
  ...(news ? { news } : {}),
});
let prospective, freezeError;
try {
  prospective = freezeMarketResearch(snapshot, new Date().toISOString());
} catch (e) {
  freezeError = e.message;
}
const resolveIdentity = propHistoryIdentityResolver(data);
const player = [...catalog.values()].find(
  (p) =>
    p.position === 'QB' &&
    p.nflTeam === game.home &&
    resolveIdentity(p) &&
    data.players.filter((r) => r.playerId === resolveIdentity(p)).length > 10,
);
const prop = player
  ? buildPropGameLog(
      resolveIdentity(player),
      player.name,
      'passing_yards',
      data.players,
      data.games,
      new Date().toISOString(),
    )
  : undefined;
const contents = {
  capturedAt: new Date().toISOString(),
  data,
  catalog: [...catalog],
  odds,
  tape,
  news,
  snapshot,
  prospective,
  freezeError,
  prop,
  evidence,
};
await writeFile(join(output, 'capture.json'), JSON.stringify(contents), { mode: 0o600 });
console.log(
  JSON.stringify(
    {
      game: game.id,
      line: snapshot.line,
      contract: snapshot.contractId,
      complete: snapshot.complete,
      prices: snapshot.prices.length,
      tradeHours: snapshot.activity.length,
      headlines: snapshot.headlines.length,
      mediaStatus: snapshot.mediaStatus,
      prospectiveFrozenAt: prospective?.frozenAt,
      freezeError,
      propPlayer: prop?.name,
      propGames: prop?.rows.length,
      evidenceResponses: evidence.length,
      output: join(output, 'capture.json'),
    },
    null,
    2,
  ),
);
