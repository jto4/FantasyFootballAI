import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readGameContextSnapshot } from './game-context-snapshot.mjs';
import { PublicPredictionMarketData } from '../../packages/integrations/dist/prediction-market-data.js';
import { PublicSportsbookLines } from '../../packages/integrations/dist/sportsbook-lines.js';
import { fetchFootballNewsWithStatus } from '../../packages/integrations/dist/news.js';
const args = process.argv.slice(2);
if (
  args.length !== 6 ||
  args[0] !== '--contexts' ||
  args[2] !== '--mode' ||
  !['history', 'pregame'].includes(args[3]) ||
  args[4] !== '--out'
)
  throw new Error('Usage: --contexts <games.json> --mode history|pregame --out <new-directory>');
const games = await readGameContextSnapshot(args[1]),
  capturedAt = new Date().toISOString(),
  mode = args[3],
  hash = (v) => createHash('sha256').update(v).digest('hex');
const selected = games.filter(
  (g) =>
    g.season === 2026 &&
    g.seasonType === 'REG' &&
    g.kickoffAt &&
    (mode === 'history'
      ? g.week <= 5 && Number.isInteger(g.homeScore) && Number.isInteger(g.awayScore)
      : Date.parse(g.kickoffAt) > Date.parse(capturedAt) + 3600000 &&
        Date.parse(g.kickoffAt) < Date.parse(capturedAt) + 7 * 86400000),
);
if (selected.length > 100 || !selected.length)
  throw new Error('Empty or oversized game selection.');
await mkdir(args[5], { recursive: false });
await mkdir(`${args[5]}/raw`);
const responses = [],
  tapes = [],
  coverage = [],
  liveGames = [],
  sportsbook = new PublicSportsbookLines();
const adapter = new PublicPredictionMarketData(fetch, Date.now, async (e, text) => {
  await writeFile(`${args[5]}/raw/${e.sha256}.json`, text, { flag: 'wx' }).catch(async (error) => {
    if (error.code !== 'EEXIST') throw error;
  });
  responses.push(e);
});
let news;
if (mode === 'pregame') {
  try {
    const feed = await fetchFootballNewsWithStatus(undefined, 100);
    news = {
      capturedAt: new Date().toISOString(),
      items: feed.items,
      ...(feed.error ? { warning: feed.error } : {}),
    };
  } catch {
    news = {
      capturedAt: new Date().toISOString(),
      items: [],
      warning: 'No public news source available.',
    };
  }
}
// Two independent games at a time, with sequential bounded pages per provider.
let next = 0;
await Promise.all(
  [0, 1].map(async () => {
    while (next < selected.length) {
      const original = selected[next++],
        initialCutoff =
          mode === 'history'
            ? new Date(Date.parse(original.kickoffAt) - 30 * 60000).toISOString()
            : new Date().toISOString();
      let game = original;
      let cutoff = initialCutoff;
      if (mode === 'pregame') {
        const book = await sportsbook.get(original),
          q = book.quotes.find((q) => q.kind === 'total' && q.side === 'over');
        if (!q) {
          coverage.push({ gameId: game.id, status: 'no verified live sportsbook pair' });
          continue;
        }
        game = {
          ...original,
          totalLine: q.line,
          archivedOdds: {
            ...original.archivedOdds,
            overOdds: q.americanOdds,
            underOdds: q.oppositeAmericanOdds,
          },
        };
        cutoff = book.observedAt;
        liveGames.push({ game, book, cutoffAt: cutoff });
      }
      for (const provider of ['kalshi', 'polymarket']) {
        try {
          const t = await adapter.getTotal(game, provider, cutoff);
          if (t) tapes.push(t);
          coverage.push({
            gameId: game.id,
            provider,
            cutoffAt: cutoff,
            line: game.totalLine,
            status: t ? 'captured' : 'no exact pre-cutoff contract',
            prices: t?.prices.length ?? 0,
            trades: t?.trades.length ?? 0,
            complete: t?.complete ?? false,
          });
        } catch {
          coverage.push({
            gameId: game.id,
            provider,
            cutoffAt: cutoff,
            line: game.totalLine,
            status: 'bounded source read or validation failed',
          });
        }
      }
      console.error('captured', game.id);
    }
  }),
);
tapes.sort((a, b) => a.gameId.localeCompare(b.gameId) || a.provider.localeCompare(b.provider));
const snapshot = {
  version: 1,
  capturedAt,
  mode,
  contextSha256: hash(await readFile(args[1])),
  tapes,
  media: news ? [news] : [],
  liveGames,
  coverage,
  responses,
  warnings: [
    'Historical current news/positions/leaderboards never backfilled. Price resolution points excluded. NFL totals only, exact line and game identity.',
    'Historical sportsbook capture time is unavailable; replay is retrospective, not proof of an executable edge. No wallet skill assumed from trade size.',
  ],
};
await writeFile(`${args[5]}/signals.json`, JSON.stringify(snapshot), { flag: 'wx' });
console.log(
  JSON.stringify(
    {
      capturedAt,
      mode,
      games: selected.length,
      tapes: tapes.length,
      complete: tapes.filter((t) => t.complete).length,
      coverage,
      requests: responses.length,
      snapshotSha256: hash(JSON.stringify(snapshot)),
    },
    null,
    2,
  ),
);
