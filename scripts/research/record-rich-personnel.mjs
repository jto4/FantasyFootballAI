import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readGameContextSnapshot } from './game-context-snapshot.mjs';
import {
  PublicPregameEvidence,
  PublicSportsbookLines,
} from '../../packages/integrations/dist/index.js';
import { americanOdds } from '../../packages/core/dist/index.js';
import {
  prepareGameRatingModel,
  residualProbability,
} from '../../packages/core/dist/game-rating-model.js';
import { prepareRichPersonnelModel } from '../../packages/core/dist/research/rich-personnel-model.js';
import { kinds, specs, specId } from './rich-personnel-evaluation.mjs';
const args = process.argv.slice(2);
if (
  args.length !== 8 ||
  args[0] !== '--contexts' ||
  args[2] !== '--frozen' ||
  args[4] !== '--game-id' ||
  args[6] !== '--output'
)
  throw new Error(
    'Usage: --contexts <games.json> --frozen <development.json> --game-id <id> --output <new-record.json>',
  );
if ((await stat(args[3])).size > 1000000) throw new Error('Frozen selection exceeds limit.');
const games = await readGameContextSnapshot(args[1]),
  frozen = JSON.parse(await readFile(args[3], 'utf8')),
  hash = (v) => createHash('sha256').update(v).digest('hex');
if (
  hash(await readFile(args[1])) !== frozen.contextSha256 ||
  hash(JSON.stringify(games.filter((g) => g.season <= 2021))) !== frozen.developmentSha256
)
  throw new Error('Frozen contexts do not match.');
for (const kind of kinds) {
  const s = frozen.selection?.[kind];
  if (
    !s ||
    !(s.id === 'previous'
      ? s.spec === null
      : specs.some(
          (spec) => specId(spec) === s.id && JSON.stringify(spec) === JSON.stringify(s.spec),
        ))
  )
    throw new Error('Invalid frozen procedure.');
}
const matches = games.filter((g) => g.id === args[5]);
if (matches.length !== 1) throw new Error('Unique target required.');
let game = matches[0];
if (
  !game.kickoffAt ||
  Date.now() >= Date.parse(game.kickoffAt) ||
  game.homeScore !== undefined ||
  game.awayScore !== undefined
)
  throw new Error('Only an upcoming uncompleted game may be recorded.');
const data = { season: game.season, games, players: [], market: [], sources: [], warnings: [] };
game = await new PublicPregameEvidence().current(game, data, undefined);
const quotes = await new PublicSportsbookLines().get(game),
  model = prepareGameRatingModel(games),
  point = model.point(game),
  results = [];
if (!point) throw new Error('Score history unavailable.');
for (const kind of kinds) {
  const q = quotes.quotes.find(
    (q) => q.kind === kind && q.side === (kind === 'total' ? 'over' : 'home'),
  );
  if (!q || q.oppositeAmericanOdds === undefined)
    throw new Error('Fresh paired price unavailable.');
  const threshold = kind === 'moneyline' ? 0 : kind === 'spread' ? -q.line : q.line;
  if (!Number.isFinite(threshold)) throw new Error('Quote threshold unavailable.');
  const target = {
      ...game,
      ...(kind === 'spread'
        ? { spreadLine: threshold }
        : kind === 'total'
          ? { totalLine: threshold }
          : {}),
    },
    raw = residualProbability(
      kind === 'total' ? point.total : point.margin,
      model.residuals(target, kind),
      threshold,
    ).probability,
    chosen = americanOdds(q.americanOdds).breakEvenRate,
    opposite = americanOdds(q.oppositeAmericanOdds).breakEvenRate,
    book = chosen / (chosen + opposite),
    previous =
      kind === 'total'
        ? model.adjustJointAvailability(kind, target, raw, book)
        : model.adjust(kind, target, raw, book),
    spec = frozen.selection[kind].spec,
    candidate = spec
      ? prepareRichPersonnelModel(model, spec).probability(kind, target, raw, book)
      : previous;
  results.push({
    kind,
    quote: q,
    threshold,
    raw,
    bookProbability: book,
    previousProbability: previous,
    candidateProbability: candidate,
    experimentalProcedure: frozen.selection[kind].id,
  });
}
const capturedAt = new Date().toISOString();
if (
  Date.parse(capturedAt) >= Date.parse(game.kickoffAt) ||
  quotes.quotes.some((q) => Date.parse(capturedAt) - Date.parse(q.observedAt) > 300000)
)
  throw new Error('Recording must finish before kickoff with fresh quotes.');
const codeHashes = {};
for (const path of [
  'packages/core/src/game-rating-model.ts',
  'packages/core/src/game-availability.ts',
  'packages/core/src/research/rich-personnel-model.ts',
  'packages/integrations/src/game-personnel.ts',
  'packages/integrations/src/game-pregame.ts',
  'packages/integrations/src/sportsbook-lines.ts',
  'scripts/research/record-rich-personnel.mjs',
])
  codeHashes[path] = hash(await readFile(path));
const record = {
  capturedAt,
  numericResearchOnly: true,
  noWagerOrAIInvocation: true,
  outcomes: 'pending',
  game: { id: game.id, kickoffAt: game.kickoffAt, home: game.home, away: game.away },
  context: game.pregame,
  contextSnapshotSha256: frozen.contextSha256,
  frozenSha256: hash(await readFile(args[3])),
  codeHashes,
  results,
  warnings: [
    ...quotes.warnings,
    'Experimental correction failed historical consistency checks and is not enabled in production.',
    'Current capture is prospective; historical training data publication/revision timing is not verified.',
    'One game cannot establish an advantage or profit.',
  ],
};
// Append-only capture: never overwrite earlier forecasts or change their issuance after outcomes.
await writeFile(args[7], JSON.stringify(record, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ capturedAt, game: record.game, results }, null, 2));
