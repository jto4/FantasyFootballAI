import { parseFootballGames } from '../packages/integrations/dist/index.js';
import { prepareGameRatingModel, earlierGame } from '../packages/core/dist/game-rating-model.js';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
// Development is deliberately limited to older outcomes. No betting-profit objective or HTTP tuning inputs.
if (process.argv.length !== 4 || process.argv[2] !== '--snapshot')
  throw new Error('Usage: node scripts/develop-market-model.mjs --snapshot <schedules.csv>');
if ((await stat(process.argv[3])).size > 25 * 1024 * 1024)
  throw new Error('Snapshot exceeds 25 MiB.');
const csv = await readFile(process.argv[3], 'utf8');
const games = parseFootballGames(csv).filter((g) => g.season <= 2021);
const model = prepareGameRatingModel(games),
  kinds = ['moneyline', 'spread', 'total'];
const logit = (p) => Math.log(p / (1 - p)),
  sigmoid = (x) => 1 / (1 + Math.exp(-x)),
  clip = (v, n = 4) => Math.max(-n, Math.min(n, v));
const specs = [
  { name: 'v2', mode: 0, ridge: 200, half: 0 },
  ...[1, 2].flatMap((mode) =>
    [200, 1000].flatMap((ridge) =>
      [0, 730].map((half) => ({ name: `context${mode}-${ridge}-${half}`, mode, ridge, half })),
    ),
  ),
];
function features(r, kind, mode) {
  const q = r.markets[kind],
    g = r.game,
    b = logit(q.baseline),
    x = [1, b, clip(logit(q.raw) - b)];
  if (mode) {
    const e = q.context;
    x.push(
      e.restDifference,
      e.restTotal,
      (g.week - 9) / 9,
      kind === 'total'
        ? clip(((g.totalLine ?? 45) - 45) / 10)
        : kind === 'spread'
          ? clip((g.spreadLine ?? 0) / 10)
          : clip((b * Math.abs(b)) / 4),
    );
    if (mode === 2) x.push(kind === 'total' ? e.teamTotal : e.teamMargin);
  }
  return x;
}
function fit(rows, kind, spec, origin) {
  const n = features(rows[0], kind, spec.mode).length,
    c = Array(n).fill(0);
  const prepared = rows.map((r) => ({
    q: r.markets[kind],
    x: features(r, kind, spec.mode),
    w: spec.half
      ? 2 ** (-(Date.parse(origin.date) - Date.parse(r.game.date)) / 86400000 / spec.half)
      : 1,
  }));
  for (let step = 0; step < 12; step++) {
    const grad = c.map((v) => -spec.ridge * v),
      H = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => (i === j ? spec.ridge : 0)),
      );
    for (const r of prepared) {
      const b = logit(r.q.baseline),
        p = sigmoid(b + c.reduce((s, v, i) => s + v * r.x[i], 0));
      for (let i = 0; i < n; i++) {
        grad[i] += r.w * r.x[i] * (r.q.y - p);
        for (let j = 0; j < n; j++) H[i][j] += r.w * r.x[i] * r.x[j] * p * (1 - p);
      }
    }
    const A = H.map((r, i) => [...r, grad[i]]);
    for (let i = 0; i < n; i++) {
      const d = A[i][i];
      for (let k = i; k <= n; k++) A[i][k] /= d;
      for (let j = 0; j < n; j++)
        if (j !== i) {
          const v = A[j][i];
          for (let k = i; k <= n; k++) A[j][k] -= v * A[i][k];
        }
    }
    const delta = A.map((r) => r[n]);
    for (let i = 0; i < n; i++) c[i] += delta[i];
    if (Math.max(...delta.map(Math.abs)) < 1e-5) break;
  }
  return c;
}
function predictions(kind, spec, to) {
  const out = [],
    fits = new Map();
  for (const r of model.observations) {
    const q = r.markets[kind],
      g = r.game;
    if (!q || q.push || g.season < 2010 || g.season > to) continue;
    const key = `${g.season}:${g.week}`;
    let c = fits.get(key);
    if (!c) {
      const rows = model.observations.filter(
        (p) =>
          earlierGame(p.game, g) &&
          p.game.season >= g.season - 4 &&
          p.markets[kind] &&
          !p.markets[kind].push,
      );
      if (rows.length < 100) continue;
      c = fit(rows, kind, spec, g);
      fits.set(key, c);
    }
    const x = features(r, kind, spec.mode),
      p = sigmoid(logit(q.baseline) + c.reduce((s, v, i) => s + v * x[i], 0));
    out.push({ season: g.season, week: g.week, date: g.date, p, b: q.baseline, y: q.y, id: g.id });
  }
  return out;
}
function summary(rows, from, to) {
  const cases = rows.filter((r) => r.season >= from && r.season <= to);
  return {
    n: cases.length,
    brier: cases.reduce((s, r) => s + (r.p - r.y) ** 2, 0) / cases.length,
    baseline: cases.reduce((s, r) => s + (r.b - r.y) ** 2, 0) / cases.length,
  };
}
function adaptive(rows) {
  return rows.map((r) => {
    const prior = rows.filter(
      (q) =>
        (q.season < r.season || (q.season === r.season && q.week < r.week)) &&
        q.season >= r.season - 4,
    );
    let numerator = 0,
      denominator = 1;
    for (const q of prior) {
      const d = q.p - q.b;
      numerator += d * (q.y - q.b);
      denominator += d * d;
    }
    const weight = Math.max(0, Math.min(1, numerator / denominator));
    return { ...r, p: r.b + weight * (r.p - r.b), weight };
  });
}
{
  const results = [];
  for (const spec of specs) {
    const markets = {};
    for (const kind of kinds) {
      const rows = predictions(kind, spec, 2021);
      markets[kind] = {
        direct: summary(rows, 2016, 2021),
        adaptive: summary(adaptive(rows), 2016, 2021),
      };
    }
    results.push({ spec, markets });
    console.error(spec.name);
  }
  const selection = {};
  for (const kind of kinds) {
    const candidates = results.flatMap((r) =>
      ['direct', 'adaptive'].map((rule) => ({ spec: r.spec, rule, score: r.markets[kind][rule] })),
    );
    selection[kind] = candidates.reduce((a, b) => (a.score.brier < b.score.brier ? a : b));
  }
  console.log(
    JSON.stringify(
      {
        sourceSha256: createHash('sha256').update(csv).digest('hex'),
        scoredAt: new Date().toISOString(),
        developmentSeasons: [2016, 2021],
        candidateStructures: 9,
        candidateRules: 18,
        results,
        selection,
      },
      null,
      2,
    ),
  );
}
