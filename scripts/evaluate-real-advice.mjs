import { readFile, writeFile, mkdir, mkdtemp, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { auditRealAdvice } from './real-advice-audit.mjs';
import {
  SignedInCodexConnection,
  PublicSportsbookLines,
  PublicPregameEvidence,
} from '../packages/integrations/dist/index.js';
import { createAdviceService } from '../apps/api/dist/advice-service.js';
import { initialState } from '../apps/api/dist/store-defaults.js';
import {
  adviceContext,
  validatedEvaluationAnswer,
  evaluationValidationFailure,
  evaluationProviderFailure,
} from './advice-evaluation-cases.mjs';
const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args[i + 1];
};
const root = resolve(
  option('--output') ?? (await mkdtemp(join(tmpdir(), 'sidekick-real-advice-'))),
);
await mkdir(root, { recursive: true });
const snapshotPath = option('--snapshot');
if (!snapshotPath)
  throw Error(
    'Provide an explicitly captured public football snapshot with --snapshot. See docs/advice.md.',
  );
if ((await stat(snapshotPath)).size > 80000000) throw Error('Football snapshot is too large.');
const snapshotText = await readFile(snapshotPath, 'utf8');
const snapshot = JSON.parse(snapshotText);
if (
  !snapshot.data?.players?.length ||
  !snapshot.catalog?.length ||
  !Number.isInteger(snapshot.state?.season) ||
  !Number.isInteger(snapshot.state?.week)
)
  throw Error('Invalid public snapshot.');
const catalog = new Map(snapshot.catalog);
const { season, week } = snapshot.state;
function p(name, pos) {
  const rows = [...catalog.values()].filter((p) => p.name === name && p.position === pos);
  if (rows.length !== 1) throw Error('Ambiguous scenario identity: ' + name);
  return structuredClone(rows[0]);
}
const own = [
  p('Josh Allen', 'QB'),
  p('Patrick Mahomes', 'QB'),
  p('James Cook', 'RB'),
  p('Jonathan Taylor', 'RB'),
  p('Saquon Barkley', 'RB'),
  p('Puka Nacua', 'WR'),
  p('Garrett Wilson', 'WR'),
  p('CeeDee Lamb', 'WR'),
  p("Ja'Marr Chase", 'WR'),
  p('Travis Kelce', 'TE'),
  p('Brock Bowers', 'TE'),
  p('Chris Olave', 'WR'),
];
const other = [
  p('Jalen Hurts', 'QB'),
  p('Bijan Robinson', 'RB'),
  p('Derrick Henry', 'RB'),
  p('Nico Collins', 'WR'),
  p('Brian Thomas', 'WR'),
];
const reserves = [p('Zach Charbonnet', 'RB'), p('Dylan Sampson', 'RB')];
const free = [
  p('Rashid Shaheed', 'WR'),
  p('Rome Odunze', 'WR'),
  p('Chuba Hubbard', 'RB'),
  p('Omarion Hampton', 'RB'),
];
const id = (name) => [...own, ...other, ...free].find((p) => p.name === name).id;
const starterNames = [
  'Josh Allen',
  'James Cook',
  'Jonathan Taylor',
  'Garrett Wilson',
  'CeeDee Lamb',
  'Travis Kelce',
  'Chris Olave',
];
const stamp = snapshot.asOf;
const league = {
  id: 'real-data-scenario',
  name: 'Isolated PPR scenario — real football data',
  displayName: 'Isolated PPR scenario — real football data',
  platform: 'sleeper',
  season,
  teamCount: 10,
  connectedAt: stamp,
  lastSyncedAt: stamp,
  settings: {
    currentWeek: week,
    roster_positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', ...Array(5).fill('BN')],
  },
  scoring: {
    pass_yd: 0.04,
    pass_td: 4,
    pass_int: -2,
    rush_yd: 0.1,
    rush_td: 6,
    rec: 1,
    rec_yd: 0.1,
    rec_td: 6,
    fum_lost: -2,
    pass_2pt: 2,
    rush_2pt: 2,
    rec_2pt: 2,
  },
  teams: [
    { id: 'mine', name: 'Scenario team', rosterSize: own.length, roster: own },
    { id: 'other', name: 'Scenario comparison team', rosterSize: other.length, roster: other },
    ...Array.from({ length: 8 }, (_, i) => ({
      id: 'unmodelled-' + i,
      name: 'Unmodelled comparison roster',
      rosterSize: 0,
      roster: [],
    })),
  ],
  matchups: [{ week, teams: [{ teamId: 'mine', starters: starterNames.map(id) }] }],
  draft: {
    id: 'scenario-draft',
    season,
    status: 'complete',
    picks: own.map((p, i) => ({
      playerId: p.id,
      playerName: p.name,
      teamId: 'mine',
      pickNumber: i * 10 + 1,
      round: i + 1,
    })),
  },
};
const cases = [
  {
    id: 'lineup',
    request: {
      mode: 'lineup',
      question:
        'Set a complete legal PPR lineup from this scenario roster. Compare the recorded starters with the proposed starters; explicitly address the bye-week and recorded Out player, questionable availability and any change. This is a test scenario, not my actual roster.',
    },
  },
  {
    id: 'start-sit',
    request: {
      mode: 'lineup',
      candidateIds: [id('Puka Nacua'), id('Garrett Wilson')],
      question:
        'Compare these players for one WR spot, show the estimates for both, and explain the practical reasons to reconsider before kickoff.',
    },
  },
  {
    id: 'draft-plan',
    request: {
      mode: 'draft-plan',
      candidateIds: free.map((p) => p.id),
      question:
        'Give a conditional draft-planning comparison of these real players for this test roster. It is in-season and the saved pick log is synthetic: do not present this as a current executable draft or a historically valid draft-time comparison. Explain what the available season/remaining evidence and roster needs support.',
    },
  },
  {
    id: 'draft-review',
    request: {
      mode: 'draft-review',
      question:
        'Review the current outlook of this synthetic roster and pick log using real football data. Withhold a historical draft grade without draft-time estimates, ADP and actual alternatives. Identify supported strengths, weaknesses and practical next steps.',
    },
  },
  {
    id: 'trade',
    request: {
      mode: 'trade',
      giveIds: [id('Saquon Barkley')],
      receiveIds: [id('Bijan Robinson')],
      tradeTeamId: 'other',
      throughWeek: 18,
      question:
        'Evaluate this conditional player-for-player exchange for this scenario team using remaining-season starting value. Address injury and depth risks. The other manager’s willingness and platform eligibility are unknown.',
    },
  },
  {
    id: 'trade-loss',
    request: {
      mode: 'trade',
      giveIds: [id('Puka Nacua')],
      receiveIds: [id('Brian Thomas')],
      tradeTeamId: 'other',
      throughWeek: 18,
      question:
        'Evaluate the proposed exchange on remaining-season starting value and roster consequences; do not accept a weak offer just because both players are good NFL players.',
    },
  },
  {
    id: 'waivers',
    request: {
      mode: 'waivers',
      candidateIds: free.map((p) => p.id),
      dropPlayerId: id('Chris Olave'),
      question:
        'Compare adding each candidate and dropping Chris Olave after re-optimizing all starting slots. These players are unrostered only in the test scenario; actual league availability, locks, priority and FAAB are unknown. Distinguish immediate weekly gain from unquantified stash value.',
    },
  },
  ...['moneyline', 'spread', 'total'].map((kind) => ({
    id: 'betting-' + kind,
    request: { mode: 'betting' },
    kind,
  })),
];
cases.push(
  {
    id: 'draft-plan-complete',
    supportedSeason: true,
    request: cases.find((c) => c.id === 'draft-plan').request,
  },
  {
    id: 'draft-review-complete',
    supportedSeason: true,
    request: cases.find((c) => c.id === 'draft-review').request,
  },
  {
    id: 'trade-complete',
    supportedTrade: true,
    request: { ...cases.find((c) => c.id === 'trade').request, giveIds: [id('James Cook')] },
  },
  {
    id: 'reserve-waivers',
    request: {
      ...cases.find((c) => c.id === 'waivers').request,
      candidateIds: [...reserves.map((p) => p.id), id('Omarion Hampton')],
    },
  },
);
const selected = option('--case')?.split(',');
if (selected?.some((id) => !cases.some((c) => c.id === id)))
  throw new Error('Unknown real-data evaluation case.');
const cancellation = new AbortController();
const stop = () => cancellation.abort();
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
const completed = [];
const provider = process.argv.includes('--prepare')
  ? null
  : await new SignedInCodexConnection().provider();
const odds = new PublicSportsbookLines();
const pregame = new PublicPregameEvidence();
for (const c of cases.filter((c) => !selected || selected.includes(c.id))) {
  if (cancellation.signal.aborted) break;
  const state = structuredClone(initialState);
  const scenario = structuredClone(league);
  if (c.supportedSeason) {
    scenario.teams[0].roster = scenario.teams[0].roster.filter(
      (p) => !['Saquon Barkley', 'Puka Nacua', 'Brock Bowers'].includes(p.name),
    );
    scenario.teams[0].rosterSize = scenario.teams[0].roster.length;
    scenario.draft.picks = scenario.draft.picks.filter((p) =>
      scenario.teams[0].roster.some((r) => r.id === p.playerId),
    );
  }
  if (c.supportedTrade) {
    scenario.teams[0].roster = scenario.teams[0].roster.filter((p) => p.name !== 'Saquon Barkley');
    scenario.teams[0].rosterSize = scenario.teams[0].roster.length;
  }
  state.leagues = [scenario];
  const passes = [];
  let context;
  const ai = {
    id: 'real-data-codex-evaluation',
    generate: async (request) => {
      context = adviceContext(request.prompt);
      await writeFile(root + '/' + c.id + '-context.json', JSON.stringify(context));
      console.log(JSON.stringify({ case: c.id, stage: 'generating', pass: passes.length + 1 }));
      const response = await provider.generate(request);
      let answer, failure;
      try {
        answer = validatedEvaluationAnswer(response, context);
      } catch (e) {
        failure = evaluationValidationFailure(e);
      }
      passes.push({ answer, failure });
      console.log(
        JSON.stringify({
          case: c.id,
          stage: 'received',
          pass: passes.length,
          valid: !!answer,
          failure,
        }),
      );
      return response;
    },
  };
  const store = {
    snapshot: () => structuredClone(state),
    settingsSnapshot: () => structuredClone(state.settings),
    update: async (fn) => {
      await fn(state);
    },
  };
  const service = createAdviceService({
    store,
    data: { get: async () => structuredClone(snapshot.data) },
    catalog: async () => structuredClone(catalog),
    news: {
      get: async () => structuredClone(snapshot.news),
      getForAdvice: async () => structuredClone(snapshot.news),
    },
    injuries: { get: async () => structuredClone(snapshot.injuries) },
    pregame,
    odds,
    configuredAI: async () => null,
    signedInCodex: { status: async () => 'signed-in', provider: async () => ai },
  });
  const request = {
    leagueId: league.id,
    teamId: 'mine',
    season,
    week,
    connection: 'codex-cli',
    model: 'gpt-6.1-sol',
    ...c.request,
  };
  if (c.kind) {
    const game = snapshot.data.games
      .filter(
        (g) =>
          g.season === season &&
          g.week === week &&
          g.espnId &&
          Date.parse(g.kickoffAt) > Date.now(),
      )
      .sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt))[0];
    if (!game) throw Error('Selected live game unavailable');
    const prices = await odds.get(game);
    const quote = prices.quotes.find((q) => q.kind === c.kind);
    if (!quote) {
      completed.push({
        case: c.id,
        mode: 'betting',
        error: 'verified-real-price-unavailable',
        modelPasses: 0,
      });
      await writeFile(
        root + '/' + c.id + '.json',
        JSON.stringify({ case: c.id, stage: 'unavailable', warnings: prices.warnings }),
      );
      continue;
    }
    request.bet = {
      kind: quote.kind,
      gameId: game.id,
      side: quote.side,
      ...(quote.line === undefined ? {} : { line: quote.line }),
      americanOdds: quote.americanOdds,
      oppositeAmericanOdds: quote.oppositeAmericanOdds,
      quoteId: quote.id,
    };
    request.question =
      'Evaluate this real fetched pregame price against the chronological statistical forecast and matched sportsbook baseline. Abstain without independently supported edge; do not call an AI opinion or sentiment a proven betting advantage.';
  }
  try {
    const readiness = await service.readiness(request);
    console.log(
      JSON.stringify({
        case: c.id,
        stage: 'ready',
        status: readiness.status,
        projectionCoverage: readiness.projections,
        injuryCoverage: readiness.injuries,
      }),
    );
    if (process.argv.includes('--prepare')) continue;
    const result = await service.analyze(
      request,
      AbortSignal.any([cancellation.signal, AbortSignal.timeout(300000)]),
      randomUUID(),
    );
    const audit = auditRealAdvice({ request, scenario, passes, result }, context, snapshot);
    await writeFile(
      root + '/' + c.id + '.json',
      JSON.stringify({ case: c.id, request, scenario, readiness, passes, result, audit }, null, 2),
    );
    completed.push({
      case: c.id,
      mode: request.mode,
      modelPasses: passes.length,
      verdict: result.assessment.verdict,
      validFinal: !!passes.at(-1)?.answer,
      passed: audit.passed,
      errors: audit.errors,
    });
    console.log(
      JSON.stringify({
        case: c.id,
        stage: 'saved',
        verdict: result.assessment.verdict,
        headline: result.assessment.headline,
        selected: result.assessment.recommendedPlayerIds,
        confidence: result.confidence,
        modelPasses: passes.length,
      }),
    );
  } catch (e) {
    await writeFile(
      root + '/' + c.id + '.json',
      JSON.stringify({ case: c.id, error: evaluationProviderFailure(e), passes }, null, 2),
    );
    completed.push({
      case: c.id,
      mode: request.mode,
      error: evaluationProviderFailure(e),
      modelPasses: passes.length,
    });
    console.log(
      JSON.stringify({
        case: c.id,
        stage: 'failed',
        category: evaluationProviderFailure(e),
        modelPasses: passes.length,
      }),
    );
  }
}

await writeFile(
  root + '/run.json',
  JSON.stringify(
    {
      completedAt: new Date().toISOString(),
      scope:
        'Real public football data and explicit synthetic PPR roster scenarios; evidence consistency/usefulness, not prospective prediction accuracy.',
      snapshotSha256: createHash('sha256').update(snapshotText).digest('hex'),
      dataAsOf: snapshot.asOf,
      model: 'gpt-6.1-sol',
      completed,
      cancelled: cancellation.signal.aborted,
    },
    null,
    2,
  ),
);
process.removeListener('SIGINT', stop);
process.removeListener('SIGTERM', stop);
if (cancellation.signal.aborted) process.exitCode = 130;
else if (completed.some((c) => c.error || !c.validFinal || !c.passed)) process.exitCode = 1;
