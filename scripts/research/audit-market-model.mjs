import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  PublicFootballData,
  PublicPregameEvidence,
  parseFootballGames,
} from '../packages/integrations/dist/index.js';
import { readGameContextSnapshot } from './game-context-snapshot.mjs';
import { prepareGameRatingModel } from '../packages/core/dist/game-rating-model.js';
const args = process.argv.slice(2);
if (args.length && !(args.length === 2 && ['--snapshot', '--contexts'].includes(args[0])))
  throw new Error(
    'Supported options: --snapshot <schedules.csv> or --contexts <game-context.json>',
  );
let source, games;
const now = new Date(),
  season = now.getUTCMonth() < 2 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
if (args[0] === '--contexts') {
  games = await readGameContextSnapshot(args[1]);
  source = {
    contextSnapshotSha256: createHash('sha256')
      .update(await readFile(args[1]))
      .digest('hex'),
    publicationTimingVerified: false,
  };
} else if (args.length) {
  if ((await stat(args[1])).size > 25 * 1024 * 1024) throw new Error('Snapshot exceeds 25 MiB.');
  const csv = await readFile(args[1], 'utf8');
  games = parseFootballGames(csv);
  source = {
    snapshotSha256: createHash('sha256').update(csv).digest('hex'),
    publicationTimingVerified: false,
  };
} else {
  let data = await new PublicFootballData().get(season);
  data = await new PublicPregameEvidence().history(data, new Date().toISOString());
  games = data.games;
  const s = data.sources.find((s) => s.id === 'games');
  source = {
    url: s?.url,
    retrievedAt: s?.retrievedAt,
    normalizedGamesSha256: createHash('sha256').update(JSON.stringify(games)).digest('hex'),
    publicationTimingVerified: false,
  };
}
const model = prepareGameRatingModel(games),
  cases = [];
for (const r of model.observations) {
  if (r.game.season < season - 4 || r.game.season >= season) continue;
  for (const kind of ['moneyline', 'spread', 'total']) {
    const q = r.markets[kind];
    if (!q || q.push) continue;
    const v3 = model.adjust(kind, r.game, q.raw, q.baseline);
    const p =
        kind === 'total' ? model.adjustJointAvailability(kind, r.game, q.raw, q.baseline, 200) : v3,
      v2 = model.adjustV2(kind, r.game, q.raw, q.baseline);
    cases.push({
      season: r.game.season,
      week: r.game.week,
      kind,
      y: q.y,
      p,
      v2,
      v3,
      b: q.baseline,
    });
  }
}
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
function interval(rows, field, z) {
  if (!rows.length) return;
  const differences = rows.map((r) => (r[field] - r.y) ** 2 - (r.p - r.y) ** 2),
    difference = mean(differences),
    weeks = new Map();
  rows.forEach((r, i) => {
    const key = `${r.season}:${r.week}`;
    weeks.set(key, [...(weeks.get(key) ?? []), differences[i]]);
  });
  if (weeks.size < 2) return;
  const se =
    Math.sqrt(
      (weeks.size / (weeks.size - 1)) *
        [...weeks.values()].reduce(
          (s, w) => s + (w.reduce((a, b) => a + b, 0) - difference * w.length) ** 2,
          0,
        ),
    ) / rows.length;
  return [difference - z * se, difference + z * se];
}
function summarize(rows, simultaneous = false) {
  if (!rows.length) return { games: 0 };
  return {
    games: rows.length,
    brier: mean(rows.map((r) => (r.p - r.y) ** 2)),
    v3Brier: mean(rows.map((r) => (r.v3 - r.y) ** 2)),
    v2Brier: mean(rows.map((r) => (r.v2 - r.y) ** 2)),
    bookBrier: mean(rows.map((r) => (r.b - r.y) ** 2)),
    bookImprovementInterval: interval(rows, 'b', 1.96),
    v2ImprovementInterval: interval(rows, 'v2', 1.96),
    ...(simultaneous ? { simultaneousBookInterval: interval(rows, 'b', 2.8653) } : {}),
  };
}
const markets = [];
for (let year = season - 4; year < season; year++)
  for (const kind of ['moneyline', 'spread', 'total'])
    markets.push({
      season: year,
      kind,
      ...summarize(
        cases.filter((r) => r.season === year && r.kind === kind),
        true,
      ),
    });
console.log(
  JSON.stringify(
    {
      method: games.some((g) => g.pregame) ? 'health-weather-total-v4' : 'market-context-v3',
      source,
      scoredAt: new Date().toISOString(),
      pooled: summarize(cases),
      markets,
      consistency: {
        comparisons: markets.length,
        beatsBook: markets.filter((m) => m.brier < m.bookBrier).length,
        beatsV3: markets.filter((m) => m.brier < m.v3Brier).length,
        beatsV2: markets.filter((m) => m.brier < m.v2Brier).length,
        simultaneousPositive: markets.filter((m) => m.simultaneousBookInterval?.[0] > 0).length,
      },
      warnings: [
        'Reused retrospective archive; not an untouched or prospective holdout. Odds are an explicit model input.',
        'Lower Brier measures probability accuracy, not betting profitability. Mixed season/market results cannot establish consistent superiority.',
        'Intervals cluster all outcomes by NFL season/week. Individual 95% intervals are nominal; simultaneous intervals use a fixed Bonferroni normal approximation for twelve season/market comparisons.',
      ],
    },
    null,
    2,
  ),
);
