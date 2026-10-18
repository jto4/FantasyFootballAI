import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readGameContextSnapshot } from './game-context-snapshot.mjs';
import {
  prepareGameRatingModel,
  canonicalBookProbability,
} from '../../packages/core/dist/game-rating-model.js';
import {
  prepareExternalTotalsModel,
  externalTotalParameters,
} from '../../packages/core/dist/external-total-signals.js';
import { report } from './seasonal-hybrid-evaluation.mjs';
const args = process.argv.slice(2);
if (
  args.length !== 6 ||
  args[0] !== '--contexts' ||
  args[2] !== '--signals' ||
  args[4] !== '--frozen'
)
  throw new Error(
    'Usage: --contexts <games.json> --signals <signals.json> --frozen <settings.json>',
  );
for (const p of [args[3], args[5]])
  if ((await stat(p)).size > 20000000) throw new Error('External research snapshot too large.');
const hash = (v) => createHash('sha256').update(v).digest('hex'),
  f = JSON.parse(await readFile(args[5], 'utf8'));
if (JSON.stringify(f.parameters) !== JSON.stringify(externalTotalParameters))
  throw new Error('Frozen parameters mismatch.');
for (const [path, h] of Object.entries(f.codeHashes))
  if (hash(await readFile(path)) !== h) throw new Error('Frozen code mismatch.');
const games = await readGameContextSnapshot(args[1]),
  snapshot = JSON.parse(await readFile(args[3], 'utf8'));
if (
  snapshot.contextSha256 !== hash(await readFile(args[1])) ||
  snapshot.contextSha256 !== f.contextSha256 ||
  snapshot.version !== 1 ||
  !Array.isArray(snapshot.tapes) ||
  !Array.isArray(snapshot.media)
)
  throw new Error('Signal context mismatch.');
if (snapshot.mode === 'history' && hash(await readFile(args[3])) !== f.signalsSha256)
  throw new Error('Frozen history mismatch.');
if (snapshot.mode === 'pregame') {
  const completed = new Set(
    games
      .filter((g) => Number.isInteger(g.homeScore) && Number.isInteger(g.awayScore))
      .map((g) => g.id),
  );
  if (
    snapshot.historySha256 !== f.signalsSha256 ||
    hash(JSON.stringify(snapshot.tapes.filter((t) => completed.has(t.gameId)))) !==
      f.historicalTapesSha256
  )
    throw new Error('Pending record training history mismatch.');
}
const model = prepareGameRatingModel(games),
  families = ['price', 'flow', 'media', 'combined'],
  results = {};
for (const family of families) {
  const external = prepareExternalTotalsModel(model, snapshot.tapes, snapshot.media, family),
    rows = [];
  for (const r of model.observations) {
    if (r.game.season !== 2026 || r.game.week > 5 || !r.game.kickoffAt) continue;
    const cutoffAt = new Date(Date.parse(r.game.kickoffAt) - 30 * 60000).toISOString();
    for (const kind of ['moneyline', 'spread', 'total']) {
      const q = r.markets[kind];
      if (!q || q.push) continue;
      const previous =
          kind === 'total'
            ? model.adjustJointAvailability(kind, r.game, q.raw, q.baseline)
            : model.adjust(kind, r.game, q.raw, q.baseline),
        features = external.features(r.game, q.baseline, cutoffAt),
        p = external.probability(kind, r.game, q.raw, q.baseline, cutoffAt);
      rows.push({
        id: r.game.id,
        season: r.game.season,
        week: r.game.week,
        kind,
        y: q.y,
        book: q.baseline,
        previous,
        p,
        ...(kind === 'total'
          ? {
              supported: features.supported,
              priceCount: features.priceCount,
              flowCount: features.flowCount,
            }
          : {}),
      });
    }
  }
  results[family] = {
    all: report(rows),
    early: report(rows.filter((r) => r.week <= 3)),
    later: report(rows.filter((r) => r.week >= 4)),
    coverage: rows.filter((r) => r.kind === 'total' && r.supported).length,
    changed: rows.filter((r) => r.kind === 'total' && Math.abs(r.p - r.previous) > 1e-12).length,
    rows,
  };
}
// Pending numeric records are separate from any owner Advice journal. Never overwrite earlier records.
const pending = [];
if (snapshot.mode === 'pregame')
  for (const r of snapshot.liveGames) {
    const g = r.game,
      b = canonicalBookProbability(g, 'total');
    if (b === undefined) continue;
    const point = model.point(g),
      errors = model.residuals(g, 'total');
    if (!point || errors.length < 100) continue;
    const { residualProbability } = await import('../../packages/core/dist/game-rating-model.js');
    const raw = residualProbability(point.total, errors, g.totalLine).probability;
    const probabilities = {};
    for (const family of families)
      probabilities[family] = prepareExternalTotalsModel(
        model,
        snapshot.tapes,
        snapshot.media,
        family,
      ).probability('total', g, raw, b, r.cutoffAt);
    pending.push({
      gameId: g.id,
      kickoffAt: g.kickoffAt,
      issuedAt: new Date().toISOString(),
      line: g.totalLine,
      book: b,
      production: model.adjustJointAvailability('total', g, raw, b),
      probabilities,
      bookQuotes: r.book.quotes.filter((q) => q.kind === 'total'),
      outcome: 'pending',
    });
  }
console.log(
  JSON.stringify(
    {
      scoredAt: new Date().toISOString(),
      frozenAt: f.frozenAt,
      frozenSha256: hash(await readFile(args[5])),
      contextSha256: snapshot.contextSha256,
      signalsSha256: hash(await readFile(args[3])),
      mode: snapshot.mode,
      results,
      pending,
      warnings: [
        '2026 Weeks 1–5 are reused retrospective research; fixed parameters, no later-outcome tuning. Minimum 30 earlier supported games before any correction.',
        'Sentiment is only a current captured headline-language proxy. No representative social sample or historical sentiment is claimed.',
        'Anonymous large-trade flow is not proof of wallet skill. No current holder/leaderboard data used. Moneyline and spread outputs unchanged.',
      ],
    },
    null,
    2,
  ),
);
