// Fits and backtests the dynasty model on nflverse history and (with --emit) writes
// packages/core/src/dynasty-settings.ts.
//   - Age curves: next-season points per game from this season's, by position and age, plus the
//     expected games next season by age (retirements and injuries count as zero).
//   - Rookies: first-three-season points from NFL draft slot, by position.
//   - Rookie-draft picks: the value of the n-th rookie taken, from classes ranked by draft capital.
// Fit on early seasons, tested on later ones against simple baselines.
// Usage: node scripts/research/dynasty-backtest.mjs <dir with stats{year}.csv and players.csv> [out.json] [--emit]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [dir, outFile] = process.argv.slice(2);
const POS = ['QB', 'RB', 'WR', 'TE'];
// Half-PPR weights: dynasty curves describe relative change, so the scoring system matters little.
const W = {
  passing_yards: 0.04,
  passing_tds: 4,
  passing_interceptions: -2,
  rushing_yards: 0.1,
  rushing_tds: 6,
  receptions: 0.5,
  receiving_yards: 0.1,
  receiving_tds: 6,
  rushing_fumbles_lost: -2,
  receiving_fumbles_lost: -2,
  sack_fumbles_lost: -2,
};

function parseCsv(text) {
  const rows = [];
  let row = [],
    field = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

const bios = new Map(
  parseCsv(readFileSync(join(dir, 'players.csv'), 'utf8')).map((r) => [r.gsis_id, r]),
);
const seasons = new Map(); // `${id}:${season}` -> { pts, g, pos, age, draftPick, rookieSeason }
let lastSeason = 0;
for (let y = 2010; y <= 2030; y++) {
  let text;
  try {
    text = readFileSync(join(dir, `stats${y}.csv`), 'utf8');
  } catch {
    continue;
  }
  lastSeason = y;
  for (const r of parseCsv(text)) {
    if (r.season_type !== 'REG' || !POS.includes(r.position)) continue;
    const key = `${r.player_id}:${y}`;
    const s = seasons.get(key) ?? { id: r.player_id, season: y, pts: 0, g: 0, pos: r.position };
    s.pts += Object.entries(W).reduce((sum, [k, w]) => sum + (Number(r[k]) || 0) * w, 0);
    s.g++;
    seasons.set(key, s);
  }
}
for (const s of seasons.values()) {
  const bio = bios.get(s.id);
  const birth = bio?.birth_date ? Date.parse(bio.birth_date) : NaN;
  s.age = Number.isFinite(birth)
    ? (Date.UTC(s.season, 8, 1) - birth) / (365.25 * 86_400_000)
    : undefined;
  s.draftPick = Number(bio?.draft_pick) || undefined;
  s.rookieSeason = Number(bio?.rookie_season) || undefined;
}
const get = (id, season) => seasons.get(`${id}:${season}`);
const ppg = (s) => s.pts / s.g;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const r2 = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
const quantiles = (xs) => {
  const sorted = [...xs].sort((a, b) => a - b);
  return Array.from({ length: 10 }, (_, i) =>
    r2(sorted[Math.floor(((i + 0.5) / 10) * sorted.length)], 3),
  );
};
/** Expected points above r when outcomes are (μ + 10)·m − 10 for the stored multipliers m. */
const aboveExpected = (mu, outcomes, r) => {
  const m =
    Array.isArray(outcomes) && typeof outcomes[0] === 'number'
      ? outcomes
      : outcomes.find((band) => band.upTo === null || mu <= band.upTo).multipliers;
  return mean(m.map((x) => Math.max(0, (mu + 10) * x - 10 - r)));
};

/** Ridge least squares by normal equations (Gaussian elimination); penalty per column. */
function ridge(X, Y, penalty) {
  const n = X[0].length;
  const A = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? penalty[i] : 0)),
  );
  const b = Array(n).fill(0);
  X.forEach((row, k) => {
    for (let i = 0; i < n; i++) {
      b[i] += row[i] * Y[k];
      for (let j = 0; j < n; j++) A[i][j] += row[i] * row[j];
    }
  });
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]];
    [b[i], b[p]] = [b[p], b[i]];
    for (let r = 0; r < n; r++) {
      if (r === i || !A[i][i]) continue;
      const f = A[r][i] / A[i][i];
      for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
      b[r] -= f * b[i];
    }
  }
  return b.map((v, i) => v / A[i][i]);
}

// ---- Age curves ----
// One model per position and horizon h (1–3 seasons ahead), fitted directly rather than chained:
//   log(points in season +h + 10) = a + b·log(points per game + 1) + c·games/17 + d·(age−27) + e·(age−27)²
// Seasons a player missed count as zero points, so retirements and injuries are priced in. The
// smooth age terms avoid the noise of per-age dummies at the extremes (survivor effects).
const eligible = (s) => s.g >= 4 && s.age !== undefined && ppg(s) >= 2;
const features = (s) => [1, Math.log(ppg(s) + 1), s.g / 17, s.age - 27, (s.age - 27) ** 2];
const HORIZONS = [1, 2, 3];
function fitAge(fromSeason, toSeason) {
  const params = {};
  for (const pos of POS) {
    params[pos] = {};
    for (const h of HORIZONS) {
      const base = [...seasons.values()].filter(
        (s) =>
          s.pos === pos && s.season >= fromSeason && s.season + h <= toSeason + 1 && eligible(s),
      );
      const X = base.map(features);
      const Y = base.map((s) => Math.log((get(s.id, s.season + h)?.pts ?? 0) + 10));
      const beta = ridge(X, Y, [0, 0, 0, 1, 1]);
      const resid = Y.map((y, k) => y - X[k].reduce((sum, x, i) => sum + x * beta[i], 0));
      // Mean of the log-model's spread, so predictions are expected points, not medians.
      const lift = mean(resid.map((r) => Math.exp(r)));
      // How actual points scatter around the prediction, as ten quantiles of
      // (actual + 10) / (prediction + 10). Outcomes are lopsided (a lost season is a zero), so the
      // empirical shape prices upside near replacement better than a symmetric spread.
      const preds = X.map((x) =>
        Math.max(0, Math.exp(x.reduce((sum, xi, i) => sum + xi * beta[i], 0)) * lift - 10),
      );
      // Kept per third of the predictions: low projections (backups) swing far more in ratio terms.
      const order = preds
        .map((pr, k) => [pr, Math.exp(Y[k]) / (pr + 10)])
        .sort((a, b) => a[0] - b[0]);
      const outcomes = [0, 1, 2].map((t) => {
        const band = order.slice(
          Math.floor((t * order.length) / 3),
          Math.floor(((t + 1) * order.length) / 3),
        );
        return {
          upTo: t === 2 ? null : r2(band.at(-1)[0], 1),
          multipliers: quantiles(band.map((b) => b[1])),
        };
      });
      params[pos][h] = { beta: beta.map((b) => r2(b, 5)), lift: r2(lift, 4), outcomes };
    }
  }
  return params;
}
function project(p, s) {
  return HORIZONS.map((h) => {
    const q = p[s.pos][h];
    const v = features(s).reduce((sum, x, i) => sum + x * q.beta[i], 0);
    return Math.max(0, Math.exp(v) * q.lift - 10);
  });
}
const spearman = (a, b) => {
  const rank = (xs) => {
    const order = xs.map((x, i) => [x, i]).sort((u, v) => u[0] - v[0]);
    const r = Array(xs.length);
    order.forEach(([, i], k) => (r[i] = k));
    return r;
  };
  const ra = rank(a),
    rb = rank(b),
    ma = mean(ra),
    mb = mean(rb);
  let num = 0,
    da = 0,
    db = 0;
  for (let i = 0; i < ra.length; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  return num / Math.sqrt(da * db);
};
function evaluateAge(p, from, to, k) {
  const report = {};
  for (const pos of POS) {
    const cases = [...seasons.values()].filter(
      (s) =>
        s.pos === pos &&
        s.season >= from &&
        s.season <= to &&
        eligible(s) &&
        s.season + k <= lastSeason - 1,
    );
    const errModel = [],
      errPersist = [],
      bias = [],
      groups = new Map();
    for (const s of cases) {
      const actual = Array.from(
        { length: k },
        (_, i) => get(s.id, s.season + i + 1)?.pts ?? 0,
      ).reduce((a, b) => a + b);
      const pred = project(p, s)
        .slice(0, k)
        .reduce((a, b) => a + b);
      const persist = s.pts * k;
      errModel.push(Math.abs(pred - actual));
      errPersist.push(Math.abs(persist - actual));
      bias.push(pred - actual);
      const g = groups.get(s.season) ?? [];
      g.push([pred, persist, actual]);
      groups.set(s.season, g);
    }
    const rm = [],
      rp = [];
    for (const g of groups.values())
      if (g.length >= 10) {
        rm.push(
          spearman(
            g.map((x) => x[0]),
            g.map((x) => x[2]),
          ),
        );
        rp.push(
          spearman(
            g.map((x) => x[1]),
            g.map((x) => x[2]),
          ),
        );
      }
    report[pos] = {
      players: cases.length,
      maeModel: r2(mean(errModel), 1),
      maeSameAsLastSeason: r2(mean(errPersist), 1),
      meanBias: r2(mean(bias), 1),
      rankModel: r2(mean(rm), 3),
      rankSameAsLastSeason: r2(mean(rp), 3),
    };
  }
  return report;
}
/** Next-season multiplier at an age relative to 27, everything else equal. */
const ageMultiplier = (p, pos, age) => {
  const [, , , d, e] = p[pos][1].beta;
  return r2(Math.exp(d * (age - 27) + e * (age - 27) ** 2), 3);
};

// ---- Rookies by draft slot ----
const UNDRAFTED = 300;
function rookieCases(fromClass, toClass) {
  return [...seasons.values()]
    .filter(
      (s) =>
        s.rookieSeason === s.season &&
        s.season >= fromClass &&
        s.season <= toClass &&
        s.season + 2 <= lastSeason - 1,
    )
    .map((s) => ({
      ...s,
      slot: s.draftPick ?? UNDRAFTED,
      three: [0, 1, 2].reduce((sum, i) => sum + (get(s.id, s.season + i)?.pts ?? 0), 0),
    }));
}
function fitRookies(fromClass, toClass) {
  const params = {};
  for (const pos of POS) {
    const cases = rookieCases(fromClass, toClass).filter((c) => c.pos === pos);
    // Linear in log(slot) on the points themselves, so the fit is the expected value; a log-scale
    // fit exploded at the top picks (where a few stars dominate).
    const X = cases.map((c) => [1, Math.log(c.slot)]);
    const Y = cases.map((c) => c.three);
    const [a, b] = ridge(X, Y, [0, 0]);
    params[pos] = { intercept: r2(a, 3), slope: r2(b, 3) };
  }
  return params;
}
const rookieValue = (p, pos, slot) => Math.max(0, p[pos].intercept + p[pos].slope * Math.log(slot));
function evaluateRookies(p, fromClass, toClass) {
  const report = {};
  for (const pos of POS) {
    const cases = rookieCases(fromClass, toClass).filter((c) => c.pos === pos);
    const avg = mean(cases.map((c) => c.three));
    const byClass = new Map();
    for (const c of cases) byClass.set(c.season, [...(byClass.get(c.season) ?? []), c]);
    report[pos] = {
      rookies: cases.length,
      maeModel: r2(mean(cases.map((c) => Math.abs(rookieValue(p, pos, c.slot) - c.three))), 1),
      maeClassAverage: r2(mean(cases.map((c) => Math.abs(avg - c.three))), 1),
      rmseModel: r2(
        Math.sqrt(mean(cases.map((c) => (rookieValue(p, pos, c.slot) - c.three) ** 2))),
        1,
      ),
      rmseClassAverage: r2(Math.sqrt(mean(cases.map((c) => (avg - c.three) ** 2))), 1),
      rankModel: r2(
        mean(
          [...byClass.values()]
            .filter((g) => g.length >= 8)
            .map((g) =>
              spearman(
                g.map((c) => -c.slot),
                g.map((c) => c.three),
              ),
            ),
        ),
        3,
      ),
    };
  }
  return report;
}

// ---- Rookie-draft pick slots ----
// A rookie draft takes the best-valued rookies first; slot n returns the n-th best rookie's
// actual first three seasons. Fitted as log-linear in slot.
function slotCases(p, fromClass, toClass) {
  const out = [];
  for (let y = fromClass; y <= toClass; y++) {
    const cls = rookieCases(y, y).sort(
      (a, b) => rookieValue(p, b.pos, b.slot) - rookieValue(p, a.pos, a.slot),
    );
    cls.slice(0, 48).forEach((c, i) =>
      out.push({
        season: y,
        slot: i + 1,
        three: c.three,
        perSeason: [0, 1, 2].map((k) => get(c.id, c.season + k)?.pts ?? 0),
      }),
    );
  }
  return out;
}
function fitSlots(cases) {
  const X = cases.map((c) => [1, Math.log(c.slot)]);
  const Y = cases.map((c) => c.three);
  const [a, b] = ridge(X, Y, [0, 0]);
  // Single seasons vary far more than three-season totals; measured on seasons, like players.
  const per = cases.flatMap((c) =>
    c.perSeason.map((pts) => [Math.max(0, a + b * Math.log(c.slot)) / 3, pts]),
  );
  const outcomes = quantiles(per.map(([pr, pts]) => (pts + 10) / (pr + 10)));
  return { intercept: r2(a, 3), slope: r2(b, 3), outcomes };
}
const slotValue = (q, slot) => Math.max(0, q.intercept + q.slope * Math.log(slot));

// ---- Points above replacement: does the spread price upside correctly? ----
function evaluateAbove(p, from, to, thresholds) {
  const report = {};
  for (const pos of POS) {
    const cases = [...seasons.values()].filter(
      (s) =>
        s.pos === pos &&
        s.season >= from &&
        s.season <= to &&
        eligible(s) &&
        s.season + 1 <= lastSeason - 1,
    );
    report[pos] = Object.fromEntries(
      thresholds[pos].map((r) => {
        let actual = 0,
          spread = 0,
          point = 0;
        for (const s of cases) {
          const pred = project(p, s)[0];
          actual += Math.max(0, (get(s.id, s.season + 1)?.pts ?? 0) - r);
          spread += aboveExpected(pred, p[pos][1].outcomes, r);
          point += Math.max(0, pred - r);
        }
        return [
          r,
          {
            actual: r2(actual / cases.length, 1),
            withSpread: r2(spread / cases.length, 1),
            pointOnly: r2(point / cases.length, 1),
          },
        ];
      }),
    );
  }
  return report;
}

// ---- Run: fit early, test late ----
const age = fitAge(2010, 2020);
const rookies = fitRookies(2011, 2018);
const slots = fitSlots(slotCases(rookies, 2011, 2018));
const testSlots = slotCases(rookies, 2019, lastSeason - 3);
const flat = mean(slotCases(rookies, 2011, 2018).map((c) => c.three));
const result = {
  lastSeason,
  ageCurves: {
    fittedOn: '2010–2020 seasons',
    nextSeasonTest: evaluateAge(age, 2021, lastSeason - 2, 1),
    threeSeasonTest: evaluateAge(age, 2021, lastSeason - 4, 3),
    // Average points above a replacement level, per player: actual vs the model with and without
    // its spread (thresholds near typical 12-team replacement, in half-PPR season points).
    aboveReplacementTest: evaluateAbove(age, 2021, lastSeason - 2, {
      QB: [200, 250],
      RB: [100, 150],
      WR: [100, 150],
      TE: [60, 100],
    }),
    ageMultiplierVs27: Object.fromEntries(
      POS.map((pos) => [
        pos,
        Object.fromEntries([23, 25, 27, 29, 31, 33].map((a) => [a, ageMultiplier(age, pos, a)])),
      ]),
    ),
  },
  rookies: { fittedOn: '2011–2018 classes', test: evaluateRookies(rookies, 2019, lastSeason - 3) },
  pickSlots: {
    fittedOn: '2011–2018 classes',
    test: {
      slots: testSlots.length,
      maeModel: r2(mean(testSlots.map((c) => Math.abs(slotValue(slots, c.slot) - c.three))), 1),
      maeFlatAverage: r2(mean(testSlots.map((c) => Math.abs(flat - c.three))), 1),
      rmseModel: r2(
        Math.sqrt(mean(testSlots.map((c) => (slotValue(slots, c.slot) - c.three) ** 2))),
        1,
      ),
      rmseFlatAverage: r2(Math.sqrt(mean(testSlots.map((c) => (flat - c.three) ** 2))), 1),
      rank: r2(
        spearman(
          testSlots.map((c) => -c.slot),
          testSlots.map((c) => c.three),
        ),
        3,
      ),
      // Per-season points above a WR-like replacement of 100: actual vs the slot curve.
      above100: {
        actual: r2(
          mean(testSlots.flatMap((c) => c.perSeason.map((pts) => Math.max(0, pts - 100)))),
          1,
        ),
        withOutcomes: r2(
          mean(
            testSlots.map((c) => aboveExpected(slotValue(slots, c.slot) / 3, slots.outcomes, 100)),
          ),
          1,
        ),
        pointOnly: r2(
          mean(testSlots.map((c) => Math.max(0, slotValue(slots, c.slot) / 3 - 100))),
          1,
        ),
      },
    },
    examples: Object.fromEntries([1, 3, 6, 12, 24, 36].map((s) => [s, r2(slotValue(slots, s), 0)])),
  },
};
console.log(JSON.stringify(result, null, 2));
if (outFile && !outFile.startsWith('--')) writeFileSync(outFile, JSON.stringify(result, null, 2));
if (process.argv.includes('--emit')) {
  // Production settings refit on every season available (the tests above used held-out seasons).
  const finalAge = fitAge(2010, lastSeason - 2);
  const finalRookies = fitRookies(2011, lastSeason - 3);
  const finalSlots = fitSlots(slotCases(finalRookies, 2011, lastSeason - 3));
  writeFileSync(
    'packages/core/src/dynasty-settings.ts',
    `// Generated by scripts/research/dynasty-backtest.mjs --emit; see docs/decisions.md.\n` +
      `import type { DynastySettings } from './dynasty.js';\n\n` +
      `export const dynastySettings: DynastySettings = ${JSON.stringify({ age: finalAge, rookies: finalRookies, slots: finalSlots, undraftedSlot: UNDRAFTED }, null, 2)};\n`,
  );
}
