import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  isAdviceResult,
  type AdviceAssessment,
  type FootballDataSnapshot,
  type AIRequest,
  type AppSettings,
  type NewsItem,
  type RosterPlayer,
} from '@sidekick/core';
import { LocalStore } from './store.js';
import { createLocalHttpApp } from './http-app.js';
import { createAdviceRouter } from './advice-routes.js';
import {
  SignedInAIError,
  type NFLInjuryReportSnapshot,
  type SignedInAIConnection,
} from '@sidekick/integrations';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
async function workspace(
  modelOptions?: { models?: string[]; failure?: boolean },
  signedInAI?: SignedInAIConnection,
  signedInCodex?: SignedInAIConnection,
  broadNews = false,
) {
  const directory = await mkdtemp(join(tmpdir(), 'sidekick-advice-test-'));
  const store = new LocalStore(join(directory, 'state.sqlite'), join(directory, 'missing.json'));
  await store.load();
  const now = Date.parse('2026-10-07T12:00:00Z');
  let clockNow = now;
  let newsReadTime: number | undefined;
  await store.update((state) => {
    state.leagues.push({
      id: 'league',
      name: 'League',
      displayName: 'League',
      platform: 'sleeper',
      season: 2026,
      teamCount: 2,
      connectedAt: new Date(now).toISOString(),
      lastSyncedAt: new Date(now).toISOString(),
      settings: { currentWeek: 5, roster_positions: ['QB', 'WR', 'BN'] },
      scoring: { pass_yd: 0.04, rec: 1, rec_yd: 0.1 },
      teams: [
        {
          id: 'mine',
          name: 'Mine',
          rosterSize: 2,
          roster: [
            { id: 'qb', name: 'Fictional Quarterback', position: 'QB', nflTeam: 'BUF' },
            { id: 'wr', name: 'Fictional Receiver', position: 'WR', nflTeam: 'BUF' },
          ],
        },
        { id: 'other', name: 'Other', rosterSize: 0, roster: [] },
      ],
    });
    state.settings.aiRuntime = {
      mode: 'api',
      model: 'existing-model',
      command: '',
      args: '',
      baseUrl: 'https://example.test/v1',
      inputUsdPerMillionTokens: 1,
      outputUsdPerMillionTokens: 2,
    };
  });
  const data: FootballDataSnapshot = {
    season: 2026,
    games: [],
    players: [],
    market: [],
    sources: [
      { id: 'games', name: 'Games', status: 'available', retrievedAt: new Date(now).toISOString() },
      {
        id: 'stats-2026',
        name: 'Stats',
        status: 'available',
        retrievedAt: new Date(now).toISOString(),
      },
    ],
    warnings: [],
  };
  for (let week = 1; week <= 4; week++) {
    const gameId = `week-${week}`;
    data.games.push({
      id: gameId,
      season: 2026,
      week,
      seasonType: 'REG',
      date: `2026-09-${10 + week}`,
      home: 'BUF',
      away: 'MIA',
      homeScore: 24,
      awayScore: 21,
    });
    for (const [id, name, position] of [
      ['gsis-qb', 'Fictional Quarterback', 'QB'],
      ['gsis-wr', 'Fictional Receiver', 'WR'],
    ])
      data.players.push({
        playerId: id!,
        name: name!,
        position: position!,
        team: 'BUF',
        opponent: 'MIA',
        gameId,
        season: 2026,
        week,
        seasonType: 'REG',
        stats: {
          passing_yards: position === 'QB' ? 250 : 0,
          receptions: position === 'WR' ? 5 : 0,
          receiving_yards: position === 'WR' ? 100 : 0,
        },
      });
  }
  data.games.push({
    id: 'upcoming',
    season: 2026,
    week: 5,
    seasonType: 'REG',
    date: '2026-10-11',
    home: 'BUF',
    away: 'MIA',
  });
  const calls: AIRequest[] = [];
  const configurations: AppSettings[] = [];
  const newsSnapshot = {
    items: [] as NewsItem[],
    stale: false,
    refreshedAt: new Date(now).toISOString(),
  };
  const catalog = new Map<string, RosterPlayer>();
  const injurySnapshot: NFLInjuryReportSnapshot = {
    rows: [],
    retrievedAt: new Date(now).toISOString(),
    sourceUrl: 'https://example.test/injuries',
  };
  let response: (request: AIRequest) => string | Promise<string> = () => JSON.stringify(answer());
  const router = createAdviceRouter({
    store,
    ...(signedInAI ? { signedInAI } : {}),
    ...(signedInCodex ? { signedInCodex } : {}),
    data: { get: async () => structuredClone(data) },
    catalog: async () => new Map(catalog),
    news: {
      get: async () => {
        if (newsReadTime !== undefined) clockNow = newsReadTime;
        return {
          ...structuredClone(newsSnapshot),
          items: structuredClone(newsSnapshot.items.slice(0, 10)),
        };
      },
      ...(broadNews ? { getForAdvice: async () => structuredClone(newsSnapshot) } : {}),
    },
    injuries: {
      get: async () => structuredClone(injurySnapshot),
    },
    ...(modelOptions
      ? {
          discoverModels: async () => {
            if (modelOptions.failure) throw new Error('private provider detail');
            return modelOptions.models ?? [];
          },
        }
      : {}),
    configuredAI: async (settings) => {
      configurations.push(structuredClone(settings));
      return {
        id: 'fixture',
        generateDetailed: async (request) => {
          calls.push(request);
          return { text: await response(request), usage: { inputTokens: 100, outputTokens: 50 } };
        },
        generate: async () => 'unused',
      };
    },
    now: () => clockNow,
  });
  let port = 0;
  const app = createLocalHttpApp(() => port);
  app.use(router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  port = (server.address() as { port: number }).port;
  cleanups.push(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
    await rm(directory, { recursive: true, force: true });
  });
  return {
    store,
    data,
    newsSnapshot,
    advanceDuringNewsRead: (time: number) => {
      newsReadTime = time;
    },
    setNow: (time: number) => {
      clockNow = time;
    },
    injurySnapshot,
    catalog,
    calls,
    configurations,
    directory,
    url: `http://127.0.0.1:${port}`,
    setResponse: (next: typeof response) => {
      response = next;
    },
  };
}

it('hides scoreless games with started or unknown same-day timing and discards a bet analysis that crosses kickoff', async () => {
  const w = await workspace();
  const game = w.data.games.find((g) => g.id === 'upcoming')!;
  const post = () =>
    fetch(w.url + '/api/advice/' + randomUUID(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'betting',
        season: 2026,
        bet: { kind: 'moneyline', gameId: game.id, side: 'home', americanOdds: -110 },
      }),
    });
  game.date = '2026-10-07';
  for (const kickoff of [undefined, '2026-10-07T12:00:00Z', '2026-10-07T11:00:00Z']) {
    if (kickoff) game.kickoffAt = kickoff;
    else delete game.kickoffAt;
    const options = await (
      await fetch(w.url + '/api/advice/options?mode=betting&season=2026')
    ).json();
    expect(options.games).toEqual([]);
    const response = await post();
    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain('not verified as upcoming');
    expect(w.calls).toHaveLength(0);
    expect(w.store.snapshot().adviceResults).toEqual([]);
  }
  game.kickoffAt = '2026-10-07T12:01:00Z';
  const options = await (
    await fetch(w.url + '/api/advice/options?mode=betting&season=2026')
  ).json();
  expect(options.games.map((g: { id: string }) => g.id)).toEqual(['upcoming']);
  let crossDuringModel = true;
  w.setResponse(() => {
    if (crossDuringModel) w.setNow(Date.parse('2026-10-07T12:01:00Z'));
    const statement = {
      text: 'The entered price needs {{odds-break-even}}.',
      metricIds: ['odds-break-even'],
      sourceIds: ['entered-odds'],
    };
    return JSON.stringify({
      ...answer(),
      verdict: 'hold',
      recommendedPlayerIds: [],
      reasons: [statement],
      alternative: statement,
    });
  });
  expect((await post()).status).toBe(502);
  expect(w.calls).toHaveLength(2);
  expect(w.store.snapshot().adviceResults).toEqual([]);
  crossDuringModel = false;
  w.setNow(Date.parse('2026-10-07T12:00:00Z'));
  const update = w.store.update.bind(w.store);
  const queuedSave = vi.spyOn(w.store, 'update').mockImplementation((change) =>
    update((state) => {
      w.setNow(Date.parse('2026-10-07T12:01:00Z'));
      return change(state);
    }),
  );
  expect((await post()).status).toBe(502);
  expect(w.calls).toHaveLength(4);
  expect(w.store.snapshot().adviceResults).toEqual([]);
  queuedSave.mockRestore();
});
function answer(): AdviceAssessment {
  const statement = {
    text: 'The supported lineup estimate is {{lineup-optimized}}.',
    metricIds: ['lineup-optimized'],
    sourceIds: [],
  };
  return {
    verdict: 'recommend',
    headline: 'Start the supported lineup',
    recommendedPlayerIds: ['qb', 'wr'],
    reasons: [statement],
    risks: [{ text: 'Confirm availability before kickoff.', metricIds: [], sourceIds: [] }],
    alternative: {
      text: 'Import current estimates if the roles have changed.',
      metricIds: [],
      sourceIds: [],
    },
    perception: {
      tone: 'unknown',
      text: 'No representative public opinion sample is available.',
      metricIds: [],
      sourceIds: [],
    },
  };
}
const request = { mode: 'lineup', leagueId: 'league', teamId: 'mine', week: 5 };

it('keeps saved advice and weekly recents newest-first after restart and backup restore without provider replay', async () => {
  const w = await workspace();
  const ids = [randomUUID(), randomUUID()];
  for (const [index, id] of ids.entries()) {
    w.setNow(Date.parse('2026-10-07T12:00:00Z') + index * 60_000);
    const response = await fetch(`${w.url}/api/advice/${id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    expect(response.status).toBe(201);
    expect(isAdviceResult(await response.json())).toBe(true);
  }
  const newestFirst = [...ids].reverse();
  const history = async () => (await (await fetch(`${w.url}/api/advice`)).json()).items;
  expect((await history()).map((item: { id: string }) => item.id)).toEqual(newestFirst);
  const backup = join(w.directory, 'advice-history.sqlite');
  await w.store.backupTo(backup);
  w.store.close();
  await w.store.load();
  expect((await history()).map((item: { id: string }) => item.id)).toEqual(newestFirst);
  const weekly = await (await fetch(`${w.url}/api/advice/weekly?league=league&team=mine`)).json();
  expect(weekly.items.map((item: { id: string }) => item.id)).toEqual(newestFirst);
  await w.store.update((state) => {
    state.adviceResults = [];
  });
  await w.store.restoreFromBuffer(await readFile(backup));
  expect((await history()).map((item: { id: string }) => item.id)).toEqual(newestFirst);
  for (const id of ids) {
    const replay = await fetch(`${w.url}/api/advice/${id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    expect(replay.status).toBe(200);
  }
  expect(w.calls).toHaveLength(4);
});

async function focusedWorkspace() {
  const w = await workspace();
  await w.store.update((state) => {
    const league = state.leagues[0]!;
    league.settings.roster_positions = ['QB', 'WR', 'K', 'DST', 'BN'];
    league.teams[0]!.roster!.push(
      { id: 'bench', name: 'Fictional Backup', position: 'WR', nflTeam: 'BUF' },
      { id: 'k', name: 'Fictional Kicker', position: 'K', nflTeam: 'BUF' },
    );
    league.teams[0]!.rosterSize = 4;
  });
  w.data.players.push(
    ...w.data.players
      .filter((row) => row.position === 'WR')
      .map((row) => ({
        ...row,
        playerId: 'gsis-bench',
        name: 'Fictional Backup',
        stats: { ...row.stats, receiving_yards: 60 },
      })),
  );
  const focusedAnswer = () =>
    JSON.stringify({
      ...answer(),
      recommendedPlayerIds: ['wr'],
      reasons: [
        {
          text: 'Compare the receiver baseline {{wr:projected}} with the backup baseline {{bench:projected}}.',
          metricIds: ['wr:projected', 'bench:projected'],
          sourceIds: ['stats-2026'],
        },
      ],
    });
  w.setResponse(focusedAnswer);
  const post = () =>
    fetch(`${w.url}/api/advice/${randomUUID()}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...request, candidateIds: ['wr', 'bench'] }),
    });
  return { ...w, focusedAnswer, post };
}

it('saves and reloads a numerically supported single-spot choice with unrelated K/DST gaps', async () => {
  const w = await focusedWorkspace();
  const settings = structuredClone(w.store.snapshot().settings);
  const response = await w.post();
  expect(response.status).toBe(201);
  const result = await response.json();
  expect(isAdviceResult(result)).toBe(true);
  expect(result.startSit).toEqual({ candidateIds: ['wr', 'bench'], eligibleSlots: ['WR'] });
  expect(result.assessment.recommendedPlayerIds).toEqual(['wr']);
  expect(result.assessment.verdict).toBe('lean');
  expect(result.lineup).toBeUndefined();
  expect(result.metrics.find((metric: { id: string }) => metric.id === 'start-sit-gap').value).toBe(
    4,
  );
  expect(result.players.map((player: { id: string }) => player.id)).toEqual(['wr', 'bench']);
  for (const call of w.calls) expect(call.prompt).toContain('"startSit"');
  expect(await (await fetch(`${w.url}/api/advice/${result.id}`)).json()).toEqual(result);
  expect(w.store.snapshot().settings).toEqual(settings);
  expect(
    isAdviceResult({
      ...result,
      lineup: { complete: true, points: 15, assignments: [], missingSlots: [], warnings: [] },
    }),
  ).toBe(false);
  expect(
    isAdviceResult({ ...result, startSit: { ...result.startSit, candidateIds: ['wr', 'k'] } }),
  ).toBe(false);
});

it('the review repairs a full-lineup answer for a one-spot request, and rejects a final full-lineup answer', async () => {
  for (const repair of [true, false]) {
    const w = await focusedWorkspace();
    let pass = 0;
    w.setResponse(() => {
      pass++;
      const answer = JSON.parse(w.focusedAnswer());
      if (pass === 1 || !repair) answer.recommendedPlayerIds = ['wr', 'bench'];
      return JSON.stringify(answer);
    });
    expect((await w.post()).status).toBe(repair ? 201 : 502);
    expect(w.calls[1]!.prompt).toContain('did not select one start/sit choice');
    expect(w.store.snapshot().adviceResults).toHaveLength(repair ? 1 : 0);
  }
});

it('rejects a final single-spot answer without visible numbers for its alternatives', async () => {
  const w = await focusedWorkspace();
  w.setResponse(() => {
    const answer = JSON.parse(w.focusedAnswer());
    answer.reasons = [
      {
        text: 'The receiver baseline is {{wr:projected}}.',
        metricIds: ['wr:projected'],
        sourceIds: [],
      },
    ];
    return JSON.stringify(answer);
  });
  expect((await w.post()).status).toBe(502);
  expect(w.calls[1]!.prompt).toContain('did not substantiate the start/sit comparison');
  expect(w.store.snapshot().adviceResults).toEqual([]);
});

it('explains invalid focused ownership and slot selections without calling the model or saving advice', async () => {
  const w = await focusedWorkspace();
  for (const [candidateIds, explanation] of [
    [['qb', 'wr'], 'do not share a supported starting spot'],
    [['wr', 'unknown'], 'distinct players from your team'],
  ] as const) {
    const response = await fetch(`${w.url}/api/advice/${randomUUID()}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...request, candidateIds }),
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain(explanation);
    expect(w.calls).toEqual([]);
    expect(w.store.snapshot().adviceResults).toEqual([]);
  }
});

it('rejects a waiver drop outside the selected roster before inference or persistence', async () => {
  const w = await focusedWorkspace();
  const response = await fetch(`${w.url}/api/advice/${randomUUID()}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...request,
      mode: 'waivers',
      candidateIds: ['free'],
      dropPlayerId: 'unknown',
    }),
  });
  expect(response.status).toBe(400);
  expect((await response.json()).error).toContain('owned player to drop');
  expect(w.calls).toEqual([]);
  expect(w.store.snapshot().adviceResults).toEqual([]);
});

it('makes a lower-estimate single-spot choice tentative and computes the actual opportunity cost', async () => {
  const w = await focusedWorkspace();
  w.setResponse(() =>
    JSON.stringify({ ...JSON.parse(w.focusedAnswer()), recommendedPlayerIds: ['bench'] }),
  );
  const response = await w.post();
  expect(response.status).toBe(201);
  const result = await response.json();
  expect(result.assessment.verdict).toBe('lean');
  expect(result.confidence.score).toBeLessThanOrEqual(59);
  expect(
    result.metrics.find((metric: { id: string }) => metric.id === 'start-sit-selection-change')
      .value,
  ).toBe(-4);
  expect(result.lineup).toBeUndefined();
});
it('surfaces only fixed native limit errors and never substitutes another AI provider', async () => {
  const w = await workspace(undefined, {
    status: async () => 'signed-in',
    provider: async () => ({
      id: 'claude-cli',
      generate: async () => {
        throw new SignedInAIError('limit-reported');
      },
    }),
  });
  for (const [path, body] of [
    ['connection-test', { connection: 'claude-cli' }],
    [randomUUID(), { ...request, connection: 'claude-cli', model: 'opus' }],
  ] as const) {
    const response = await fetch(`${w.url}/api/advice/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain('Claude reported a limit.');
  }
  expect(w.configurations).toHaveLength(0);
  expect(w.store.snapshot().adviceResults).toEqual([]);
});
it('calculates and persists remaining trade value when full-season totals favor the opposite choice', async () => {
  const w = await workspace();
  await w.store.update((state) => {
    state.leagues[0]!.teams[1]!.roster = [
      { id: 'incoming', name: 'Fictional Incoming', position: 'WR', nflTeam: 'MIA' },
    ];
    state.leagues[0]!.teams[1]!.rosterSize = 1;
    state.playerProjections = [
      ['qb', 'Fictional Quarterback', 'QB', 200, 900],
      ['wr', 'Fictional Receiver', 'WR', 80, 600],
      ['incoming', 'Fictional Incoming', 'WR', 150, 300],
    ].flatMap(([id, name, position, remaining, total]) =>
      [false, true].map((full) => ({
        id: `${id}-${full}`,
        leagueId: 'league',
        playerId: String(id),
        playerName: String(name),
        position: String(position),
        projectedPoints: Number(full ? total : remaining),
        sourceId: full ? 'full' : 'remaining',
        sourceName: full ? 'Full season' : 'Remaining season',
        scoringMatched: true,
        importedAt: '2026-10-07T12:00:00Z',
        ...(full ? {} : { period: { season: 2026, fromWeek: 5, throughWeek: 18 } }),
      })),
    );
  });
  w.setResponse(() =>
    JSON.stringify({
      ...answer(),
      recommendedPlayerIds: ['incoming'],
      reasons: [
        {
          text: 'Remaining starting value changes by {{trade-gain}}.',
          metricIds: ['trade-gain'],
          sourceIds: [],
        },
      ],
    }),
  );
  const response = await fetch(`${w.url}/api/advice/${randomUUID()}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode: 'trade',
      leagueId: 'league',
      teamId: 'mine',
      tradeTeamId: 'other',
      giveIds: ['wr'],
      receiveIds: ['incoming'],
    }),
  });
  expect(response.status).toBe(201);
  const result = await response.json();
  expect(isAdviceResult(result)).toBe(true);
  expect(result.metrics.find((metric: { id: string }) => metric.id === 'trade-gain').value).toBe(
    70,
  );
  expect(result.lineup.points).toBe(280);
  expect(result.alternativeLineup.points).toBe(350);
  expect(
    result.players.every(
      (player: { projectionScope: string }) => player.projectionScope === 'remaining-season',
    ),
  ).toBe(true);
  expect(w.calls[0]!.prompt).toContain('remaining-season');
  const reloaded = new LocalStore(
    join(w.directory, 'state.sqlite'),
    join(w.directory, 'missing.json'),
  );
  try {
    await reloaded.load();
    expect(reloaded.snapshot().adviceResults![0]).toEqual(result);
  } finally {
    reloaded.close();
  }
});
it('selects signed-in Opus for both passes without API discovery, configuration, pricing or setting writes', async () => {
  const calls: AIRequest[] = [];
  let checks = 0;
  const w = await workspace(
    { failure: true },
    {
      status: async () => {
        checks++;
        return 'signed-in';
      },
      provider: async () => ({
        id: 'claude-cli',
        generate: async () => 'unused',
        generateDetailed: async (input) => {
          calls.push(input);
          return { text: JSON.stringify(answer()), usage: { inputTokens: 100, outputTokens: 50 } };
        },
      }),
    },
  );
  const settings = w.store.settingsSnapshot();
  const choices = await (
    await fetch(`${w.url}/api/advice/options?league=league&connection=claude-cli`)
  ).json();
  expect(choices).toMatchObject({
    connection: 'claude-cli',
    model: 'opus',
    recommendedModel: 'opus',
    connections: [
      { id: 'saved', status: 'saved' },
      { id: 'claude-cli', status: 'signed-in' },
    ],
  });
  expect(checks).toBe(1);
  expect(calls).toHaveLength(0);
  const id = randomUUID();
  const body = { ...request, connection: 'claude-cli', model: 'opus' };
  const response = await fetch(`${w.url}/api/advice/${id}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(201);
  const result = await response.json();
  expect(isAdviceResult(result)).toBe(true);
  expect(result.model).toBe('Claude Opus · signed-in CLI');
  expect(result.request.connection).toBe('claude-cli');
  expect(result.usage).toEqual({ inputTokens: 200, outputTokens: 100 });
  expect(calls).toHaveLength(2);
  expect(calls.every((input) => input.reasoningEffort === 'high')).toBe(true);
  expect(w.configurations).toHaveLength(0);
  expect(w.store.settingsSnapshot()).toEqual(settings);
  expect((await fetch(`${w.url}/api/advice/${id}`)).status).toBe(200);
  expect(calls).toHaveLength(2);
});
it('never falls back to the saved service when signed-in login or generation fails', async () => {
  for (const unavailable of [true, false]) {
    const w = await workspace(undefined, {
      status: async () => 'signed-out',
      provider: async () => {
        if (unavailable) throw new Error('private account');
        return {
          id: 'claude-cli',
          generate: async () => {
            throw new Error('private provider output');
          },
        };
      },
    });
    const settings = w.store.settingsSnapshot();
    for (const model of ['opus', 'unsupported']) {
      const response = await fetch(`${w.url}/api/advice/${randomUUID()}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...request, connection: 'claude-cli', model }),
      });
      expect(response.status).toBe(502);
      expect(await response.text()).not.toContain('private');
    }
    expect(w.configurations).toHaveLength(0);
    expect(w.store.snapshot().adviceResults).toEqual([]);
    expect(w.store.settingsSnapshot()).toEqual(settings);
  }
});
it('tests only a fixed connection prompt and rejects unsupported payloads and coercible queries', async () => {
  const calls: AIRequest[] = [];
  let output = '{"ok":true}';
  const w = await workspace(undefined, {
    status: async () => 'signed-in',
    provider: async () => ({
      id: 'claude-cli',
      generate: async (input) => {
        calls.push(input);
        return output;
      },
    }),
  });
  const settings = w.store.settingsSnapshot();
  for (const body of [
    { connection: 'saved' },
    { connection: ['claude-cli'] },
    { connection: 'claude-cli', prompt: 'untrusted' },
    ['claude-cli'],
  ])
    expect(
      (
        await fetch(`${w.url}/api/advice/connection-test`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
      ).status,
    ).toBe(400);
  for (const query of [
    'connection=unknown',
    'connection[]=claude-cli',
    'connection=claude-cli&connection=saved',
  ])
    expect((await fetch(`${w.url}/api/advice/options?${query}`)).status).toBe(400);
  expect(calls).toHaveLength(0);
  const probe = () =>
    fetch(`${w.url}/api/advice/connection-test`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"connection":"claude-cli"}',
    });
  expect(await (await probe()).json()).toEqual({ ok: true });
  expect(calls[0]).toMatchObject({
    system: 'Return only JSON. Do not use tools.',
    prompt: 'Return only {"ok":true}.',
    maxOutputTokens: 1024,
    timeoutMs: 25000,
  });
  for (output of ['{"ok":false}', '{"ok":true,"account":"private"}', 'not JSON', '[true]']) {
    const response = await probe();
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('private');
  }
  expect(w.configurations).toHaveLength(0);
  expect(w.store.snapshot().adviceResults).toEqual([]);
  expect(w.store.settingsSnapshot()).toEqual(settings);
});
it('serializes probe/analysis calls and aborts a probe on client disconnect', async () => {
  let started!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  let signal: AbortSignal | undefined;
  const w = await workspace(undefined, {
    status: async () => 'signed-in',
    provider: async () => ({
      id: 'claude-cli',
      generate: async (input) => {
        signal = input.signal;
        started();
        return new Promise<string>((_resolve, reject) =>
          input.signal!.addEventListener('abort', () => reject(new Error('canceled')), {
            once: true,
          }),
        );
      },
    }),
  });
  const controller = new AbortController();
  const pending = fetch(`${w.url}/api/advice/connection-test`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"connection":"claude-cli"}',
    signal: controller.signal,
  }).catch(() => null);
  await entered;
  for (const [path, body] of [
    ['connection-test', { connection: 'claude-cli' }],
    [randomUUID(), request],
  ] as const)
    expect(
      (
        await fetch(`${w.url}/api/advice/${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
      ).status,
    ).toBe(409);
  controller.abort();
  await pending;
  await vi.waitFor(() => expect(signal?.aborted).toBe(true));
  expect(w.store.snapshot().adviceResults).toEqual([]);
  expect(w.configurations).toHaveLength(0);
});
async function benchWorkspace() {
  const w = await workspace();
  await w.store.update((state) => {
    const roster = state.leagues[0]!.teams[0]!;
    roster.roster![1]!.status = 'Questionable';
    roster.roster!.push({
      id: 'bench',
      name: 'Fictional Bench Receiver',
      position: 'WR',
      nflTeam: 'BUF',
    });
    roster.rosterSize = 3;
  });
  w.data.players.push(
    ...w.data.players
      .filter((row) => row.position === 'WR')
      .map((row) => ({
        ...structuredClone(row),
        playerId: 'gsis-bench',
        name: 'Fictional Bench Receiver',
        stats: { ...row.stats, receiving_yards: 70 },
      })),
  );
  return w;
}
function benchAnswer() {
  return {
    ...answer(),
    recommendedPlayerIds: ['qb', 'bench'],
    reasons: [
      {
        text: 'Choose the bench receiver at {{bench:projected}} over the questionable receiver at {{wr:projected}} while availability remains uncertain.',
        metricIds: ['bench:projected', 'wr:projected'],
        sourceIds: ['stats-2026'],
      },
    ],
  };
}
it('saves the model’s legal bench alternative with its own total and an explicit highest-estimate comparison', async () => {
  const w = await benchWorkspace();
  const settings = w.store.settingsSnapshot();
  w.setResponse(() => JSON.stringify(benchAnswer()));
  const response = await fetch(`${w.url}/api/advice/${randomUUID()}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  expect(response.status).toBe(201);
  const result = await response.json();
  expect(isAdviceResult(result)).toBe(true);
  expect(result.assessment.recommendedPlayerIds).toEqual(['qb', 'bench']);
  expect(result.assessment.verdict).toBe('lean');
  // Recent games weigh more in the projection, so totals land within a point of the plain averages.
  expect(result.lineup.points).toBeCloseTo(22, 0);
  expect(result.lineup.assignments.map((row: { playerId: string }) => row.playerId).sort()).toEqual(
    ['bench', 'qb'],
  );
  expect(result.alternativeLineup.points).toBeCloseTo(25, 0);
  expect(
    result.metrics.find((metric: { id: string }) => metric.id === 'lineup-selection-change').value,
  ).toBeCloseTo(result.lineup.points - result.alternativeLineup.points);
  expect(
    result.metrics.find((metric: { id: string }) => metric.id === 'lineup-selected').value,
  ).toBe(result.lineup.points);
  expect(result.confidence.score).toBeLessThanOrEqual(59);
  expect(result.warnings.join(' ')).toContain('tradeoff has not been quantified');
  expect(w.calls[0]!.prompt).toContain('bench');
  expect(w.store.snapshot().adviceResults![0]).toEqual(result);
  expect(w.store.settingsSnapshot()).toEqual(settings);
  expect(w.calls).toHaveLength(2);
});
it('the review can repair a partial lineup, but a final illegal lineup is never silently completed or saved', async () => {
  for (const repaired of [true, false]) {
    const w = await benchWorkspace();
    w.setResponse(() =>
      JSON.stringify(
        w.calls.length === 1 || !repaired
          ? { ...answer(), recommendedPlayerIds: ['qb'] }
          : benchAnswer(),
      ),
    );
    const response = await fetch(`${w.url}/api/advice/${randomUUID()}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    expect(response.status).toBe(repaired ? 201 : 502);
    expect(w.calls[1]!.prompt).toContain('did not select a complete legal starting lineup');
    expect(w.store.snapshot().adviceResults).toHaveLength(repaired ? 1 : 0);
  }
});
it('a changed lineup without visible numerical support for both changed players fails verification', async () => {
  const w = await benchWorkspace();
  w.setResponse(() => JSON.stringify({ ...answer(), recommendedPlayerIds: ['qb', 'bench'] }));
  const response = await fetch(`${w.url}/api/advice/${randomUUID()}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  expect(response.status).toBe(502);
  expect(w.calls[1]!.prompt).toContain('without showing the tradeoff');
  expect(w.store.snapshot().adviceResults).toHaveLength(0);
});
it('anchors evidence freshness after provider refreshes rather than before the downloads finish', async () => {
  const w = await workspace(),
    refreshedAt = '2026-10-07T12:00:02Z';
  w.advanceDuringNewsRead(Date.parse(refreshedAt));
  w.newsSnapshot.refreshedAt = refreshedAt;
  w.newsSnapshot.items = [
    {
      title: 'Fictional Receiver practices today',
      source: 'News',
      url: 'https://example.test/current',
      publishedAt: '2026-10-07T11:00:00Z',
    },
  ];
  const response = await fetch(w.url + '/api/advice/' + randomUUID(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  expect(response.status).toBe(201);
  const result = await response.json();
  expect(result.createdAt).toBe('2026-10-07T12:00:02.000Z');
  expect(result.perceptionEvidence.feedStatus).toBe('current');
  expect(isAdviceResult(result)).toBe(true);
});
it('saves the computed chronological forecast and its numeric/source references without trusting an optimistic AI probability', async () => {
  const w = await workspace();
  const target = w.data.games.find((game) => game.id === 'upcoming')!;
  w.data.games = [{ ...target, home: 'A15', away: 'B0' }];
  for (const season of [2025, 2026])
    for (let week = 1; week <= (season === 2025 ? 18 : 4); week++)
      for (let i = 0; i < 16; i++) {
        const j = (i + week) % 16;
        w.data.games.push({
          id: `rolling-${season}-${week}-${i}`,
          season,
          week,
          seasonType: 'REG',
          date: new Date(Date.UTC(season, 8, 1 + (week - 1) * 7)).toISOString().slice(0, 10),
          home: `A${i}`,
          away: `B${j}`,
          homeScore: 20 + i + (week % 3),
          awayScore: 20 + j + ((week + i) % 4),
        });
      }
  const support = {
    text: 'The computed rolling estimate is {{bet-model-probability}}.',
    metricIds: ['bet-model-probability'],
    sourceIds: ['games'],
  };
  w.setResponse(() =>
    JSON.stringify({
      ...answer(),
      recommendedPlayerIds: [],
      reasons: [support],
      forecast: { probability: 0.99, lower: 0.95, upper: 1, rationale: support },
    }),
  );
  const response = await fetch(w.url + '/api/advice/' + randomUUID(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode: 'betting',
      bet: { kind: 'moneyline', gameId: 'upcoming', side: 'home', americanOdds: -110 },
    }),
  });
  expect(response.status).toBe(201);
  const result = await response.json();
  expect(isAdviceResult(result)).toBe(true);
  expect(result.betHistory.forecast.evaluation.games).toBeGreaterThan(100);
  expect(result.assessment.verdict).toBe('hold');
  expect(w.calls[0]!.prompt).toContain('bet-model-brier');
  expect(w.calls[1]!.prompt).toContain('rolling-residual-v1');
  expect(
    isAdviceResult({
      ...result,
      betHistory: {
        ...result.betHistory,
        forecast: { ...result.betHistory.forecast, probability: 2 },
      },
    }),
  ).toBe(false);
  const legacy = structuredClone(result);
  delete legacy.betHistory.forecast;
  expect(isAdviceResult(legacy)).toBe(true);
  expect(await (await fetch(w.url + '/api/advice/' + result.id)).json()).toEqual(result);
  expect(w.calls).toHaveLength(2);
});
it('keeps unsupported betting confidence Low even when the model omits its optional forecast', async () => {
  const w = await workspace();
  const settings = w.store.settingsSnapshot();
  w.data.games.push(
    ...w.data.games
      .filter((game) => game.homeScore !== undefined)
      .map((game) => ({
        ...game,
        id: `previous-${game.id}`,
        season: 2025,
        date: game.date.replace('2026', '2025'),
      })),
  );
  w.setResponse(() =>
    JSON.stringify({
      ...answer(),
      verdict: 'hold',
      recommendedPlayerIds: [],
      reasons: [
        {
          text: 'The historical sample is {{bet-sample}}.',
          metricIds: ['bet-sample'],
          sourceIds: ['games'],
        },
      ],
    }),
  );
  const response = await fetch(w.url + '/api/advice/' + randomUUID(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode: 'betting',
      bet: { kind: 'moneyline', gameId: 'upcoming', side: 'home', americanOdds: -110 },
    }),
  });
  expect(response.status).toBe(201);
  const result = await response.json();
  expect(isAdviceResult(result)).toBe(true);
  expect(result.assessment.forecast).toBeUndefined();
  expect(result.betHistory.forecast).toBeUndefined();
  expect(result.assessment.verdict).toBe('hold');
  expect(result.confidence.label).toBe('Low');
  expect(result.confidence.score).toBeLessThanOrEqual(49);
  expect(await (await fetch(w.url + '/api/advice/' + result.id)).json()).toEqual(result);
  expect(w.calls).toHaveLength(2);
  expect(w.store.settingsSnapshot()).toEqual(settings);
});

it('keeps undated injury reports advisory and only applies a current verified report to saved advice', async () => {
  const w = await workspace();
  await w.store.update((state) => {
    state.leagues[0]!.teams[0]!.roster![1]!.gsisId = '00-0000001';
  });
  // The injury identity must agree with the fixture's historical stat identity.
  for (const row of w.data.players)
    if (row.name === 'Fictional Receiver') row.playerId = '00-0000001';
  w.injurySnapshot.rows = [
    {
      season: 2026,
      week: 5,
      seasonType: 'REG',
      gsisId: '00-0000001',
      team: 'BUF',
      position: 'WR',
      fullName: 'Spelling changed',
      reportStatus: 'Questionable',
      reportInjury: 'Ankle',
      practiceStatus: 'Limited Participation in Practice',
      practiceInjury: 'Ankle',
    },
  ];
  const analyze = async () => {
    const response = await fetch(w.url + '/api/advice/' + randomUUID(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    expect(response.status).toBe(201);
    const result = await response.json();
    expect(isAdviceResult(result)).toBe(true);
    return result;
  };
  const undated = await analyze();
  const receiver = undated.players.find((player: RosterPlayer) => player.id === 'wr');
  expect(receiver.status).toBeUndefined();
  expect(receiver.warnings.join(' ')).toContain('no verified update date');
  expect(undated.assessment.verdict).toBe('lean');
  expect(w.calls[0]!.prompt).toContain('no verified update date');
  expect(w.calls[1]!.prompt).toContain('no verified update date');
  w.injurySnapshot.rows[0]!.updatedAt = '2026-10-07T07:00:00Z';
  const current = await analyze();
  expect(current.players.find((player: RosterPlayer) => player.id === 'wr')).toMatchObject({
    status: 'Questionable',
  });
  expect(
    current.players.find((player: RosterPlayer) => player.id === 'wr').warnings.join(' '),
  ).toContain('Limited Participation');
  const saved = await fetch(w.url + '/api/advice/' + current.id);
  expect(await saved.json()).toEqual(current);
  w.injurySnapshot.rows[0]!.reportStatus = 'Out';
  w.setResponse(() =>
    JSON.stringify({
      ...answer(),
      recommendedPlayerIds: [],
      reasons: [
        { text: 'The matched sample is {{qb:sample}}.', metricIds: ['qb:sample'], sourceIds: [] },
      ],
    }),
  );
  const out = await analyze();
  expect(
    out.players.find((player: RosterPlayer) => player.id === 'wr').projectedPoints,
  ).toBeUndefined();
  expect(out.assessment.verdict).toBe('insufficient');
  expect(out.assessment.recommendedPlayerIds).toEqual([]);
});
it('finds relevant player news below the ordinary headline cutoff in both passes and saved evidence', async () => {
  const w = await workspace(undefined, undefined, undefined, true);
  w.newsSnapshot.items = [
    ...Array.from({ length: 12 }, (_, index) => ({
      title: `Kansas City Chiefs football update ${index}`,
      source: 'Fictional News',
      url: `https://example.test/unrelated-${index}`,
      publishedAt: '2026-10-07T11:00:00Z',
    })),
    {
      title: 'Fictional Receiver returns to practice',
      source: 'Fictional News',
      url: 'https://example.test/relevant',
      publishedAt: '2026-10-06T11:00:00Z',
    },
  ];
  const response = await fetch(`${w.url}/api/advice/${randomUUID()}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  expect(response.status).toBe(201);
  const result = await response.json();
  expect(isAdviceResult(result)).toBe(true);
  expect(result.perceptionEvidence.headlines).toHaveLength(1);
  expect(result.perceptionEvidence.headlines[0].playerIds).toEqual(['wr']);
  expect(result.sources.find((s: { id: string }) => s.id === 'news-0').url).toBe(
    'https://example.test/relevant',
  );
  for (const call of w.calls) {
    expect(call.prompt).toContain('Fictional Receiver returns to practice');
    expect(call.prompt).not.toContain('Kansas City Chiefs football update');
  }
  expect(w.calls).toHaveLength(2);
  expect(w.store.snapshot().adviceResults![0]!.perceptionEvidence).toEqual(
    result.perceptionEvidence,
  );
});

it('selects recent player/team news for both passes and cannot save uncited or stale positive perception', async () => {
  const w = await workspace();
  w.newsSnapshot.items = [
    {
      title: 'Kansas City Chiefs receiver update',
      source: 'Fictional News',
      url: 'https://example.test/unrelated',
      publishedAt: '2026-10-07T11:00:00Z',
    },
    {
      title: 'Fictional Receiver returns to practice',
      source: 'Fictional News',
      url: 'https://example.test/player',
      publishedAt: '2026-10-06T11:00:00Z',
    },
    {
      title: 'Buffalo Bills offense adjusts its game plan',
      source: 'Other News',
      url: 'https://example.test/team',
      publishedAt: '2026-10-07T11:00:00Z',
    },
    {
      title: 'Fictional Receiver old role',
      source: 'Old News',
      url: 'https://example.test/old',
      publishedAt: '2026-09-01',
    },
  ];
  let cited = true;
  w.setResponse(() =>
    JSON.stringify({
      ...answer(),
      perception: {
        tone: 'positive',
        text: 'The selected media report about practice is encouraging; coverage is limited.',
        metricIds: [],
        sourceIds: cited ? ['news-0'] : ['stats-2026'],
      },
    }),
  );
  const post = () =>
    fetch(`${w.url}/api/advice/${randomUUID()}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
  const response = await post();
  expect(response.status).toBe(201);
  const result = await response.json();
  expect(isAdviceResult(result)).toBe(true);
  if (!isAdviceResult(result)) throw new Error('Invalid perception evidence');
  expect(result.assessment.perception.tone).toBe('positive');
  expect(
    isAdviceResult({
      ...result,
      perceptionEvidence: { ...result.perceptionEvidence, feedStatus: ['current'] },
    }),
  ).toBe(false);
  expect(
    isAdviceResult({
      ...result,
      perceptionEvidence: { ...result.perceptionEvidence, checkedAt: undefined },
    }),
  ).toBe(false);
  expect(result.perceptionEvidence?.headlines).toHaveLength(2);
  expect(result.perceptionEvidence?.headlines[0]?.playerIds).toEqual(['wr']);
  expect(result.perceptionEvidence?.headlines[1]?.teamCodes).toEqual(['BUF']);
  expect(result.sources.find((source) => source.id === 'news-0')?.retrievedAt).toBe(
    w.newsSnapshot.refreshedAt,
  );
  expect(result.perceptionEvidence?.headlines[0]?.publishedAt).toBe('2026-10-06T11:00:00Z');
  for (const call of w.calls) {
    expect(call.prompt).toContain('perceptionEvidence');
    expect(call.prompt).not.toContain('Kansas City Chiefs');
    expect(call.prompt).not.toContain('old role');
  }
  const malformed = structuredClone(result);
  malformed.perceptionEvidence!.headlines[0]!.sourceId = 'invented';
  expect(isAdviceResult(malformed)).toBe(false);
  malformed.perceptionEvidence!.headlines[0]!.sourceId = 'news-0';
  malformed.perceptionEvidence!.headlines[0]!.publishedAt = '2026-10-08';
  expect(isAdviceResult(malformed)).toBe(false);
  const legacy = structuredClone(result);
  delete legacy.perceptionEvidence;
  expect(isAdviceResult(legacy)).toBe(true);
  w.newsSnapshot.stale = true;
  const stale = await post();
  expect(stale.status).toBe(201);
  expect((await stale.json()).assessment.perception.tone).toBe('unknown');
  w.newsSnapshot.stale = false;
  cited = false;
  const uncited = await post();
  expect(uncited.status).toBe(201);
  expect((await uncited.json()).assessment.perception.tone).toBe('unknown');
});

it('uses catalog Sleeper mappings for Yahoo/ESPN and GSIS prop evidence without new credentials', async () => {
  const w = await workspace();
  w.catalog.set('sleeper-wr', {
    id: 'sleeper-wr',
    name: 'Fictional Receiver',
    position: 'WR',
    nflTeam: 'BUF',
    gsisId: 'gsis-wr',
    yahooId: 'wr',
    espnId: 'wr',
  });
  w.data.market.push({ sleeperId: 'sleeper-wr', adds: 23, lookbackHours: 24 });
  w.data.sources.push({
    id: 'market-add',
    name: 'Sleeper activity',
    status: 'available',
    retrievedAt: w.newsSnapshot.refreshedAt,
  });
  w.setResponse(() =>
    JSON.stringify({
      ...answer(),
      recommendedPlayerIds: [],
      reasons: [
        {
          text: 'The matched sample is {{wr:sample}}.',
          metricIds: ['wr:sample'],
          sourceIds: ['games'],
        },
      ],
    }),
  );
  for (const platform of ['yahoo', 'espn'] as const) {
    await w.store.update((state) => {
      state.leagues[0]!.platform = platform;
    });
    const response = await fetch(`${w.url}/api/advice/${randomUUID()}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    expect(response.status).toBe(201);
    const result = await response.json();
    expect(isAdviceResult(result)).toBe(true);
    expect(result.perceptionEvidence.activityMetricIds).toEqual(['wr:market-adds']);
    expect(result.assessment.perception.tone).toBe('unknown');
    expect(result.players.find((player: { id: string }) => player.id === 'wr').metrics).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'wr:market-adds', value: 23 })]),
    );
  }
  w.setResponse(() =>
    JSON.stringify({
      ...answer(),
      verdict: 'lean',
      recommendedPlayerIds: ['gsis-wr'],
      reasons: [
        {
          text: 'Matched activity is {{gsis-wr:market-adds}}.',
          metricIds: ['gsis-wr:market-adds'],
          sourceIds: ['market-add'],
        },
      ],
    }),
  );
  const response = await fetch(`${w.url}/api/advice/${randomUUID()}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode: 'betting',
      bet: {
        kind: 'player-prop',
        gameId: 'upcoming',
        playerId: 'gsis-wr',
        stat: 'receiving_yards',
        side: 'over',
        line: 80.5,
        americanOdds: -110,
      },
    }),
  });
  expect(response.status).toBe(201);
  const result = await response.json();
  expect(isAdviceResult(result)).toBe(true);
  expect(result.perceptionEvidence.activityMetricIds).toEqual(['gsis-wr:market-adds']);
  expect(
    result.players[0].metrics.find((metric: { id: string }) => metric.id === 'gsis-wr:market-adds')
      .value,
  ).toBe(23);
});
it('grounds both model passes in role/opponent context and preserves its sources, caveats and matchup in history', async () => {
  const w = await workspace();
  for (const row of w.data.players) {
    row.stats.targets = row.position === 'WR' ? (row.week <= 2 ? 4 : 8) : 0;
    row.stats.attempts = row.position === 'QB' ? 30 : 0;
  }
  w.setResponse(() =>
    JSON.stringify({
      ...answer(),
      reasons: [
        {
          text: 'Recent role is {{wr:recent-targets}}, against a position total of {{wr:opponent-receiving_yards}}.',
          metricIds: ['wr:recent-targets', 'wr:opponent-receiving_yards'],
          sourceIds: ['stats-2026', 'games'],
        },
      ],
    }),
  );
  const response = await fetch(`${w.url}/api/advice/${randomUUID()}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  expect(response.status).toBe(201);
  const result = await response.json();
  expect(isAdviceResult(result)).toBe(true);
  if (!isAdviceResult(result)) throw new Error('Invalid enriched result');
  const receiver = result.players.find((player) => player.id === 'wr')!;
  expect(receiver.matchup).toEqual({
    gameId: 'upcoming',
    opponent: 'MIA',
    home: true,
    date: '2026-10-11',
  });
  expect(receiver.metrics.find((metric) => metric.id === 'wr:recent-targets')?.value).toBe(8);
  expect(receiver.metrics.find((metric) => metric.id === 'wr:recorded-targets-share')?.value).toBe(
    100,
  );
  expect(
    receiver.metrics.find((metric) => metric.id === 'wr:opponent-receiving_yards')?.sampleSize,
  ).toBe(4);
  expect(
    receiver.metrics.find((metric) => metric.id === 'wr:history-receiving_yards'),
  ).toBeUndefined();
  expect(w.calls).toHaveLength(2);
  for (const call of w.calls) {
    expect(call.prompt).toContain('Not an individual projection');
    expect(call.prompt).toContain('not snap share');
    expect(call.prompt).toContain('wr:change-targets');
  }
  expect(w.store.snapshot().adviceResults?.[0]?.players).toEqual(result.players);
  const malformed = structuredClone(result);
  malformed.players[0]!.matchup!.date = '2026-02-30';
  expect(isAdviceResult(malformed)).toBe(false);
  const older = structuredClone(result);
  for (const player of older.players) delete player.matchup;
  expect(isAdviceResult(older)).toBe(true);
});
it('fits a large roster without dropping comparison players or primary estimates and discloses omitted detail', async () => {
  const w = await workspace();
  const extras = Array.from({ length: 34 }, (_, i) => ({
    id: `extra-${i}`,
    gsisId: `gsis-extra-${i}`,
    name: `Fictional Additional Receiver ${i}`,
    position: 'WR',
    nflTeam: 'BUF',
  }));
  await w.store.update((state) => {
    state.leagues[0]!.teams[0]!.roster!.push(...extras);
    state.leagues[0]!.teams[0]!.rosterSize = 36;
  });
  for (const extra of extras)
    for (let week = 1; week <= 4; week++) {
      w.data.players.push({
        playerId: extra.gsisId,
        name: extra.name,
        position: 'WR',
        team: 'BUF',
        opponent: 'MIA',
        gameId: `week-${week}`,
        season: 2026,
        week,
        seasonType: 'REG',
        stats: {
          passing_yards: 0,
          receptions: 5,
          receiving_yards: 70,
          targets: 8,
          carries: 0,
          rushing_yards: 0,
        },
      });
    }
  for (const row of w.data.players) row.stats.targets ??= 0;
  const response = await fetch(`${w.url}/api/advice/${randomUUID()}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  expect(response.status).toBe(201);
  const result = await response.json();
  expect(isAdviceResult(result)).toBe(true);
  if (!isAdviceResult(result)) throw new Error('Invalid large comparison');
  expect(result.players).toHaveLength(36);
  expect(result.metrics.some((metric) => metric.id === 'lineup-optimized')).toBe(true);
  expect(
    result.players.every(
      (player) =>
        player.projectedPoints !== undefined &&
        player.metrics.some((metric) => metric.id.endsWith(':projected')),
    ),
  ).toBe(true);
  expect(result.warnings.join(' ')).toContain('secondary historical/team metrics were omitted');
  expect(w.calls.every((call) => Buffer.byteLength(call.prompt) < 120_000)).toBe(true);
  expect(JSON.stringify(result).length).toBeLessThanOrEqual(180_000);
});
it('discovers deeper models without generation and applies an explicit override without changing settings or reusing prices', async () => {
  const w = await workspace({ models: ['gpt-6.1-sol', 'gpt-6-astra', 'gpt-image-1'] });
  await w.store.update((state) => {
    state.settings.aiRuntime!.baseUrl = 'https://api.openai.com/v1';
  });
  const before = w.store.settingsSnapshot();
  const options = (await (
    await fetch(`${w.url}/api/advice/options?league=league&mode=lineup`)
  ).json()) as { recommendedModel: string; models: { id: string }[] };
  expect(options.recommendedModel).toBe('gpt-6-astra');
  expect(options.models.map((model) => model.id)).not.toContain('gpt-image-1');
  expect(w.calls).toHaveLength(0);
  const response = await fetch(`${w.url}/api/advice/${randomUUID()}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...request, model: options.recommendedModel }),
  });
  expect(response.status).toBe(201);
  const result = (await response.json()) as { model: string; usage: { estimatedCostUsd?: number } };
  expect(result.model).toBe('gpt-6-astra');
  expect(result.usage).not.toHaveProperty('estimatedCostUsd');
  expect(w.configurations[0]?.aiRuntime?.model).toBe('gpt-6-astra');
  expect(w.store.settingsSnapshot()).toEqual(before);
  expect(
    w.calls.every(
      (call) =>
        call.reasoningEffort === 'high' &&
        call.timeoutMs === 120_000 &&
        call.maxOutputTokens === 16_384,
    ),
  ).toBe(true);
});
it('keeps saved model usable on discovery failure but refuses unavailable overrides before generation', async () => {
  const w = await workspace({ failure: true });
  const options = (await (
    await fetch(`${w.url}/api/advice/options?league=league&mode=lineup`)
  ).json()) as { warnings: string[]; models: { id: string }[] };
  expect(options.models).toEqual([{ id: 'existing-model', reasoning: false }]);
  expect(options.warnings.join(' ')).not.toContain('private provider');
  const post = (model: string) =>
    fetch(`${w.url}/api/advice/${randomUUID()}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...request, model }),
    });
  expect((await post('unavailable')).status).toBe(502);
  expect(w.calls).toHaveLength(0);
  expect((await post('existing-model')).status).toBe(201);
});
it('enforces insufficient evidence even when the model attempts a pick using only a game count', async () => {
  const w = await workspace();
  await w.store.update((state) => {
    state.leagues[0]!.teams[0]!.rosterSize = 3;
  });
  w.setResponse(() =>
    JSON.stringify({
      ...answer(),
      recommendedPlayerIds: [],
      reasons: [
        { text: 'History includes {{qb:sample}}.', metricIds: ['qb:sample'], sourceIds: [] },
      ],
    }),
  );
  const response = await fetch(`${w.url}/api/advice/${randomUUID()}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  expect(response.status).toBe(201);
  const result = (await response.json()) as { assessment: AdviceAssessment };
  expect(result.assessment.verdict).toBe('insufficient');
  expect(result.assessment.headline).toBe('More evidence is needed before choosing');
  expect(result.assessment.recommendedPlayerIds).toEqual([]);
  expect(w.calls[0]?.prompt).toContain('maximumVerdict');
});
it('cancels an in-flight analysis and rejects a late provider completion without saving it', async () => {
  const w = await workspace(),
    id = randomUUID();
  let started: () => void = () => {},
    release: () => void = () => {};
  const began = new Promise<void>((resolve) => {
    started = resolve;
  });
  w.setResponse(async () => {
    started();
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return JSON.stringify(answer());
  });
  const post = fetch(`${w.url}/api/advice/${id}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  await began;
  expect((await fetch(`${w.url}/api/advice/${id}`)).status).toBe(202);
  expect(
    (
      await fetch(`${w.url}/api/advice/${randomUUID()}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      })
    ).status,
  ).toBe(409);
  await fetch(`${w.url}/api/advice/${id}`, { method: 'DELETE' });
  release();
  expect((await post).status).toBe(408);
  expect(w.store.snapshot().adviceResults).toEqual([]);
  expect(w.calls).toHaveLength(1);
});
it('reuses the existing model for analysis and review, persists verified advice, and deduplicates completed request IDs', async () => {
  const w = await workspace(),
    id = randomUUID();
  const post = () =>
    fetch(`${w.url}/api/advice/${id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
  const first = await post(),
    value: unknown = await first.json();
  expect(first.status).toBe(201);
  expect(isAdviceResult(value)).toBe(true);
  if (!isAdviceResult(value)) throw new Error('Invalid advice fixture result');
  expect(value.model).toBe('existing-model');
  expect(value.usage).toMatchObject({
    inputTokens: 200,
    outputTokens: 100,
    estimatedCostUsd: 0.0004,
  });
  expect(w.calls).toHaveLength(2);
  expect(w.calls[1]?.prompt).toContain('untrusted_proposed_answer');
  expect(w.calls.every((call) => call.reasoningEffort === 'high')).toBe(true);
  expect((await post()).status).toBe(200);
  expect(w.calls).toHaveLength(2);
  expect(w.store.dashboardSummarySnapshot()).not.toHaveProperty('adviceResults');
  const second = new LocalStore(
    join(w.directory, 'state.sqlite'),
    join(w.directory, 'missing.json'),
  );
  await second.load();
  expect(second.snapshot().adviceResults?.[0]?.id).toBe(id);
  second.close();
  const backup = join(w.directory, 'advice-backup.sqlite');
  await w.store.backupTo(backup);
  const bytes = await readFile(backup);
  await w.store.validateBackupBuffer(bytes);
  await w.store.update((state) => {
    state.adviceResults = [];
  });
  await w.store.restoreFromBuffer(bytes);
  expect(w.store.snapshot().adviceResults?.[0]?.id).toBe(id);
  expect((await fetch(`${w.url}/api/advice/${id}`)).status).toBe(200);
  expect((await fetch(`${w.url}/api/advice/${id}`, { method: 'DELETE' })).status).toBe(204);
  expect(w.store.snapshot().adviceResults).toEqual([]);
});

it('validates bet terms against the schedule and separates model probability from historical facts', async () => {
  const w = await workspace();
  w.setResponse(() =>
    JSON.stringify({
      ...answer(),
      verdict: 'recommend',
      recommendedPlayerIds: [],
      reasons: [
        {
          text: 'The entered odds need {{odds-break-even}}.',
          metricIds: ['odds-break-even'],
          sourceIds: ['entered-odds'],
        },
      ],
      forecast: {
        probability: 0.6,
        lower: 0.4,
        upper: 0.8,
        rationale: {
          text: 'An uncalibrated judgment with opponent uncertainty.',
          metricIds: [],
          sourceIds: ['model-judgment'],
        },
      },
    }),
  );
  const bet = {
    mode: 'betting',
    week: 18,
    bet: { kind: 'spread', gameId: 'upcoming', side: 'home', line: -3.5, americanOdds: -110 },
  };
  const response = await fetch(`${w.url}/api/advice/${randomUUID()}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(bet),
  });
  expect(response.status).toBe(201);
  const result: unknown = await response.json();
  expect(isAdviceResult(result)).toBe(true);
  if (!isAdviceResult(result)) throw new Error('Invalid betting result');
  expect(result.week).toBe(5);
  expect(result.assessment.verdict).toBe('insufficient');
  expect(result.metrics.find((metric) => metric.id === 'bet-model-probability')?.value).toBe(60);
  expect(result.betHistory?.historicalRate).toBe(0);
  expect(result.confidence.score).toBeLessThan(50);
  const count = w.calls.length;
  const invalid = await fetch(`${w.url}/api/advice/${randomUUID()}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...bet, bet: { ...bet.bet, gameId: 'week-1' } }),
  });
  expect(invalid.status).toBe(502);
  expect(w.calls).toHaveLength(count);
});

it('repairs invalid first-pass output without exposing it to the review or saved result', async () => {
  const w = await workspace();
  w.setResponse((request) =>
    request.prompt.includes('untrusted_proposed_answer')
      ? JSON.stringify(answer())
      : 'UNVERIFIED PRIVATE RAW RESPONSE',
  );
  const response = await fetch(`${w.url}/api/advice/${randomUUID()}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  expect(response.status).toBe(201);
  expect(w.calls[1]!.prompt).not.toContain('UNVERIFIED PRIVATE RAW RESPONSE');
  expect(w.calls[1]!.prompt).toContain('failed JSON structure or evidence-reference checks');
  expect(JSON.stringify(w.store.snapshot().adviceResults)).not.toContain(
    'UNVERIFIED PRIVATE RAW RESPONSE',
  );
});
it('gives the review fixed numeric-format feedback without forwarding the rejected answer', async () => {
  const w = await workspace();
  w.setResponse((input) =>
    JSON.stringify(
      input.prompt.includes('untrusted_proposed_answer')
        ? answer()
        : { ...answer(), headline: 'Start QB1 PRIVATE REJECTED MARKER' },
    ),
  );
  const response = await fetch(`${w.url}/api/advice/${randomUUID()}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  expect(response.status).toBe(201);
  expect(w.calls[1]!.prompt).toContain('failed the numeric-text rule');
  expect(w.calls[1]!.prompt).toContain('no digits in headline or prose');
  expect(w.calls[1]!.prompt).not.toContain('PRIVATE REJECTED MARKER');
  expect(JSON.stringify(w.store.snapshot().adviceResults)).not.toContain('PRIVATE REJECTED MARKER');
  expect(w.calls).toHaveLength(2);
});
it('rejects unsupported numbers/players/links instead of saving or exposing a raw model error', async () => {
  const w = await workspace();
  w.setResponse(() =>
    JSON.stringify({
      ...answer(),
      reasons: [
        {
          text: 'Win probability is 99 percent. https://private.example/token',
          metricIds: [],
          sourceIds: [],
        },
      ],
    }),
  );
  const response = await fetch(`${w.url}/api/advice/${randomUUID()}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  expect(response.status).toBe(502);
  expect(await response.text()).not.toContain('private.example');
  expect(w.store.snapshot().adviceResults).toEqual([]);
});
it('loads keyless choices without model calls and validates malformed modes/odds before spending tokens', async () => {
  const w = await workspace();
  expect((await fetch(`${w.url}/api/advice/options?league=league&mode=lineup`)).status).toBe(200);
  expect(w.calls).toEqual([]);
  for (const body of [
    { ...request, mode: ['lineup'] },
    { ...request, maxOutputTokens: 16_385 },
    {
      mode: 'betting',
      bet: { kind: 'moneyline', gameId: 'upcoming', side: 'home', americanOdds: 0 },
    },
  ]) {
    expect(
      (
        await fetch(`${w.url}/api/advice/${randomUUID()}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
      ).status,
    ).toBe(400);
  }
  expect(w.calls).toEqual([]);
});
it('keeps previously valid saved metric declarations readable while enforcing stricter new answers', async () => {
  const w = await workspace();
  const response = await fetch(`${w.url}/api/advice/${randomUUID()}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...request, maxOutputTokens: 4096 }),
  });
  expect(response.status).toBe(201);
  expect(w.calls.every((call) => call.maxOutputTokens === 4096)).toBe(true);
  await w.store.update((state) => {
    state.adviceResults![0]!.assessment.reasons[0]!.text =
      'Compare the declared evidence before acting.';
  });
  const reopened = new LocalStore(
    join(w.directory, 'state.sqlite'),
    join(w.directory, 'missing.json'),
  );
  try {
    await reopened.load();
    expect(reopened.snapshot().adviceResults![0]!.assessment.reasons[0]!.text).toBe(
      'Compare the declared evidence before acting.',
    );
  } finally {
    reopened.close();
  }
});

it('uses signed-in Codex explicitly for the fixed probe and both decision passes, preserving saved configuration', async () => {
  const calls: AIRequest[] = [];
  const w = await workspace(undefined, undefined, {
    status: async () => 'signed-in',
    provider: async () => ({
      id: 'codex-cli',
      generate: async (input) => {
        calls.push(input);
        return input.prompt === 'Return only {"ok":true}.'
          ? '{"ok":true}'
          : JSON.stringify(answer());
      },
    }),
  });
  const settings = w.store.settingsSnapshot();
  const choices = await (
    await fetch(`${w.url}/api/advice/options?league=league&connection=codex-cli`)
  ).json();
  expect(choices).toMatchObject({
    connection: 'codex-cli',
    model: 'gpt-6.1-sol',
    recommendedModel: 'gpt-6.1-sol',
    connections: [{ id: 'saved' }, { id: 'codex-cli', status: 'signed-in' }],
  });
  expect(calls).toHaveLength(0);
  expect(
    (
      await fetch(`${w.url}/api/advice/connection-test`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"connection":"codex-cli"}',
      })
    ).status,
  ).toBe(200);
  expect(calls[0]!.prompt).toBe('Return only {"ok":true}.');
  const body = { ...request, connection: 'codex-cli', model: 'gpt-6.1-sol' };
  const response = await fetch(`${w.url}/api/advice/${randomUUID()}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(201);
  const result = await response.json();
  expect(isAdviceResult(result)).toBe(true);
  expect(result.model).toBe('Codex GPT-6.1-Sol · signed-in CLI');
  expect(result.request.connection).toBe('codex-cli');
  expect(calls).toHaveLength(3);
  expect(calls.every((call) => call.reasoningEffort === 'high')).toBe(true);
  expect(w.configurations).toHaveLength(0);
  expect(w.store.settingsSnapshot()).toEqual(settings);
  for (const model of ['opus', 'arbitrary']) {
    expect(
      (
        await fetch(`${w.url}/api/advice/${randomUUID()}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...body, model }),
        })
      ).status,
    ).toBe(502);
  }
  expect(calls).toHaveLength(3);
});
it('Codex login failures never use the saved provider or persist advice', async () => {
  const w = await workspace(undefined, undefined, {
    status: async () => 'signed-out',
    provider: async () => {
      throw new Error('private account details');
    },
  });
  const response = await fetch(`${w.url}/api/advice/${randomUUID()}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...request, connection: 'codex-cli' }),
  });
  expect(response.status).toBe(502);
  expect(JSON.stringify(await response.json())).not.toContain('private');
  expect(w.configurations).toHaveLength(0);
  expect(w.store.snapshot().adviceResults ?? []).toHaveLength(0);
});

it('checks data readiness without model configuration, AI calls or journal writes', async () => {
  const w = await workspace();
  const before = w.store.snapshot();
  const response = await fetch(w.url + '/api/advice/readiness', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode: 'lineup',
      leagueId: 'league',
      teamId: 'mine',
      season: 2026,
      week: 5,
    }),
  });
  expect(response.status).toBe(200);
  const report = await response.json();
  expect(report).toMatchObject({ status: 'limited', projectionTotal: 2 });
  expect(report.items.some((i: { name: string }) => i.name === 'Injury report coverage')).toBe(
    true,
  );
  expect(w.calls).toEqual([]);
  expect(w.configurations).toEqual([]);
  expect(w.store.snapshot()).toEqual(before);
  const journal = await (await fetch(w.url + '/api/advice/journal')).json();
  expect(journal.decisions).toEqual([]);
  expect(journal.experiments).toEqual([]);
  const invalid = await fetch(w.url + '/api/advice/readiness', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode: 'lineup',
      leagueId: 'league',
      teamId: 'not-owned',
      season: 2026,
      week: 5,
    }),
  });
  expect(await invalid.json()).toMatchObject({ status: 'blocked' });
});

it('saved Codex advice advertises its fixed model, omits unsupported budgets and API pricing', async () => {
  const w = await workspace();
  await w.store.update((state) => {
    state.settings.aiRuntime = {
      ...state.settings.aiRuntime!,
      mode: 'codex-cli',
      model: 'gpt-6.1-sol',
      command: '',
      args: '',
    };
  });
  const options = await (await fetch(w.url + '/api/advice/options?league=league')).json();
  expect(options.model).toBe('gpt-6.1-sol');
  expect(options.tokenBudgetSupported).toBe(false);
  const response = await fetch(w.url + '/api/advice/' + randomUUID(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'lineup',
      leagueId: 'league',
      teamId: 'mine',
      model: 'gpt-6.1-sol',
    }),
  });
  expect(response.status).toBe(201);
  const result = await response.json();
  expect(isAdviceResult(result)).toBe(true);
  expect(result.model).toBe('gpt-6.1-sol');
  expect(result.usage.estimatedCostUsd).toBeUndefined();
  expect(w.calls).toHaveLength(2);
  expect(
    w.calls.every((call) => call.maxOutputTokens === undefined && call.reasoningEffort === 'high'),
  ).toBe(true);
});

it('shares the weekly briefing for two minutes but never past a kickoff', async () => {
  const w = await workspace();
  const start = Date.parse('2026-10-07T12:00:00Z');
  w.setNow(start);
  const game = w.data.games.find((g) => g.season === 2026 && g.week === 5)!;
  game.kickoffAt = new Date(start + 60_000).toISOString();
  const asOf = async () =>
    (await (await fetch(`${w.url}/api/advice/briefing?league=league&team=mine`)).json()).asOf;
  const first = await asOf();
  w.setNow(start + 30_000);
  expect(await asOf()).toBe(first);
  // Past the kickoff, well inside two minutes: recomputed.
  w.setNow(start + 90_000);
  expect(await asOf()).not.toBe(first);
});

it('lists watched players from the shared weekly evidence', async () => {
  const w = await workspace();
  await w.store.update((state) => {
    state.settings.preferences = {
      watchlist: [{ leagueId: 'league', playerId: 'wr', name: 'Fictional Receiver' }],
    };
  });
  const response = await fetch(`${w.url}/api/advice/watchlist?league=league&team=mine`);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.items).toEqual([
    expect.objectContaining({ id: 'wr', name: 'Fictional Receiver', rosteredBy: 'Mine' }),
  ]);
  expect(w.calls).toEqual([]);
});

it('lists the league player pool for pickers without touching the AI provider', async () => {
  const w = await workspace();
  const response = await fetch(`${w.url}/api/advice/players?league=league`);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.players.length).toBeGreaterThan(0);
  expect(Object.keys(body.players[0]).sort()).toEqual(
    expect.arrayContaining(['id', 'name', 'position']),
  );
  expect(w.calls).toEqual([]);
  expect(w.configurations).toEqual([]);
  expect((await fetch(`${w.url}/api/advice/players?league=missing`)).status).toBe(400);
});

it('builds the weekly briefing deterministically without any AI configuration or call', async () => {
  const w = await workspace();
  const response = await fetch(`${w.url}/api/advice/briefing?league=league&team=mine`);
  expect(response.status).toBe(200);
  const briefing = await response.json();
  expect(briefing).toMatchObject({ leagueId: 'league', teamId: 'mine', week: 5 });
  expect(briefing.coverage.total).toBe(2);
  expect(Array.isArray(briefing.lineup.changes)).toBe(true);
  expect(Array.isArray(briefing.waivers)).toBe(true);
  expect(w.calls).toEqual([]);
  expect(w.configurations).toEqual([]);
  expect((await fetch(`${w.url}/api/advice/briefing?league=league&team=nobody`)).status).toBe(404);
  expect((await fetch(`${w.url}/api/advice/briefing?league=league`)).status).toBe(400);
  expect((await fetch(`${w.url}/api/advice/briefing?league=league&team=mine&extra=1`)).status).toBe(
    400,
  );
});
