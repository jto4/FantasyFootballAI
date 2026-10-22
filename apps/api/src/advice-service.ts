import { freezeForecastProtocol } from './forecast-protocol.js';
import { randomUUID } from 'node:crypto';
import {
  buildAdviceReadiness,
  type AdviceDataReadiness,
  adviceDecisionPolicy,
  enforceAdviceDecisionPolicy,
  analyzeBetHistory,
  buildFantasyAdvicePlan,
  validateLineupAssessment,
  validateStartSitAssessment,
  buildPlayerEvidence,
  buildFootballContext,
  buildAdvicePerception,
  buildPlayerMarketEvidence,
  buildBetForecast,
  enforceAdvicePerception,
  isAdviceResult,
  nflTeamKey,
  isUpcomingFootballGame,
  isInactiveFootballStatus,
  weeklyGameWithheldWarning,
  validateAdviceAssessment,
  type AdviceAssessment,
  type AdviceConnection,
  type AdviceOptions,
  type AdviceRequest,
  type AdviceResult,
  type PredictionRecord,
  type AIProvider,
  type AppSettings,
  type FootballDataSource,
  type LeagueConnection,
  type PlayerAdviceEvidence,
  type RosterPlayer,
  capturePredictionRecords,
  liveMatchup,
  rankWaivers,
  findTrades,
  captureDecisionSnapshot,
  maximumPredictionRecords,
  maximumPredictionBytes,
  type SportsbookQuote,
} from '@sidekick/core';
import type {
  FootballNewsCache,
  NFLInjuryReportCache,
  PublicFootballData,
  SignedInAIConnection,
  PublicSportsbookLines,
  PublicPropLines,
  PublicNflScoreboard,
} from '@sidekick/integrations';
import {
  adviceModelChoices,
  adviceInjuryEvidence,
  signedInCodexModel,
} from '@sidekick/integrations';
import type { LocalStore } from './store.js';
import { promptDataBlock } from './prompt-data.js';
import { adviceReasoningInstructions } from './advice-prompts.js';
import { playerPool } from './advice-player-pool.js';
import { reconcileAdviceSelection } from './advice-selection.js';
import { projectionSourceId } from './projections.js';
import { budgetAdviceEvidence, compactAdviceEvidence } from './advice-evidence-budget.js';

export interface AdviceDependencies {
  store: Pick<LocalStore, 'snapshot' | 'settingsSnapshot' | 'update'>;
  data: Pick<PublicFootballData, 'get'> & Partial<Pick<PublicFootballData, 'outcomes'>>;
  catalog: () => Promise<Map<string, RosterPlayer>>;
  news: Pick<FootballNewsCache, 'get'> & Partial<Pick<FootballNewsCache, 'getForAdvice'>>;
  injuries: Pick<NFLInjuryReportCache, 'get'>;
  pregame?: import('@sidekick/integrations').PregameEvidenceProvider;
  configuredAI: (settings: AppSettings) => Promise<AIProvider | null>;
  /** Model metadata only, using the existing endpoint/credential; no generation. */
  discoverModels?: (settings: AppSettings) => Promise<string[]>;
  signedInAI?: SignedInAIConnection;
  signedInCodex?: SignedInAIConnection;
  odds?: Pick<PublicSportsbookLines, 'get' | 'verify' | 'result'>;
  props?: Pick<PublicPropLines, 'props' | 'books'>;
  scoreboard?: Pick<PublicNflScoreboard, 'current'>;
  now?: () => number;
}

/** Deterministic Home summary; contains no AI output and no private league members' data. */
export interface LineupAlerts {
  leagueId: string;
  teamId: string;
  leagueName: string;
  week: number;
  alerts: {
    playerId: string;
    name: string;
    reason: 'out' | 'doubtful' | 'bye';
    status?: string;
    kickoffAt?: string;
  }[];
  /** Earliest upcoming kickoff among this week's starters. */
  nextKickoffAt?: string;
  /** Present for imported leagues, which cannot refresh on their own. */
  snapshot?: { importedAt?: string; stale: boolean };
}
export interface WeeklyBriefing {
  leagueId: string;
  teamId: string;
  week: number;
  asOf: string;
  coverage: { known: number; total: number; alreadyPlayed: number };
  lineup: {
    complete: boolean;
    points?: number;
    comparedWeek?: number;
    changes: {
      slot: string;
      start: { id: string; name: string; points: number };
      bench?: { id: string; name: string; points?: number };
    }[];
  };
  availability: {
    id: string;
    name: string;
    status: string;
    basis: 'dated-report' | 'this-week-report' | 'roster';
    validUntil?: string;
  }[];
  waivers: { id: string; name: string; position: string; gain: number }[];
  notes: string[];
  matchup?: {
    week: number;
    you: MatchupSide;
    opponent: MatchupSide;
  };
}

export interface MatchupSide {
  teamId: string;
  name: string;
  /** Platform-recorded score; may be live during games. */
  points?: number;
  starters: { id: string; name: string; position: string; estimate?: number }[];
  /** Sum of starter estimates, only when every starter has one for this week. */
  projected?: number;
}

export class AdviceGameTimingError extends Error {
  constructor() {
    super('NFL game timing is not verified as upcoming.');
  }
}
export class AdviceQuoteError extends Error {
  constructor() {
    super(
      'The selected live price changed, expired or could not be verified. Fetch prices again or enter a price manually.',
    );
  }
}

export function createAdviceService(deps: AdviceDependencies) {
  const signedConnection = (connection: AdviceConnection | undefined) =>
    connection === 'codex-cli'
      ? deps.signedInCodex
      : connection === 'claude-cli'
        ? deps.signedInAI
        : undefined;
  const signedModel = (connection: AdviceConnection | undefined) =>
    connection === 'codex-cli' ? signedInCodexModel : 'opus';
  const signedLabel = (connection: AdviceConnection | undefined) =>
    connection === 'codex-cli'
      ? 'Codex GPT-6.1-Sol · signed-in CLI'
      : 'Claude Opus · signed-in CLI';
  const now = deps.now ?? Date.now;
  const seasonNow = () => {
    const date = new Date(now());
    return date.getUTCMonth() < 2 ? date.getUTCFullYear() - 1 : date.getUTCFullYear();
  };
  function leagueFor(
    request: Pick<AdviceRequest, 'mode' | 'leagueId'>,
  ): LeagueConnection | undefined {
    const league = deps.store.snapshot().leagues.find((row) => row.id === request.leagueId);
    if (request.mode !== 'betting' && !league)
      throw new Error('Choose a connected league for fantasy advice.');
    return league;
  }
  async function load(
    request: Pick<AdviceRequest, 'mode' | 'leagueId' | 'season' | 'week'>,
    signal?: AbortSignal,
  ) {
    const league = leagueFor(request);
    const season = request.season ?? league?.season ?? seasonNow();
    if (league?.season !== undefined && season !== league.season && request.mode !== 'betting')
      throw new Error('Choose the connected league’s season.');
    const [dataResult, catalogResult] = await Promise.allSettled([
      deps.data.get(season),
      deps.catalog(),
    ]);
    signal?.throwIfAborted();
    if (dataResult.status === 'rejected') throw new Error('Public football data is unavailable.');
    const data = dataResult.value;
    const warnings = [...data.warnings];
    const catalog =
      catalogResult.status === 'fulfilled' ? catalogResult.value : new Map<string, RosterPlayer>();
    if (!catalog.size)
      warnings.push(
        'Player identity/availability catalog is unavailable. Confirm names and current status.',
      );
    const nextGame = data.games
      .filter(
        (game) =>
          game.season === season && isUpcomingFootballGame(game, new Date(now()).toISOString()),
      )
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    const reported =
      typeof league?.settings.currentWeek === 'number' &&
      Number.isInteger(league.settings.currentWeek) &&
      league.settings.currentWeek >= 1 &&
      league.settings.currentWeek <= 18
        ? league.settings.currentWeek
        : undefined;
    const week = request.week ?? reported ?? nextGame?.week ?? 1;
    const players = playerPool(league, data, catalog, request.mode === 'betting');
    return { league, season, week, players, data, warnings };
  }
  async function options(
    request: Pick<AdviceRequest, 'mode' | 'leagueId' | 'season' | 'week' | 'connection'>,
  ): Promise<AdviceOptions> {
    const [loaded, choice, signedInStatus, codexStatus] = await Promise.all([
      load(request),
      request.connection && request.connection !== 'saved'
        ? Promise.resolve({
            selection: {
              models: [{ id: signedModel(request.connection), reasoning: true }],
              recommendedModel: signedModel(request.connection),
            },
            warnings: [] as string[],
          })
        : models(deps.store.settingsSnapshot()),
      deps.signedInAI?.status().catch(() => 'unavailable' as const),
      deps.signedInCodex?.status().catch(() => 'unavailable' as const),
    ]);
    const owner = new Map(
      loaded.league?.teams.flatMap((team) =>
        (team.roster ?? []).map((player) => [player.id, team.id] as const),
      ),
    );
    return {
      season: loaded.season,
      week: loaded.week,
      tokenBudgetSupported:
        request.connection !== 'codex-cli' &&
        !(
          (!request.connection || request.connection === 'saved') &&
          deps.store.settingsSnapshot().aiRuntime?.mode === 'codex-cli'
        ),
      model:
        request.connection && request.connection !== 'saved'
          ? signedModel(request.connection)
          : modelName(deps.store.settingsSnapshot()),
      ...(deps.signedInAI || deps.signedInCodex
        ? {
            connection: request.connection ?? 'saved',
            connections: [
              { id: 'saved' as const, label: 'Saved AI connection', status: 'saved' as const },
              ...(deps.signedInAI
                ? [
                    {
                      id: 'claude-cli' as const,
                      label: 'Signed-in Claude · Opus',
                      status: signedInStatus ?? ('unavailable' as const),
                    },
                  ]
                : []),
              ...(deps.signedInCodex
                ? [
                    {
                      id: 'codex-cli' as const,
                      label: 'Signed-in Codex · GPT-6.1-Sol (experimental)',
                      status: codexStatus ?? ('unavailable' as const),
                    },
                  ]
                : []),
            ],
          }
        : {}),
      ...choice.selection,
      players: loaded.players.map((player) => ({
        id: player.id,
        name: player.name,
        position: player.position ?? '',
        ...(player.nflTeam ? { nflTeam: player.nflTeam } : {}),
        ...(owner.get(player.id) ? { teamId: owner.get(player.id)! } : {}),
      })),
      games: loaded.data.games
        .filter(
          (game) =>
            game.season === loaded.season &&
            isUpcomingFootballGame(game, new Date(now()).toISOString()),
        )
        .slice(0, 400),
      warnings: [...loaded.warnings, ...choice.warnings],
    };
  }
  async function readiness(request: AdviceRequest): Promise<AdviceDataReadiness> {
    const loaded = await load(request);
    const selected = new Set([
      ...(loaded.league?.teams.find((t) => t.id === request.teamId)?.roster ?? []).map((p) => p.id),
      ...(request.candidateIds ?? []),
      ...(request.giveIds ?? []),
      ...(request.receiveIds ?? []),
      ...(request.bet?.playerId ? [request.bet.playerId] : []),
    ]);
    const players = loaded.players.filter((p) => selected.has(p.id)).slice(0, 500);
    const injury = await deps.injuries.get(loaded.season).catch(() => undefined);
    const asOf = new Date(now()).toISOString();
    const injuryRows = players.map((player) => {
      const evidence = adviceInjuryEvidence(
        player,
        injury,
        loaded.season,
        loaded.week,
        asOf,
        loaded.data.games,
      );
      if (evidence.status) player.status = evidence.status;
      const updatedAt = evidence.updatedAt;
      return {
        playerId: player.id,
        coverage: evidence.coverage,
        ...(updatedAt ? { updatedAt } : {}),
        ...(evidence.validUntil ? { validUntil: evidence.validUntil } : {}),
      };
    });
    const sources = [
      ...loaded.data.sources,
      ...(injury
        ? [
            {
              id: 'injuries',
              name: 'Injury feed retrieval',
              status: 'available' as const,
              retrievedAt: injury.retrievedAt,
            },
          ]
        : [{ id: 'injuries', name: 'Injury feed retrieval', status: 'unavailable' as const }]),
    ];
    const scope =
      request.mode === 'trade'
        ? ('remaining-season' as const)
        : ['draft-plan', 'draft-review'].includes(request.mode)
          ? ('season' as const)
          : ('week' as const);
    const evidence = loaded.league
      ? buildPlayerEvidence({
          league: loaded.league,
          players,
          projections: deps.store
            .snapshot()
            .playerProjections.filter((row) => row.leagueId === loaded.league?.id)
            .map((row) => ({ ...row, sourceId: projectionSourceId(row) })),
          data: loaded.data,
          season: loaded.season,
          week: loaded.week,
          scope,
          asOf,
          ...(request.throughWeek ? { throughWeek: request.throughWeek } : {}),
        })
      : [];
    const report = buildAdviceReadiness({
      request,
      league: loaded.league,
      players: evidence,
      sources,
      injuries: injuryRows,
      asOf,
      staleHours: deps.store.settingsSnapshot().leagueStaleAfterHours ?? 24,
    });
    if (request.mode !== 'betting' && !loaded.league?.teams.some((t) => t.id === request.teamId)) {
      report.status = 'blocked';
      report.items.unshift({
        name: 'Your team',
        state: 'missing',
        detail: 'Choose a team in the connected league.',
      });
    }
    if (
      request.mode === 'betting' &&
      !loaded.data.games.some(
        (g) => g.id === request.bet?.gameId && isUpcomingFootballGame(g, asOf),
      )
    ) {
      report.status = 'blocked';
      report.items.unshift({
        name: 'Game timing',
        state: 'missing',
        detail: 'Choose a verified upcoming NFL game.',
      });
    }
    return report;
  }
  async function analyze(
    request: AdviceRequest,
    signal?: AbortSignal,
    resultId: string = randomUUID(),
  ): Promise<AdviceResult> {
    const savedSettings = deps.store.settingsSnapshot();
    let settings = savedSettings;
    const usesCodex =
      request.connection === 'codex-cli' ||
      ((!request.connection || request.connection === 'saved') &&
        savedSettings.aiRuntime?.mode === 'codex-cli');
    if (usesCodex && request.maxOutputTokens !== undefined)
      throw new Error('Signed-in Codex does not support a token budget per pass.');
    const signedIn = request.connection !== undefined && request.connection !== 'saved';
    if (
      signedIn &&
      request.model !== undefined &&
      request.model !== signedModel(request.connection)
    )
      throw new Error('Signed-in advice uses the selected connection’s fixed model.');
    const override =
      !signedIn && request.model !== undefined && request.model !== modelName(savedSettings);
    if (override) {
      if (savedSettings.aiRuntime?.mode && savedSettings.aiRuntime.mode !== 'api')
        throw new Error('Local AI uses the configured tool.');
      const choice = await models(savedSettings);
      signal?.throwIfAborted();
      if (!choice.selection.models.some((model) => model.id === request.model))
        throw new Error('Reload model choices before analyzing with this model.');
      settings = {
        ...savedSettings,
        aiRuntime: {
          mode: 'api',
          command: '',
          args: '',
          baseUrl: 'https://api.openai.com/v1',
          ...savedSettings.aiRuntime,
          model: request.model!,
          // The saved prices belong to the saved model, not an analysis override.
        },
      };
      delete settings.aiRuntime!.inputUsdPerMillionTokens;
      delete settings.aiRuntime!.outputUsdPerMillionTokens;
    }
    const ai = signedIn
      ? await signedConnection(request.connection)?.provider()
      : await deps.configuredAI(settings);
    if (!ai)
      throw new Error('Connect your existing AI service in Settings before requesting advice.');
    signal?.throwIfAborted();
    const loaded = await load(request, signal);
    const { league, season } = loaded;
    let data = loaded.data;
    const targetGame = request.bet
      ? data.games.find((game) => game.id === request.bet!.gameId)
      : undefined;
    let marketQuote: SportsbookQuote | undefined;
    if (request.bet?.quoteId) {
      if (!targetGame) throw new AdviceGameTimingError();
      marketQuote = await deps.odds?.verify(targetGame, request.bet);
      if (!marketQuote) throw new AdviceQuoteError();
      signal?.throwIfAborted();
    }
    const week = targetGame?.week ?? loaded.week;
    if (request.mode === 'trade' && (request.throughWeek ?? 18) < week)
      throw new Error('Choose a remaining interval ending on or after the current NFL week.');
    if (request.mode === 'betting') {
      if (
        !targetGame ||
        targetGame.season !== season ||
        !isUpcomingFootballGame(targetGame, new Date(now()).toISOString())
      )
        throw new AdviceGameTimingError();
      if (request.bet!.kind === 'player-prop') {
        const player = loaded.players.find((player) => player.id === request.bet!.playerId);
        if (
          !player ||
          ![targetGame.home, targetGame.away]
            .map(nflTeamKey)
            .includes(nflTeamKey(player.nflTeam ?? ''))
        )
          throw new Error('Choose a player on a team in the selected game.');
      }
    }
    const sources: FootballDataSource[] = [
      ...data.sources,
      {
        id: 'league-snapshot',
        name: 'Connected fantasy league snapshot',
        status: league ? 'available' : 'unavailable',
        ...(league?.lastSyncedAt ? { retrievedAt: league.lastSyncedAt } : {}),
      },
    ];
    const projections = deps.store
      .snapshot()
      .playerProjections.filter((row) => row.leagueId === league?.id)
      .map((row) => ({ ...row, sourceId: projectionSourceId(row) }));
    for (const projection of projections)
      if (
        projection.scoringMatched &&
        !sources.some((source) => source.id === `projection:${projection.sourceId}`)
      )
        sources.push({
          id: `projection:${projection.sourceId}`,
          name: projection.sourceName,
          ...(projection.sourceUrl ? { url: projection.sourceUrl } : {}),
          retrievedAt: projection.importedAt,
          status: 'available',
        });
    const publicContext = await Promise.allSettled([
      deps.news.getForAdvice ? deps.news.getForAdvice() : deps.news.get(),
      deps.injuries.get(season),
    ]);
    signal?.throwIfAborted();
    let asOf = new Date(now()).toISOString();
    const warnings = [...loaded.warnings];
    const injuryResult = publicContext[1]!;
    if (injuryResult.status === 'fulfilled') {
      sources.push({
        id: 'injuries',
        name: 'nflverse injury reports (retrieval date; report dates vary)',
        url: injuryResult.value.sourceUrl,
        retrievedAt: injuryResult.value.retrievedAt,
        status: 'available',
      });
    } else
      warnings.push(
        'Current injury reports are unavailable. Confirm availability before deciding.',
      );
    if (
      request.mode === 'betting' &&
      request.bet?.kind !== 'player-prop' &&
      targetGame &&
      deps.pregame
    ) {
      data = await deps.pregame.history(data, asOf, signal);
      signal?.throwIfAborted();
      const game = await deps.pregame.current(
        targetGame,
        data,
        injuryResult.status === 'fulfilled' ? injuryResult.value : undefined,
        signal,
      );
      data = { ...data, games: data.games.map((g) => (g.id === game.id ? game : g)) };
      asOf = new Date(now()).toISOString();
      for (const source of data.sources)
        if (!sources.some((s) => s.id === source.id)) sources.push(source);
      sources.push({
        id: 'game-context-quarterbacks',
        name: 'ESPN current captured quarterback depth charts (not confirmed starters)',
        status:
          game.pregame?.home.quarterbackObservedAt || game.pregame?.away.quarterbackObservedAt
            ? 'available'
            : 'unavailable',
        retrievedAt: asOf,
        url: 'https://www.espn.com/nfl/depthcharts',
      });
      sources.push({
        id: 'game-context-live-injuries',
        name: 'ESPN dated event-linked injury statuses (IR omitted)',
        status:
          game.pregame?.home.reportSource === 'espn' || game.pregame?.away.reportSource === 'espn'
            ? 'available'
            : 'unavailable',
        retrievedAt: asOf,
        url: `https://www.espn.com/nfl/game/_/gameId/${game.espnId}`,
      });
      sources.push({
        id: 'game-context-official-current-injuries',
        name: 'Official NFL dated game-status articles (partial coverage)',
        status:
          game.pregame?.home.reportSource === 'nfl-official' ||
          game.pregame?.away.reportSource === 'nfl-official'
            ? 'available'
            : 'unavailable',
        retrievedAt: asOf,
        url:
          game.pregame?.home.reportUrl ??
          game.pregame?.away.reportUrl ??
          'https://www.nfl.com/news/',
      });
      sources.push({
        id: 'game-context-current-personnel',
        name: 'Earlier completed-game quarterback performance and snap roles',
        status:
          game.pregame?.home.personnel || game.pregame?.away.personnel
            ? 'available'
            : 'unavailable',
        retrievedAt: asOf,
        url: 'https://github.com/nflverse/nflverse-data',
      });
      data.sources = sources;
      warnings.push(...data.warnings.filter((w) => !warnings.includes(w)));
    }
    const newsResult = publicContext[0]!;
    const injuryEvidence = new Map(
      loaded.players.map((player) => {
        const injury = adviceInjuryEvidence(
          player,
          injuryResult.status === 'fulfilled' ? injuryResult.value : undefined,
          season,
          week,
          asOf,
          data.games,
        );
        if (injury.status) player.status = injury.status;
        return [player.id, injury] as const;
      }),
    );
    const evidence = league
      ? buildPlayerEvidence({
          league,
          players: loaded.players,
          projections,
          data,
          season,
          week,
          scope:
            request.mode === 'trade'
              ? 'remaining-season'
              : ['draft-plan', 'draft-review'].includes(request.mode)
                ? 'season'
                : 'week',
          ...(request.throughWeek !== undefined ? { throughWeek: request.throughWeek } : {}),
          asOf,
        })
      : [];
    for (const player of evidence)
      player.warnings.push(...(injuryEvidence.get(player.id)?.warnings ?? []));
    const plan =
      request.mode !== 'betting'
        ? buildFantasyAdvicePlan(
            league!,
            {
              mode: request.mode,
              teamId: request.teamId!,
              week,
              season,
              ...(request.throughWeek !== undefined ? { throughWeek: request.throughWeek } : {}),
              ...(request.candidateIds ? { candidateIds: request.candidateIds } : {}),
              ...(request.dropPlayerId ? { dropPlayerId: request.dropPlayerId } : {}),
              ...(request.giveIds ? { giveIds: request.giveIds } : {}),
              ...(request.receiveIds ? { receiveIds: request.receiveIds } : {}),
              ...(request.tradeTeamId ? { tradeTeamId: request.tradeTeamId } : {}),
            },
            evidence,
            asOf,
          )
        : undefined;
    const betHistory =
      request.mode === 'betting' ? analyzeBetHistory(request.bet!, data, asOf) : undefined;
    if (betHistory) {
      const rolling = buildBetForecast(request.bet!, data, asOf);
      if (rolling.forecast) betHistory.forecast = rolling.forecast;
      betHistory.metrics.push(...rolling.metrics);
      betHistory.warnings.push(...rolling.warnings);
    }
    if (betHistory)
      sources.push(
        {
          id: 'entered-odds',
          name: marketQuote
            ? `${marketQuote.sportsbook} pregame price displayed by ESPN`
            : 'Sportsbook line and odds entered by you',
          status: 'available',
          retrievedAt: marketQuote?.observedAt ?? asOf,
          ...(marketQuote ? { url: marketQuote.sourceUrl } : {}),
        },
        {
          id: 'model-judgment',
          name: 'Uncalibrated AI forecast',
          status: 'available',
          retrievedAt: asOf,
        },
      );
    const selectedBetPlayer = request.bet?.playerId
      ? loaded.players.find((player) => player.id === request.bet?.playerId)
      : undefined;
    let players =
      plan?.players ??
      (selectedBetPlayer
        ? [
            {
              id: selectedBetPlayer.id,
              name: selectedBetPlayer.name,
              position: selectedBetPlayer.position ?? '',
              ...(selectedBetPlayer.nflTeam ? { team: selectedBetPlayer.nflTeam } : {}),
              ...(selectedBetPlayer.status ? { status: selectedBetPlayer.status } : {}),
              projectionSourceIds: [] as string[],
              historicalPoints: [] as number[],
              metrics: buildPlayerMarketEvidence(selectedBetPlayer, data),
              warnings: injuryEvidence.get(selectedBetPlayer.id)?.warnings ?? [],
            },
          ]
        : []);
    const playerIds = new Set(players.map((player) => player.id));
    const footballContext = buildFootballContext(
      data,
      { season, week, asOf, ...(request.bet?.stat ? { stat: request.bet.stat } : {}) },
      loaded.players.filter((player) => playerIds.has(player.id)),
      league,
      targetGame,
    );
    for (const player of players) {
      const context = footballContext.players.get(player.id);
      if (!context) continue;
      if (context.matchup) player.matchup = context.matchup;
      // Existing player means already cover these stats; retain the additional role/opponent facts.
      player.metrics.push(
        ...context.metrics.filter(
          (metric) =>
            !metric.id.includes(':history-') ||
            !player.metrics.some((existing) => existing.id === metric.id.replace(':history-', ':')),
        ),
      );
      player.warnings.push(...context.warnings);
    }
    warnings.push(...footballContext.warnings);
    const perception = buildAdvicePerception(
      newsResult.status === 'fulfilled' ? newsResult.value : undefined,
      players,
      targetGame
        ? [targetGame.home, targetGame.away]
        : players.flatMap((player) => [player.team ?? '', player.matchup?.opponent ?? '']),
      sources,
      asOf,
    );
    const relevantNews = perception.news;
    sources.push(...perception.sources);
    warnings.push(...perception.warnings);
    const decisionMetrics = plan?.metrics ?? betHistory?.metrics ?? [];
    const budgeted = budgetAdviceEvidence(
      players,
      [...decisionMetrics, ...footballContext.metrics, ...perception.metrics],
      sources,
      new Set([
        ...decisionMetrics.map((metric) => metric.id),
        ...perception.metrics.map((metric) => metric.id),
        ...perception.evidence.activityMetricIds,
      ]),
    );
    players = budgeted.players;
    const metrics = budgeted.metrics;
    sources.splice(0, sources.length, ...budgeted.sources);
    if (budgeted.omitted)
      warnings.push(
        `Showing prioritized supporting evidence. ${budgeted.omitted} secondary historical/team metrics were omitted to fit the analysis size limit.`,
      );
    const allMetrics = [...metrics, ...players.flatMap((player) => player.metrics)];
    for (const metric of allMetrics)
      for (const sourceId of metric.sourceIds)
        if (!sources.some((source) => source.id === sourceId && source.status === 'available'))
          warnings.push(`Evidence metadata is unavailable for ${sourceId}.`);
    const allowedPlayers =
      plan?.candidates.map((candidate) => candidate.playerId) ?? players.map((player) => player.id);
    const decisionPolicy = adviceDecisionPolicy(request, plan, betHistory, players);
    const validateAnswer = (value: unknown) => {
      const answer = validateAdviceAssessment(
        value,
        allMetrics,
        sources.map((source) => source.id),
        allowedPlayers,
        request.mode === 'betting',
      );
      if (
        request.mode === 'lineup' &&
        plan &&
        ['recommend', 'lean'].includes(decisionPolicy.maximumVerdict) &&
        ['recommend', 'lean'].includes(answer.verdict)
      ) {
        if (plan.startSit) validateStartSitAssessment(answer, plan);
        else validateLineupAssessment(answer, plan, league!.settings.roster_positions);
      }
      if (
        request.mode === 'waivers' &&
        request.dropPlayerId &&
        plan?.metrics.some((m) => m.id === 'waiver-before')
      ) {
        const actionable = ['recommend', 'lean'].includes(answer.verdict);
        const compared = actionable
          ? plan.candidates.filter((candidate) =>
              answer.recommendedPlayerIds.includes(candidate.playerId),
            )
          : plan.candidates.slice(0, 1);
        if (
          actionable &&
          (!compared.length ||
            compared.some((candidate) => candidate.value === undefined || candidate.value <= 0))
        )
          throw new Error('Advice selected a non-improving weekly add/drop move.');
        const required = [
          'waiver-before',
          ...(plan.metrics.some((m) => m.id === 'waiver-drop') ? ['waiver-drop'] : []),
          ...compared
            .filter((c) => c.value !== undefined)
            .flatMap((c) => [`${c.playerId}:waiver-after`, `${c.playerId}:waiver-gain`]),
        ];
        const visible = new Set(
          answer.reasons.flatMap((reason) =>
            reason.metricIds.filter((id) => reason.text.includes(`{{${id}}}`)),
          ),
        );
        if (compared.some((c) => c.value !== undefined) && required.some((id) => !visible.has(id)))
          throw new Error('Advice did not substantiate the add/drop comparison.');
      }
      return answer;
    };
    const selectedTeam = league?.teams.find((team) => team.id === request.teamId);
    const comparisonTeam = league?.teams.find((team) => team.id === request.tradeTeamId);
    const rosterContext = (team: typeof selectedTeam) =>
      team
        ? {
            teamId: team.id,
            playerIds: team.rosterPlayerIds ?? team.roster?.map((player) => player.id) ?? [],
            recordedStarters: {
              week,
              playerIds: [
                ...new Set(
                  league?.matchups
                    ?.filter((matchup) => matchup.week === week)
                    .flatMap((matchup) =>
                      matchup.teams
                        .filter((side) => side.teamId === team.id)
                        .flatMap((side) => side.starters ?? []),
                    ) ?? [],
                ),
              ],
              scope: 'Saved starter identities, not verified platform slot assignments.',
            },
            complete: Boolean(team.roster && team.rosterSize === team.roster.length),
            sourceId: 'league-snapshot',
          }
        : null;
    const savedPicks = league?.draft?.picks.filter((pick) => pick.teamId === request.teamId) ?? [];
    const draftContext =
      league && ['draft-plan', 'draft-review'].includes(request.mode)
        ? {
            purpose:
              request.mode === 'draft-plan'
                ? 'conditional candidate planning comparison'
                : 'review saved draft picks',
            savedDraftStatus: league.draft?.status ?? null,
            savedDraftSeason: league.draft?.season ?? null,
            selectedTeamPicks: savedPicks.map((pick) => ({
              playerId: pick.playerId,
              round: pick.round,
              pickNumber: pick.pickNumber,
              isKeeper: pick.isKeeper,
            })),
            candidateIds: plan?.candidates.map((candidate) => candidate.playerId) ?? [],
            eligibility:
              request.mode === 'draft-plan'
                ? {
                    checkedAgainstSavedRosters:
                      league.teams.length === league.teamCount &&
                      league.teams.every(
                        (team) => team.roster && team.rosterSize === team.roster.length,
                      ),
                    checkedAgainstSavedPickLog: Boolean(league.draft),
                    snapshotAt: league.lastSyncedAt ?? null,
                    limitation:
                      'Candidates exclude players recorded as rostered or picked. The snapshot cannot guarantee live availability or availability at a later pick.',
                  }
                : null,
          }
        : null;
    const context = promptDataBlock('untrusted_advice_data', {
      request,
      season,
      week,
      asOf,
      league: league
        ? {
            scoring: league.scoring,
            settings: { roster_positions: league.settings.roster_positions, currentWeek: week },
            teamCount: league.teamCount,
            selectedTeam: league.teams.find((team) => team.id === request.teamId)?.name,
          }
        : null,
      rosterContext: league
        ? { selected: rosterContext(selectedTeam), comparison: rosterContext(comparisonTeam) }
        : null,
      draftContext,
      candidates: plan?.candidates ?? [],
      ...compactAdviceEvidence(players, metrics, sources),
      news: relevantNews,
      perceptionEvidence: perception.evidence,
      lineup: plan?.lineup,
      startSit: plan?.startSit,
      alternativeLineup: plan?.alternativeLineup,
      betHistory,
      targetGame: targetGame ?? null,
      marketQuote: marketQuote ?? null,
      warnings: [...warnings, ...(plan?.warnings ?? betHistory?.warnings ?? [])],
      allowedPlayerIds: allowedPlayers,
      decisionPolicy,
    });
    let usage: { inputTokens: number; outputTokens: number } | undefined;
    async function generate(prompt: string): Promise<string> {
      signal?.throwIfAborted();
      const input = {
        system: adviceReasoningInstructions,
        prompt,
        reasoningEffort: 'high' as const,
        temperature: 0.2,
        ...(!usesCodex ? { maxOutputTokens: request.maxOutputTokens ?? 16_384 } : {}),
        timeoutMs: 120_000,
        ...(signal ? { signal } : {}),
      };
      const completion = ai!.generateDetailed
        ? await ai!.generateDetailed(input)
        : { text: await ai!.generate(input) };
      if (completion.usage)
        usage = {
          inputTokens: (usage?.inputTokens ?? 0) + completion.usage.inputTokens,
          outputTokens: (usage?.outputTokens ?? 0) + completion.usage.outputTokens,
        };
      signal?.throwIfAborted();
      return completion.text;
    }
    let draft: AdviceAssessment | undefined;
    let validationFeedback =
      'The proposed answer passed structural and reference checks. Challenge its decision against the evidence.';
    const firstAnswer = await generate(
      `Analyze this decision and compare alternatives.\n${context}`,
    );
    try {
      draft = validateAnswer(parseAnswer(firstAnswer));
    } catch (failure) {
      signal?.throwIfAborted();
      // Only fixed local validation messages enter the review. Never forward a
      // JSON-parser error, raw rejected answer, or provider diagnostic to the model.
      const message = failure instanceof Error ? failure.message : '';
      validationFeedback =
        message === 'Advice headline contained unsupported numbers or links.' ||
        message === 'Advice included an unsupported numerical claim or link.'
          ? 'The first answer failed the numeric-text rule. Rebuild it with no digits in headline or prose except valid supplied {{metric-id}} placeholders. Do not write player IDs, numeric position labels, percentages, dates or URLs in prose. Every placeholder must name an existing metric declared in that same statement. Keep exact identifiers only in the identifier arrays.'
          : message === 'Advice recommendation lacked numerical support.'
            ? 'The first answer lacked visible numerical support. Include a supplied computed metric placeholder in at least one recommendation reason and declare its identifier in that reason.'
            : message === 'Advice did not substantiate the add/drop comparison.' ||
                message === 'Advice selected a non-improving weekly add/drop move.'
              ? 'The first answer failed the waiver add/drop comparison. Show visible supplied waiver-before, waiver-drop when available, and compared candidate waiver-after/waiver-gain placeholders in reasons. Choose Hold for non-positive starting-lineup changes; do not label them immediate upgrades.'
              : message ===
                  'Advice must select exactly one eligible player for the start/sit comparison.'
                ? 'The first answer did not select one start/sit choice. Select exactly one eligible candidate for the shared spot; do not return a full lineup.'
                : message ===
                    'A start/sit comparison requires visible estimates for every eligible alternative.'
                  ? 'The first answer did not substantiate the start/sit comparison. Show valid weekly estimate placeholders for each eligible alternative in reasons, including the chosen player.'
                  : message ===
                      'Advice must select a complete legal lineup from eligible roster players.'
                    ? 'The first answer did not select a complete legal starting lineup. Choose distinct eligible roster players to fill every starting slot. Do not return a single start/sit player or let the comparison lineup stand in for the selection.'
                    : message ===
                        'A different lineup requires visible estimates for the changed players.'
                      ? 'The first answer changed the highest-estimate lineup without showing the tradeoff. Include valid estimate placeholders for both the replacement and displaced players in reasons, or keep the supported comparison lineup.'
                      : 'The first answer failed JSON structure or evidence-reference checks. Rebuild the exact required schema using only supplied identifiers and evidence.';
    }
    const reviewed = await generate(
      `Review and correct the proposed answer against the evidence. Check numerical grounding, legal lineup/ownership, missing data, certainty, unsupported betting edge, and perception claims. Return the final answer in the same JSON schema. A missing proposed answer means the first answer was invalid; build a valid answer directly from the evidence.\nValidation feedback: ${validationFeedback}\n${context}\n${promptDataBlock('untrusted_proposed_answer', draft ?? null)}`,
    );
    const assessment = enforceAdvicePerception(
      enforceAdviceDecisionPolicy(validateAnswer(parseAnswer(reviewed)), decisionPolicy),
      perception.evidence,
      allMetrics,
    );
    const { selectedLineup, comparisonLineup, confidence } = reconcileAdviceSelection({
      request,
      league,
      plan,
      betHistory,
      players,
      decisionPolicy,
      assessment,
      metrics,
      warnings,
    });
    const rates = signedIn || usesCodex ? undefined : settings.aiRuntime;
    const cost =
      usage &&
      rates?.inputUsdPerMillionTokens !== undefined &&
      rates.outputUsdPerMillionTokens !== undefined
        ? (usage.inputTokens * rates.inputUsdPerMillionTokens +
            usage.outputTokens * rates.outputUsdPerMillionTokens) /
          1_000_000
        : undefined;
    let finalQuoteVerified = !!marketQuote;
    if (marketQuote && targetGame && request.bet) {
      finalQuoteVerified = !!(await deps.odds?.verify(targetGame, request.bet));
      if (!finalQuoteVerified) {
        if (assessment.verdict !== 'insufficient') assessment.verdict = 'hold';
        confidence.score = Math.min(confidence.score, 49);
        confidence.label = 'Low';
        warnings.push(
          'The fetched price changed, expired or became unavailable during analysis. This saved answer describes the earlier snapshot and does not support acting at a current price. Fetch prices again before reassessing.',
        );
      }
    }
    const readinessIds = new Set([
      ...(selectedTeam?.roster ?? []).map((p) => p.id),
      ...(request.candidateIds ?? []),
      ...(request.giveIds ?? []),
      ...(request.receiveIds ?? []),
      ...(plan?.candidates.map((p) => p.playerId) ?? []),
    ]);
    const savedReadiness = buildAdviceReadiness({
      request,
      league,
      players: players.filter((p) => readinessIds.has(p.id)),
      sources,
      injuries: [...injuryEvidence]
        .filter(([id]) => readinessIds.has(id))
        .map(([playerId, evidence]) => ({
          playerId,
          coverage: evidence.coverage,
          ...(evidence.updatedAt ? { updatedAt: evidence.updatedAt } : {}),
          ...(evidence.validUntil ? { validUntil: evidence.validUntil } : {}),
        })),
      asOf,
      staleHours: savedSettings.leagueStaleAfterHours ?? 24,
    });
    const result: AdviceResult = {
      id: resultId,
      createdAt: asOf,
      request,
      season,
      week,
      model: signedIn ? signedLabel(request.connection) : modelName(settings),
      assessment,
      confidence,
      players,
      metrics,
      sources,
      warnings: [...new Set([...warnings, ...(plan?.warnings ?? betHistory?.warnings ?? [])])],
      perceptionEvidence: perception.evidence,
      readiness: savedReadiness,
      ...(selectedLineup ? { lineup: selectedLineup } : {}),
      ...(plan?.startSit ? { startSit: plan.startSit } : {}),
      ...(comparisonLineup ? { alternativeLineup: comparisonLineup } : {}),
      ...(betHistory ? { betHistory } : {}),
      ...(marketQuote ? { marketQuote } : {}),
      ...(usage
        ? { usage: { ...usage, ...(cost !== undefined ? { estimatedCostUsd: cost } : {}) } }
        : {}),
    };
    if (!isAdviceResult(result)) throw new InvalidAdviceAnswer();
    if (
      request.mode === 'betting' &&
      targetGame &&
      !isUpcomingFootballGame(targetGame, new Date(now()).toISOString())
    )
      throw new AdviceGameTimingError();
    signal?.throwIfAborted();
    const frozenProtocol =
      betHistory?.forecast && marketQuote && finalQuoteVerified
        ? await freezeForecastProtocol(betHistory.forecast.method, asOf)
        : undefined;
    await deps.store.update((state) => {
      signal?.throwIfAborted();
      if (
        request.mode === 'betting' &&
        targetGame &&
        !isUpcomingFootballGame(targetGame, new Date(now()).toISOString())
      )
        throw new AdviceGameTimingError();
      state.adviceResults = [
        result,
        ...(state.adviceResults ?? []).filter((item) => item.id !== result.id),
      ].slice(0, 100);
      const capturedAt = new Date(now()).toISOString();
      const records = capturePredictionRecords(
        result,
        data,
        league,
        loaded.players,
        capturedAt,
        finalQuoteVerified ? marketQuote : undefined,
      );
      for (const record of records)
        if (
          record.kind === 'bet' &&
          record.quote &&
          frozenProtocol &&
          record.method === betHistory?.forecast?.method
        )
          record.protocol = frozenProtocol;
      const decision = captureDecisionSnapshot(result, league, capturedAt);
      if (
        decision &&
        [...new Set([...decision.chosenIds, ...decision.baselineIds])].every((id) =>
          records.some((r) => r.id === `${result.id}:fantasy:${id}` && r.scope === decision.scope),
        )
      ) {
        const anchor = records.find((r) => r.kind === 'fantasy');
        if (anchor) anchor.decision = decision;
      }
      const omitted = appendPredictionRecords(state, records);
      if (omitted)
        result.warnings.push(
          'The prediction ledger reached its storage limit. This advice is saved, but some forecasts were not added to performance tracking. Export or clear the track record before recording more.',
        );
    });
    return result;
  }
  async function testConnection(connection: AdviceConnection, signal?: AbortSignal) {
    if (!signedConnection(connection))
      throw new Error('Choose an installed signed-in AI connection.');
    const ai = await signedConnection(connection)!.provider();
    signal?.throwIfAborted();
    const output = await ai.generate({
      system: 'Return only JSON. Do not use tools.',
      prompt: 'Return only {"ok":true}.',
      reasoningEffort: 'high',
      ...(connection !== 'codex-cli' ? { maxOutputTokens: 1024 } : {}),
      timeoutMs: 25_000,
      ...(signal ? { signal } : {}),
    });
    signal?.throwIfAborted();
    const answer: unknown = parseAnswer(output);
    if (
      !answer ||
      typeof answer !== 'object' ||
      Array.isArray(answer) ||
      Object.keys(answer).length !== 1 ||
      (answer as { ok?: unknown }).ok !== true
    )
      throw new Error('The signed-in AI connection test could not be verified.');
  }
  /**
   * The Home weekly answer: deterministic lineup and waiver plans plus availability, with no AI
   * call. It uses the NFL's upcoming week from the schedule when the league snapshot lags.
   */
  async function briefing(leagueId: string, teamId: string): Promise<WeeklyBriefing> {
    const leagueRow = deps.store.snapshot().leagues.find((row) => row.id === leagueId);
    if (!leagueRow?.teams.some((team) => team.id === teamId))
      throw new Error('That team is not in the connected league.');
    const probe = await load({ mode: 'lineup', leagueId });
    const asOf = new Date(now()).toISOString();
    const upcoming = probe.data.games
      .filter((game) => game.season === probe.season && isUpcomingFootballGame(game, asOf))
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    const leagueWeek = probe.week;
    const week = upcoming && upcoming.week > leagueWeek ? upcoming.week : leagueWeek;
    const loaded = week === leagueWeek ? probe : await load({ mode: 'lineup', leagueId, week });
    const league = loaded.league!;
    const injury = await deps.injuries.get(loaded.season).catch(() => undefined);
    const injuryEvidence = new Map(
      loaded.players.map((player) => {
        const evidence = adviceInjuryEvidence(
          player,
          injury,
          loaded.season,
          week,
          asOf,
          loaded.data.games,
        );
        if (evidence.status) player.status = evidence.status;
        return [player.id, evidence] as const;
      }),
    );
    const evidence = buildPlayerEvidence({
      league,
      players: loaded.players,
      projections: deps.store
        .snapshot()
        .playerProjections.filter((row) => row.leagueId === league.id)
        .map((row) => ({ ...row, sourceId: projectionSourceId(row) })),
      data: loaded.data,
      season: loaded.season,
      week,
      scope: 'week',
      asOf,
    });
    const byId = new Map(evidence.map((player) => [player.id, player]));
    const plan = (mode: 'lineup' | 'waivers') => {
      try {
        return buildFantasyAdvicePlan(
          league,
          { mode, teamId, week, season: loaded.season },
          evidence,
          asOf,
        );
      } catch {
        return undefined;
      }
    };
    const lineupPlan = plan('lineup');
    const waiverPlan = plan('waivers');
    const roster = league.teams.find((team) => team.id === teamId)?.roster ?? [];
    const recordedWeeks = (league.matchups ?? [])
      .filter(
        (m) => m.week <= week && m.teams.some((t) => t.teamId === teamId && t.starters?.length),
      )
      .map((m) => m.week);
    const startersWeek = recordedWeeks.length ? Math.max(...recordedWeeks) : undefined;
    const starters = new Set(
      (league.matchups ?? [])
        .filter((m) => m.week === startersWeek)
        .flatMap((m) =>
          m.teams.filter((t) => t.teamId === teamId).flatMap((t) => t.starters ?? []),
        ),
    );
    const name = (id: string) => byId.get(id)?.name ?? roster.find((p) => p.id === id)?.name ?? id;
    const optimal = lineupPlan?.lineup;
    const changes =
      optimal?.complete && starters.size
        ? (() => {
            const ins = optimal.assignments.filter((row) => !starters.has(row.playerId));
            const chosen = new Set(optimal.assignments.map((row) => row.playerId));
            const outs = [...starters]
              .filter((id) => !chosen.has(id))
              .map((id) => ({ id, points: byId.get(id)?.projectedPoints }));
            return ins.map((row, index) => ({
              slot: row.slot,
              start: { id: row.playerId, name: name(row.playerId), points: row.points },
              ...(outs[index]
                ? {
                    bench: {
                      id: outs[index]!.id,
                      name: name(outs[index]!.id),
                      ...(outs[index]!.points !== undefined ? { points: outs[index]!.points } : {}),
                    },
                  }
                : {}),
            }));
          })()
        : [];
    const considered = roster.filter((p) => !isInactiveFootballStatus(byId.get(p.id)?.status));
    const known = considered.filter((p) => byId.get(p.id)?.projectedPoints !== undefined).length;
    const played = considered.filter((p) =>
      byId.get(p.id)?.warnings.includes(weeklyGameWithheldWarning),
    ).length;
    const availability = roster
      .map((p) => ({
        player: p,
        evidence: injuryEvidence.get(p.id),
        status: byId.get(p.id)?.status,
      }))
      .filter(({ status }) => status && !/^(active|normal|healthy)$/i.test(status))
      .slice(0, 8)
      .map(({ player, evidence, status }) => ({
        id: player.id,
        name: player.name,
        // A this-week report without a designation supersedes the older roster flag.
        status:
          evidence?.coverage === 'week-window' && !evidence.status
            ? 'No game designation'
            : status!,
        basis:
          evidence?.coverage === 'current'
            ? ('dated-report' as const)
            : evidence?.coverage === 'week-window'
              ? ('this-week-report' as const)
              : ('roster' as const),
        ...(evidence?.validUntil ? { validUntil: evidence.validUntil } : {}),
      }));
    const waivers = (waiverPlan?.candidates ?? [])
      .filter((candidate) => (candidate.value ?? 0) > 0)
      .slice(0, 3)
      .map((candidate) => ({
        id: candidate.playerId,
        name: name(candidate.playerId),
        position: byId.get(candidate.playerId)?.position ?? '',
        gain: candidate.value!,
      }));
    await recordWeeklyProjections(league, loaded, evidence, roster, week, asOf).catch(
      () => undefined,
    );
    const notes: string[] = [];
    if (week !== leagueWeek)
      notes.push(
        `League data is from week ${leagueWeek}; the NFL is on week ${week}. Update the league to see this week’s roster moves.`,
      );
    if (startersWeek !== undefined && startersWeek !== week)
      notes.push(`Compared with your week ${startersWeek} starters.`);
    if (!known && considered.length)
      notes.push(
        league.connectionMode === 'snapshot'
          ? `No week ${week} point estimates yet. Import an updated ESPN page, or connect ESPN access for automatic refresh, to load this week’s projections.`
          : `No week ${week} point estimates yet. Refresh the league or import projections to compare starters.`,
      );
    else if (!optimal?.complete)
      notes.push('Some starting spots have no estimate yet, so the lineup suggestion is partial.');
    // The recorded matchup is the league's current week; estimates only apply to that same week.
    const allRostered = new Map(
      league.teams.flatMap((team) => (team.roster ?? []).map((player) => [player.id, player])),
    );
    const current = (league.matchups ?? []).find(
      (m) => m.week === leagueWeek && m.teams.some((t) => t.teamId === teamId),
    );
    const side = (entry: NonNullable<typeof current>['teams'][number]) => {
      const lineup = (entry.starters ?? []).filter(Boolean).slice(0, 30);
      const players = lineup.map((id) => {
        const player = byId.get(id) ?? allRostered.get(id);
        const estimate = week === leagueWeek ? byId.get(id)?.projectedPoints : undefined;
        return {
          id,
          name: player?.name ?? 'Unknown player',
          position: player?.position ?? '',
          ...(estimate !== undefined ? { estimate } : {}),
        };
      });
      // Platforms list starters in their own order; sort by position so both sides line up.
      const order = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DST', 'D/ST'];
      const rank = (position: string) => {
        const index = order.indexOf(position.toUpperCase());
        return index < 0 ? order.length : index;
      };
      players.sort((a, b) => rank(a.position) - rank(b.position));
      const estimated = players.filter((p) => p.estimate !== undefined);
      return {
        teamId: entry.teamId,
        name: league.teams.find((t) => t.id === entry.teamId)?.name ?? entry.teamId,
        ...(entry.points !== undefined ? { points: entry.points } : {}),
        starters: players,
        ...(players.length && estimated.length === players.length
          ? { projected: estimated.reduce((sum, p) => sum + p.estimate!, 0) }
          : {}),
      };
    };
    const matchup =
      current && current.teams.length === 2
        ? {
            week: current.week,
            you: side(current.teams.find((t) => t.teamId === teamId)!),
            opponent: side(current.teams.find((t) => t.teamId !== teamId)!),
          }
        : undefined;
    return {
      leagueId,
      teamId,
      week,
      asOf,
      ...(matchup ? { matchup } : {}),
      coverage: { known, total: considered.length, alreadyPlayed: played },
      lineup: {
        complete: optimal?.complete === true,
        ...(optimal?.points !== undefined ? { points: optimal.points } : {}),
        changes,
        ...(startersWeek !== undefined ? { comparedWeek: startersWeek } : {}),
      },
      availability,
      waivers,
      notes,
    };
  }
  /** Preloads public stats and the player catalog so Advice opens without a cold download. */
  async function warm(): Promise<void> {
    const seasons = new Set(
      deps.store
        .snapshot()
        .leagues.map((league) => league.season)
        .filter((season): season is number => typeof season === 'number'),
    );
    if (!seasons.size) return;
    // Wrap each loader so a synchronous throw cannot escape allSettled.
    const attempt = (load: () => Promise<unknown>) => Promise.resolve().then(load);
    await Promise.allSettled([
      ...[...seasons].map((season) => attempt(() => deps.data.get(season))),
      ...[...seasons].map((season) => attempt(() => deps.injuries.get(season))),
      attempt(() => deps.catalog()),
    ]);
  }
  /**
   * Records this week's projection for every player on the selected roster so the accuracy
   * scorecard fills without saved advice. With imported projections, ESPN's public projection is
   * recorded alongside them for comparison. Ids are stable per league/week/source/player, so
   * repeated briefings add nothing, and only players whose game has not started are recorded.
   */
  async function recordWeeklyProjections(
    league: LeagueConnection,
    loaded: Awaited<ReturnType<typeof load>>,
    evidence: PlayerAdviceEvidence[],
    roster: { id: string }[],
    week: number,
    asOf: string,
  ) {
    const mine = new Set(roster.map((p) => p.id));
    const sets: { tag: string; players: PlayerAdviceEvidence[] }[] = [
      { tag: 'league', players: evidence.filter((p) => mine.has(p.id)) },
    ];
    // Only players whose league projection came from an import need a separate public record.
    const imported = new Set(
      evidence.filter((p) => mine.has(p.id) && p.projectionMethod === 'imported').map((p) => p.id),
    );
    if (imported.size)
      sets.push({
        tag: 'public',
        players: buildPlayerEvidence({
          league,
          players: loaded.players.filter((p) => imported.has(p.id)),
          projections: [],
          data: loaded.data,
          season: loaded.season,
          week,
          scope: 'week',
          asOf,
        }),
      });
    const records = sets.flatMap(({ tag, players }) =>
      capturePredictionRecords(
        {
          id: `weekly-${league.id}-${loaded.season}-${week}-${tag}`.slice(0, 160),
          request: { mode: 'lineup', leagueId: league.id },
          season: loaded.season,
          week,
          players,
        } as unknown as AdviceResult,
        loaded.data,
        league,
        loaded.players,
        asOf,
      ),
    );
    const existing = new Set((deps.store.snapshot().predictionRecords ?? []).map((r) => r.id));
    const fresh = records.filter((r) => !existing.has(r.id));
    if (!fresh.length) return;
    await deps.store.update((state) => {
      appendPredictionRecords(state, fresh);
    });
  }
  /**
   * Game-day problems with this week's starters (Out/Doubtful/inactive or on bye) and whether an
   * imported league is out of date. Deterministic and AI-free; the desktop shell polls it to
   * decide on notifications.
   */
  async function alerts(leagueId: string, teamId: string): Promise<LineupAlerts> {
    const summary = await briefing(leagueId, teamId);
    const leagueRow = deps.store.snapshot().leagues.find((row) => row.id === leagueId)!;
    const loaded = await load({ mode: 'lineup', leagueId, week: summary.week });
    const starters = summary.matchup?.you.starters ?? [];
    const statusById = new Map(summary.availability.map((row) => [row.id, row.status]));
    const asOf = now();
    const weekGames = loaded.data.games.filter(
      (game) => game.season === loaded.season && game.week === summary.week,
    );
    const rows: LineupAlerts['alerts'] = [];
    const kickoffs: number[] = [];
    for (const starter of starters) {
      const player = loaded.players.find((row) => row.id === starter.id);
      const team = player?.nflTeam ? nflTeamKey(player.nflTeam) : undefined;
      const game = team
        ? weekGames.find((g) => nflTeamKey(g.home) === team || nflTeamKey(g.away) === team)
        : undefined;
      const kickoff = game?.kickoffAt ? Date.parse(game.kickoffAt) : undefined;
      if (kickoff !== undefined && kickoff > asOf) kickoffs.push(kickoff);
      const status = statusById.get(starter.id);
      // A team with no game this week is on bye; an unknown team is not guessed.
      const reason =
        team && weekGames.length && !game
          ? ('bye' as const)
          : isInactiveFootballStatus(status)
            ? ('out' as const)
            : /^doubtful$/i.test(status ?? '')
              ? ('doubtful' as const)
              : undefined;
      if (!reason) continue;
      if (kickoff !== undefined && kickoff <= asOf) continue;
      rows.push({
        playerId: starter.id,
        name: starter.name,
        reason,
        ...(status ? { status } : {}),
        ...(game?.kickoffAt ? { kickoffAt: game.kickoffAt } : {}),
      });
    }
    const staleAfterMs = (deps.store.settingsSnapshot().leagueStaleAfterHours ?? 24) * 3_600_000;
    const importedAt = leagueRow.snapshotImportedAt;
    return {
      leagueId,
      teamId,
      leagueName: leagueRow.displayName,
      week: summary.week,
      alerts: rows,
      ...(kickoffs.length ? { nextKickoffAt: new Date(Math.min(...kickoffs)).toISOString() } : {}),
      ...(leagueRow.connectionMode === 'snapshot'
        ? {
            snapshot: {
              ...(importedAt ? { importedAt } : {}),
              stale: !importedAt || asOf - Date.parse(importedAt) > staleAfterMs,
            },
          }
        : {}),
    };
  }
  /** Evidence for every player in the league pool, for this week or the rest of the season. */
  async function poolEvidence(leagueId: string, scope: 'week' | 'remaining-season') {
    const probe = await load({ mode: 'lineup', leagueId });
    const asOf = new Date(now()).toISOString();
    const upcoming = probe.data.games
      .filter((game) => game.season === probe.season && isUpcomingFootballGame(game, asOf))
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    const week = upcoming && upcoming.week > probe.week ? upcoming.week : probe.week;
    const loaded = week === probe.week ? probe : await load({ mode: 'lineup', leagueId, week });
    const league = loaded.league!;
    const injury = await deps.injuries.get(loaded.season).catch(() => undefined);
    for (const player of loaded.players) {
      const evidence = adviceInjuryEvidence(
        player,
        injury,
        loaded.season,
        week,
        asOf,
        loaded.data.games,
      );
      if (evidence.status) player.status = evidence.status;
    }
    const evidence = buildPlayerEvidence({
      league,
      players: loaded.players,
      projections: deps.store
        .snapshot()
        .playerProjections.filter((row) => row.leagueId === league.id)
        .map((row) => ({ ...row, sourceId: projectionSourceId(row) })),
      data: loaded.data,
      season: loaded.season,
      week,
      scope,
      ...(scope === 'remaining-season' ? { throughWeek: 18 } : {}),
      asOf,
    });
    return { league, week, season: loaded.season, evidence };
  }
  function requireTeam(leagueId: string, teamId: string) {
    const league = deps.store.snapshot().leagues.find((row) => row.id === leagueId);
    if (!league?.teams.some((team) => team.id === teamId))
      throw new Error('That team is not in the connected league.');
  }
  /** Deterministic waiver ranking for this week; no AI call. */
  async function waiverDay(leagueId: string, teamId: string) {
    requireTeam(leagueId, teamId);
    const { league, week, evidence } = await poolEvidence(leagueId, 'week');
    return { leagueId, teamId, week, ...rankWaivers(league, teamId, evidence) };
  }
  /** Deterministic one-for-one trade ideas over the rest of the season; no AI call. */
  async function tradeIdeas(leagueId: string, teamId: string) {
    requireTeam(leagueId, teamId);
    const { league, week, evidence } = await poolEvidence(leagueId, 'remaining-season');
    const ideas = findTrades(league, teamId, evidence);
    const estimated = evidence.filter((p) => p.projectedPoints !== undefined).length;
    return {
      leagueId,
      teamId,
      fromWeek: week,
      throughWeek: 18,
      ideas,
      warnings: !estimated
        ? ['No rest-of-season estimates are available yet, so trades cannot be compared.']
        : ideas.length
          ? []
          : [
              'No one-for-one trade improves both teams’ best lineups right now. Everyone’s holding their guys like family heirlooms.',
            ],
    };
  }
  /**
   * Your matchup during games: platform points, each starter's NFL game state from the public
   * scoreboard, a projected final and a rough win chance. Deterministic; no AI call.
   */
  async function live(leagueId: string, teamId: string) {
    const summary = await briefing(leagueId, teamId);
    const leagueRow = deps.store.snapshot().leagues.find((row) => row.id === leagueId)!;
    const base = {
      leagueId,
      teamId,
      leagueName: leagueRow.displayName,
      week: summary.week,
      imported: leagueRow.connectionMode === 'snapshot',
      ...(leagueRow.lastSyncedAt ? { updatedAt: leagueRow.lastSyncedAt } : {}),
      ...(leagueRow.snapshotImportedAt ? { importedAt: leagueRow.snapshotImportedAt } : {}),
    };
    if (!summary.matchup) return { ...base, matchup: undefined, gamesAvailable: false };
    const loaded = await load({ mode: 'lineup', leagueId, week: summary.week });
    const team = (id: string) => loaded.players.find((p) => p.id === id)?.nflTeam;
    const board = await deps.scoreboard?.current().catch(() => undefined);
    // Game states only apply when the scoreboard shows the same NFL week as the matchup.
    const sameWeek = board?.week === summary.week;
    // A score from an earlier week (old league data) must not read as this week's score.
    const currentScores = summary.matchup.week === summary.week;
    const sideInput = (side: MatchupSide) => ({
      teamId: side.teamId,
      name: side.name,
      ...(currentScores && side.points !== undefined ? { points: side.points } : {}),
      starters: side.starters.map((s) => ({
        ...s,
        ...(team(s.id) ? { nflTeam: team(s.id)! } : {}),
      })),
    });
    return {
      ...base,
      gamesAvailable: Boolean(sameWeek && board?.games.length),
      matchupWeek: summary.matchup.week,
      matchup: liveMatchup(
        { you: sideInput(summary.matchup.you), opponent: sideInput(summary.matchup.opponent) },
        sameWeek ? board!.games : [],
        sameWeek ? board!.byeTeams : [],
      ),
    };
  }
  return {
    live,
    readiness,
    options,
    analyze,
    testConnection,
    warm,
    briefing,
    alerts,
    waiverDay,
    tradeIdeas,
  };

  async function models(settings: AppSettings) {
    const saved = modelName(settings);
    if (settings.aiRuntime?.mode === 'anthropic-api')
      return {
        selection: {
          models: [
            ...new Set([saved, 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']),
          ].map((id) => ({ id, reasoning: true })),
        },
        warnings: [] as string[],
      };
    if (settings.aiRuntime?.mode && settings.aiRuntime.mode !== 'api')
      return {
        selection: { models: [{ id: saved, reasoning: settings.aiRuntime?.mode === 'codex-cli' }] },
        warnings: [] as string[],
      };
    const warnings: string[] = [];
    let available: string[] = [];
    if (deps.discoverModels) {
      try {
        available = await deps.discoverModels(settings);
      } catch {
        warnings.push(
          'Model discovery is unavailable. The saved AI model is still selectable; reload choices to check for deeper analysis models.',
        );
      }
    }
    return {
      selection: adviceModelChoices(available, saved, settings.aiRuntime?.baseUrl),
      warnings,
    };
  }
}

class InvalidAdviceAnswer extends Error {
  constructor() {
    super('The AI answer could not be verified. No advice result was saved.');
  }
}
function parseAnswer(value: string): unknown {
  if (value.length > 24_000) throw new InvalidAdviceAnswer();
  return JSON.parse(value.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, ''));
}
function modelName(settings: AppSettings): string {
  return settings.aiRuntime?.mode === 'codex-cli'
    ? signedInCodexModel
    : settings.aiRuntime?.mode === 'cli'
      ? 'Configured local AI'
      : settings.aiRuntime?.mode === 'apple-cli'
        ? 'Apple Foundation Models'
        : (settings.aiRuntime?.model ?? 'gpt-6-luna');
}

/**
 * Adds new prediction records within the ledger limits, skipping ids already present. Returns how
 * many were left out for space; room is kept for later outcome fields so a full ledger can settle.
 */
function appendPredictionRecords(
  state: { predictionRecords?: PredictionRecord[] },
  records: PredictionRecord[],
): number {
  const previous = state.predictionRecords ?? [];
  const ids = new Set(previous.map((r) => r.id));
  let bytes = Buffer.byteLength(JSON.stringify(previous)),
    omitted = 0;
  const added = [...previous];
  for (const record of records) {
    if (ids.has(record.id)) continue;
    const size = Buffer.byteLength(JSON.stringify(record)) + 1;
    if (
      added.length >= maximumPredictionRecords ||
      bytes + size > maximumPredictionBytes - maximumPredictionRecords * 160
    ) {
      omitted++;
      continue;
    }
    added.push(record);
    ids.add(record.id);
    bytes += size;
  }
  state.predictionRecords = added;
  return omitted;
}
