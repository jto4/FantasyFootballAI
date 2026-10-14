import { readGameContextSnapshot } from './game-context-snapshot.mjs';

import { prepareGameRatingModel } from '../packages/core/dist/game-rating-model.js';
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--contexts')
  throw new Error('Usage: node scripts/develop-personnel-model.mjs --contexts <public-games.json>');
const games = (await readGameContextSnapshot(args[1])).filter((g) => g.season <= 2021),
  model = prepareGameRatingModel(games, { includeExperimentalOfficialReports: true }),
  candidates = [];
for (const family of ['all', 'quarterback', 'injuries'])
  for (const penalty of [200, 1000]) {
    const markets = [];
    for (const kind of ['moneyline', 'spread', 'total']) {
      let n = 0,
        sum = 0,
        base = 0,
        book = 0;
      for (const r of model.observations) {
        const q = r.markets[kind];
        if (!q || q.push || r.game.season < 2018 || r.game.season > 2021) continue;
        const p = model.adjustPersonnel(kind, r.game, q.raw, q.baseline, penalty, family),
          v4 =
            kind === 'total'
              ? model.adjustJointAvailability(kind, r.game, q.raw, q.baseline, 200)
              : model.adjust(kind, r.game, q.raw, q.baseline);
        sum += (p - q.y) ** 2;
        base += (v4 - q.y) ** 2;
        book += (q.baseline - q.y) ** 2;
        n++;
      }
      markets.push({ kind, n, brier: sum / n, previousBrier: base / n, bookBrier: book / n });
      console.error('finished', family, penalty, kind);
    }
    candidates.push({ family, penalty, markets });
  }
const selection = {};
for (const kind of ['moneyline', 'spread', 'total']) {
  const options = candidates.map((r) => ({
    procedure: 'personnel',
    family: r.family,
    penalty: r.penalty,
    ...r.markets.find((m) => m.kind === kind),
  }));
  options.push({ ...options[0], procedure: 'previous', brier: options[0].previousBrier });
  selection[kind] = options.reduce((a, b) => (a.brier < b.brier ? a : b));
}
console.log(JSON.stringify({ developmentSeasons: [2018, 2021], candidates, selection }, null, 2));
