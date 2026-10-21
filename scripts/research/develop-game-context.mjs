import { prepareGameRatingModel } from '../../packages/core/dist/game-rating-model.js';
import { readGameContextSnapshot } from './game-context-snapshot.mjs';

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--contexts') {
  throw new Error('Usage: node scripts/develop-game-context.mjs --contexts <public-games.json>');
}
// Discard later outcomes before preparation, including their context and prices.
const games = (await readGameContextSnapshot(args[1])).filter((g) => g.season <= 2021);
const model = prepareGameRatingModel(games);
const results = [];
for (const procedure of ['joint', 'offset']) {
  for (const penalty of [200, 1000]) {
    const markets = [];
    for (const kind of ['moneyline', 'spread', 'total']) {
      let n = 0;
      let sum = 0;
      let previous = 0;
      let book = 0;
      for (const r of model.observations) {
        const q = r.markets[kind];
        if (!q || q.push || r.game.season < 2018 || r.game.season > 2021) continue;
        const adjust =
          procedure === 'joint' ? model.adjustJointAvailability : model.adjustWithAvailability;
        const p = adjust(kind, r.game, q.raw, q.baseline, penalty);
        const v3 = model.adjust(kind, r.game, q.raw, q.baseline);
        sum += (p - q.y) ** 2;
        previous += (v3 - q.y) ** 2;
        book += (q.baseline - q.y) ** 2;
        n++;
      }
      if (!n) throw new Error('No matched 2018–2021 development observations.');
      markets.push({ kind, n, brier: sum / n, v3Brier: previous / n, bookBrier: book / n });
    }
    results.push({ procedure, penalty, markets });
  }
}
const selection = {};
for (const kind of ['moneyline', 'spread', 'total']) {
  const candidates = results.map((r) => ({
    procedure: r.procedure,
    penalty: r.penalty,
    ...r.markets.find((m) => m.kind === kind),
  }));
  candidates.push({
    ...candidates[0],
    procedure: 'v3',
    penalty: 200,
    brier: candidates[0].v3Brier,
  });
  selection[kind] = candidates.reduce((a, b) => (a.brier < b.brier ? a : b));
}
console.log(JSON.stringify({ results, selection }, null, 2));
