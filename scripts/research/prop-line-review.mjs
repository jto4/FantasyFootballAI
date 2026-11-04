// Weekly prop review against real closing lines: rebuilds what the model would have said from data
// before each game, so a week counts even if nobody opened the Props page. Needs the built
// packages and the app's saved lines (GET /api/props/lines, saved to a file).
// Each stat's weight is chosen on the first week and scored on the last. The model's chance comes
// from defaultMarketWeight, so run it on stats still priced, or read the mean and line columns.
// Usage: node scripts/research/prop-line-review.mjs <lines.json> <firstWeek> <lastWeek> [out.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { PublicFootballData, PublicUsageData } from '../../packages/integrations/dist/index.js';
import {
  anchoredOverChance,
  buildPropBoard,
  gradePropLean,
  preferredBookLines,
  propModelSettings,
} from '../../packages/core/dist/index.js';
import { propModelFor } from '../../apps/api/dist/prop-model-runtime.js';

const [linesFile, firstWeek, lastWeek, outFile] = process.argv.slice(2);
const season = 2026;
const data = await new PublicFootballData().get(season);
const usage = await new PublicUsageData().get(season).catch(() => undefined);
const saved = JSON.parse(readFileSync(linesFile, 'utf8')).items;
const rows = [];
for (let week = Number(firstWeek); week <= Number(lastWeek); week++) {
  // Nothing from this week or later reaches the model.
  const before = {
    ...data,
    players: data.players.filter((r) => r.season < season || r.week < week),
    games: data.games.map((g) =>
      g.season === season && g.week >= week
        ? { ...g, homeScore: undefined, awayScore: undefined }
        : g,
    ),
  };
  const model = propModelFor(before, usage);
  const games = data.games.filter(
    (g) => g.season === season && g.week === week && g.seasonType === 'REG',
  );
  const ids = new Set(games.map((g) => g.id));
  const lines = preferredBookLines(
    saved
      .filter((i) => ids.has(i.gameId))
      .map((i) => ({
        id: i.key,
        gameId: i.gameId,
        playerName: i.playerName,
        ...(i.team ? { team: i.team } : {}),
        stat: i.stat,
        line: i.closing.line,
        ...(i.closing.overOdds !== undefined ? { overOdds: i.closing.overOdds } : {}),
        ...(i.closing.underOdds !== undefined ? { underOdds: i.closing.underOdds } : {}),
        sportsbook: i.sportsbook,
        source: i.source,
        observedAt: i.closing.at,
      })),
    undefined,
  );
  const board = buildPropBoard({
    lines,
    games,
    stats: before.players,
    week,
    minEdge: 0,
    predict: (line, game, team) =>
      model.predict({
        stat: line.stat,
        playerName: line.playerName,
        team,
        game,
        line: line.line,
      }),
  });
  for (const r of board) {
    if (!r.model) continue;
    const graded = gradePropLean(
      {
        gameId: r.gameId,
        playerName: r.playerName,
        ...(r.team ? { team: r.team } : {}),
        stat: r.stat,
        line: r.line,
        side: 'over',
      },
      data.players,
      '',
    );
    if (graded)
      rows.push({
        week,
        stat: r.stat,
        line: r.line,
        mean: r.model.mean,
        lean: r.lean?.side,
        actual: graded.actual,
      });
  }
}
const round = (x, d = 3) => Math.round(x * 10 ** d) / 10 ** d;
const logLoss = (list, stat, weight) =>
  list.reduce((sum, c) => {
    const p = anchoredOverChance(c.line, c.mean, propModelSettings[stat].outcome, weight);
    const q = Math.min(0.99, Math.max(0.01, p));
    return sum - Math.log(c.actual > c.line ? q : 1 - q);
  }, 0) / list.length;
const weights = Array.from({ length: 21 }, (_, i) => round(i * 0.05, 2));
const report = {};
for (const stat of [...new Set(rows.map((r) => r.stat))].sort()) {
  const list = rows.filter((r) => r.stat === stat);
  const decided = list.filter((r) => r.actual !== r.line);
  const leans = decided.filter((r) => r.lean);
  const wins = leans.filter((r) => r.actual > r.line === (r.lean === 'over')).length;
  const first = decided.filter((r) => r.week === Number(firstWeek));
  const last = decided.filter((r) => r.week === Number(lastWeek));
  const best = (set) =>
    set.length
      ? weights.reduce((a, b) => (logLoss(set, stat, b) < logLoss(set, stat, a) ? b : a))
      : undefined;
  report[stat] = {
    props: list.length,
    mae: {
      model: round(list.reduce((s, r) => s + Math.abs(r.mean - r.actual), 0) / list.length, 2),
      line: round(list.reduce((s, r) => s + Math.abs(r.line - r.actual), 0) / list.length, 2),
    },
    leans: `${wins}-${leans.length - wins}`,
    bestWeight: { [`week${firstWeek}`]: best(first), [`week${lastWeek}`]: best(last) },
  };
}
console.log(JSON.stringify(report, null, 2));
if (outFile) writeFileSync(outFile, JSON.stringify({ firstWeek, lastWeek, report }, null, 2));
