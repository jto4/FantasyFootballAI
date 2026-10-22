// Opt-in research only: no settings, credentials, AI generation or bets.
// Replays walk-forward game forecasts against archived prices and reports what flat one-unit
// paper bets would have returned at several edge thresholds, plus calibration by bin.
import {
  PublicFootballData,
  PublicPregameEvidence,
} from '../../packages/integrations/dist/index.js';
import { prepareGameRatingModel } from '../../packages/core/dist/game-rating-model.js';
import { americanOdds } from '../../packages/core/dist/advice-math.js';

const now = new Date(),
  season = now.getUTCMonth() < 2 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
let data = await new PublicFootballData().get(season);
data = await new PublicPregameEvidence().history(data, now.toISOString());
const model = prepareGameRatingModel(data.games);
const prices = {
  moneyline: (o) => [o.homeMoneyline, o.awayMoneyline],
  spread: (o) => [o.homeSpreadOdds, o.awaySpreadOdds],
  total: (o) => [o.overOdds, o.underOdds],
};

const cases = [];
for (const r of model.observations) {
  if (r.game.season < season - 4 || r.game.season > season) continue;
  for (const kind of ['moneyline', 'spread', 'total']) {
    const q = r.markets[kind];
    const pair = r.game.archivedOdds && prices[kind](r.game.archivedOdds);
    if (!q || q.push || !pair || pair.some((n) => !Number.isInteger(n))) continue;
    const p =
      kind === 'total'
        ? model.adjustJointAvailability(kind, r.game, q.raw, q.baseline, 200)
        : model.adjust(kind, r.game, q.raw, q.baseline);
    cases.push({ season: r.game.season, week: r.game.week, kind, y: q.y, p, b: q.baseline, pair });
  }
}

/** Bet the side whose modeled chance beats its own break-even rate by more than `edge`. */
function simulate(rows, edge, probability = (r) => r.p) {
  let bets = 0,
    net = 0,
    wins = 0;
  for (const r of rows) {
    const p = probability(r);
    const sides = [
      { chance: p, odds: r.pair[0], won: r.y === 1 },
      { chance: 1 - p, odds: r.pair[1], won: r.y === 0 },
    ];
    const best = sides
      .map((s) => ({ ...s, value: s.chance - americanOdds(s.odds).breakEvenRate }))
      .sort((a, b) => b.value - a.value)[0];
    if (best.value <= edge) continue;
    bets++;
    if (best.won) {
      wins++;
      net += americanOdds(best.odds).profitPerUnit;
    } else net -= 1;
  }
  return { bets, wins, net: +net.toFixed(2), roi: bets ? +(net / bets).toFixed(4) : null };
}

function calibration(rows, field) {
  return Array.from({ length: 5 }, (_, i) => {
    const bin = rows.filter((r) => Math.min(4, Math.floor(r[field] * 5)) === i);
    const mean = (f) => bin.reduce((s, r) => s + f(r), 0) / bin.length;
    return bin.length
      ? {
          range: `${i * 20}-${(i + 1) * 20}%`,
          n: bin.length,
          predicted: +mean((r) => r[field]).toFixed(3),
          observed: +mean((r) => r.y).toFixed(3),
        }
      : undefined;
  }).filter(Boolean);
}

const report = (rows) => ({
  outcomes: rows.length,
  thresholds: Object.fromEntries(
    [0, 0.01, 0.02, 0.03, 0.05].map((t) => [`edge>${t}`, simulate(rows, t)]),
  ),
  // Betting the book's own no-vig probability never clears break-even; shows the margin's cost.
  bookOnly: simulate(rows, 0, (r) => r.b),
  byMarket: Object.fromEntries(
    ['moneyline', 'spread', 'total'].map((k) => [
      k,
      simulate(
        rows.filter((r) => r.kind === k),
        0.02,
      ),
    ]),
  ),
  calibration: { model: calibration(rows, 'p'), book: calibration(rows, 'b') },
});
console.log(
  JSON.stringify(
    {
      retrospective: report(cases.filter((r) => r.season < season)),
      holdout: { season, ...report(cases.filter((r) => r.season === season)) },
      warnings: [
        'Archived closing-style prices; real fills, limits and line movement are not modeled.',
        'Pushes are excluded. Flat one-unit stakes. Not a profitability claim.',
      ],
    },
    null,
    2,
  ),
);
