import { readFile } from 'node:fs/promises';
import { readGameContextSnapshot } from './game-context-snapshot.mjs';
import { prepareGameRatingModel } from '../packages/core/dist/game-rating-model.js';
const args = process.argv.slice(2);
if (args.length !== 4 || args[0] !== '--contexts' || args[2] !== '--reference')
  throw new Error(
    'Usage: node scripts/audit-personnel-model.mjs --contexts <new-games.json> --reference <previous-games.json>',
  );
const frozen = JSON.parse(
    await readFile(
      new URL('../docs/research/model-v5-personnel-frozen.json', import.meta.url),
      'utf8',
    ),
  ),
  games = await readGameContextSnapshot(args[1]),
  old = await readGameContextSnapshot(args[3]),
  model = prepareGameRatingModel(games, { includeExperimentalOfficialReports: true }),
  retainedModel = prepareGameRatingModel(games),
  previous = prepareGameRatingModel(old),
  oldRows = new Map(previous.observations.map((r) => [r.game.id, r])),
  rows = [];
for (const r of model.observations) {
  if (r.game.season < 2022 || r.game.season > 2025) continue;
  for (const kind of ['moneyline', 'spread', 'total']) {
    const q = r.markets[kind],
      s = frozen.selection[kind],
      o = oldRows.get(r.game.id)?.markets[kind];
    if (!q || q.push || !o || o.push) continue;
    const enhancedBase =
        kind === 'total'
          ? model.adjustJointAvailability(kind, r.game, q.raw, q.baseline, 200)
          : model.adjust(kind, r.game, q.raw, q.baseline),
      prior =
        kind === 'total'
          ? previous.adjustJointAvailability(
              kind,
              oldRows.get(r.game.id).game,
              o.raw,
              o.baseline,
              200,
            )
          : previous.adjust(kind, oldRows.get(r.game.id).game, o.raw, o.baseline),
      p =
        s.procedure === 'personnel'
          ? model.adjustPersonnel(kind, r.game, q.raw, q.baseline, s.penalty, s.family)
          : enhancedBase;
    const retained =
      kind === 'total'
        ? retainedModel.adjustJointAvailability(kind, r.game, q.raw, q.baseline, 200)
        : retainedModel.adjust(kind, r.game, q.raw, q.baseline);
    rows.push({
      retained,
      id: r.game.id,
      season: r.game.season,
      week: r.game.week,
      kind,
      y: q.y,
      p,
      previous: prior,
      dataOnly: enhancedBase,
      book: q.baseline,
      supported: model.supportedPersonnel(kind, r.game, s.family ?? 'all'),
      official: [r.game.pregame?.home.reportSource, r.game.pregame?.away.reportSource].includes(
        'nfl-official',
      ),
    });
  }
}
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
function summary(a) {
  const diff = mean(a.map((r) => (r.book - r.y) ** 2 - (r.p - r.y) ** 2)),
    weeks = new Map();
  for (const r of a) {
    const k = `${r.season}:${r.week}`;
    weeks.set(k, [...(weeks.get(k) ?? []), (r.book - r.y) ** 2 - (r.p - r.y) ** 2]);
  }
  const se =
    Math.sqrt(
      (weeks.size / (weeks.size - 1)) *
        [...weeks.values()].reduce(
          (s, x) => s + (x.reduce((s, v) => s + v, 0) - diff * x.length) ** 2,
          0,
        ),
    ) / a.length;
  return {
    n: a.length,
    brier: mean(a.map((r) => (r.p - r.y) ** 2)),
    retainedBrier: mean(a.map((r) => (r.retained - r.y) ** 2)),
    previousBrier: mean(a.map((r) => (r.previous - r.y) ** 2)),
    dataOnlyBrier: mean(a.map((r) => (r.dataOnly - r.y) ** 2)),
    bookBrier: mean(a.map((r) => (r.book - r.y) ** 2)),
    bookImprovementInterval: [diff - 1.96 * se, diff + 1.96 * se],
    simultaneousBookInterval: [diff - 2.8653 * se, diff + 2.8653 * se],
    supported: a.filter((r) => r.supported).length,
    official: a.filter((r) => r.official).length,
  };
}
const markets = [];
for (const season of [2022, 2023, 2024, 2025])
  for (const kind of ['moneyline', 'spread', 'total']) {
    markets.push({
      season,
      kind,
      ...summary(rows.filter((r) => r.season === season && r.kind === kind)),
    });
    console.error('scored', season, kind);
  }
const report = {
  scoredAt: new Date().toISOString(),
  frozenAt: frozen.frozenAt,
  pooled: summary(rows),
  markets,
  consistency: {
    beatsBook: markets.filter((m) => m.brier < m.bookBrier).length,
    beatsPrevious: markets.filter((m) => m.brier < m.previousBrier).length,
    simultaneousPositive: markets.filter((m) => m.simultaneousBookInterval[0] > 0).length,
  },
};
console.log(JSON.stringify(report, null, 2));
