import { expandCompactAdviceEvidence } from '../apps/api/src/advice-evidence-budget';
import type {
  AdviceAssessment,
  AdviceMetric,
  AIRequest,
  FootballDataSnapshot,
  PlayerProjection,
  RosterPlayer,
} from '@sidekick/core';
import { footballStatKeys } from '@sidekick/core';
import type { LocalStore } from '../apps/api/src/store.js';

export const adviceNow = Date.parse('2026-10-07T12:00:00Z');
const stamp = new Date(adviceNow).toISOString();
export const adviceCatalog = new Map<string, RosterPlayer>([
  ['q1', { id: 'q1', gsisId: 'gsis-q1', name: 'Alex Quarterback', position: 'QB', nflTeam: 'BUF' }],
  ['w1', { id: 'w1', gsisId: 'gsis-w1', name: 'Blake Receiver', position: 'WR', nflTeam: 'BUF' }],
  ['r1', { id: 'r1', gsisId: 'gsis-r1', name: 'Casey Runner', position: 'RB', nflTeam: 'BUF' }],
  ['q2', { id: 'q2', gsisId: 'gsis-q2', name: 'Drew Quarterback', position: 'QB', nflTeam: 'MIA' }],
  ['w2', { id: 'w2', gsisId: 'gsis-w2', name: 'Ellis Receiver', position: 'WR', nflTeam: 'MIA' }],
  ['r2', { id: 'r2', gsisId: 'gsis-r2', name: 'Finley Runner', position: 'RB', nflTeam: 'MIA' }],
  ['q3', { id: 'q3', gsisId: 'gsis-q3', name: 'Gray Quarterback', position: 'QB', nflTeam: 'BUF' }],
  ['w3', { id: 'w3', gsisId: 'gsis-w3', name: 'Harper Receiver', position: 'WR', nflTeam: 'BUF' }],
  ['r3', { id: 'r3', gsisId: 'gsis-r3', name: 'Indigo Runner', position: 'RB', nflTeam: 'BUF' }],
]);

/** Full fictional schedules and earlier cohorts exercise the real forecast path, not imports. */
export function automaticAdviceData(): FootballDataSnapshot {
  const teams = ['BUF', 'MIA', 'KC', 'NYJ', 'NE', 'LA', 'SF', 'SEA'];
  const participants = [...adviceCatalog.values()];
  for (const team of teams.slice(2))
    for (const position of ['QB', 'RB', 'WR'])
      participants.push({
        id: `extra-${team}-${position}`,
        gsisId: `gsis-extra-${team}-${position}`,
        name: `Fictional ${team} ${position}`,
        nflTeam: team,
        position,
      });
  const data: FootballDataSnapshot = {
    season: 2026,
    players: [],
    games: [],
    market: [],
    warnings: [],
    sources: ['games', 'stats-2024', 'stats-2025', 'stats-2026'].map((id) => ({
      id,
      name: `Fictional ${id}`,
      status: 'available',
      retrievedAt: stamp,
    })),
  };
  for (const season of [2024, 2025, 2026]) {
    let appearance = 0;
    for (let week = 1; week <= 18; week++) {
      if (week === 10) continue;
      const complete = season < 2026 || week < 5;
      for (let pair = 0; pair < 4; pair++) {
        const game = {
          id: `automatic-${season}-${week}-${pair}`,
          season,
          week,
          seasonType: 'REG',
          date: new Date(Date.UTC(season, 8, 13) + (week - 1) * 7 * 86400000)
            .toISOString()
            .slice(0, 10),
          home: teams[pair * 2]!,
          away: teams[pair * 2 + 1]!,
          ...(complete ? { homeScore: 24, awayScore: 21 } : {}),
        };
        data.games.push(game);
        if (!complete) continue;
        for (const [index, player] of participants.entries()) {
          if (![game.home, game.away].includes(player.nflTeam!)) continue;
          const time = (season - 2024) * 17 + appearance;
          const stats: import('@sidekick/core').PlayerGameStats['stats'] = Object.fromEntries(
            footballStatKeys.map((key) => [key, 0]),
          );
          if (player.position === 'QB') {
            stats.passing_yards = 220 + index * 3 + time * 2;
            stats.attempts = 26 + time * 0.1;
          } else if (player.position === 'RB') {
            stats.rushing_yards = 60 + index * 2 + time * 1.2;
            stats.carries = 10 + time * 0.1;
            stats.targets = 3;
            stats.receptions = 2;
            stats.receiving_yards = 15;
          } else {
            stats.receiving_yards = 65 + index * 3 + time * 1.3;
            stats.targets = 6 + time * 0.12;
            stats.receptions = 5;
          }
          data.players.push({
            playerId: player.gsisId!,
            name: player.name,
            position: player.position!,
            team: player.nflTeam!,
            opponent: player.nflTeam === game.home ? game.away : game.home,
            season,
            week,
            seasonType: 'REG',
            gameId: game.id,
            stats,
          });
        }
      }
      appearance++;
    }
  }
  return data;
}
export function rollingAdviceData(): FootballDataSnapshot {
  const data = adviceData();
  const teams = [
    'BUF',
    'ARI',
    'ATL',
    'BAL',
    'CAR',
    'CHI',
    'CIN',
    'CLE',
    'DEN',
    'DET',
    'GB',
    'HOU',
    'IND',
    'JAX',
    'KC',
    'LV',
    'MIA',
    'DAL',
    'LAC',
    'LA',
    'MIN',
    'NE',
    'NO',
    'NYG',
    'NYJ',
    'PHI',
    'PIT',
    'SEA',
    'SF',
    'TB',
    'TEN',
    'WAS',
  ];
  data.games = data.games.filter((game) => game.id === 'upcoming');
  for (const season of [2025, 2026])
    for (let week = 1; week <= (season === 2025 ? 18 : 4); week++)
      for (let i = 0; i < 16; i++) {
        const j = (i + week) % 16;
        data.games.push({
          id: `rolling-${season}-${week}-${i}`,
          season,
          week,
          seasonType: 'REG',
          date: new Date(Date.UTC(season, 8, 1 + (week - 1) * 7)).toISOString().slice(0, 10),
          home: teams[i]!,
          away: teams[16 + j]!,
          homeScore: 20 + i + (week % 3),
          awayScore: 20 + j + ((week + i) % 4),
        });
      }
  return data;
}
export async function seedAdvice(store: LocalStore) {
  await store.update((state) => {
    const league = state.leagues[0]!;
    league.season = 2026;
    league.displayName = 'Fictional Advice League';
    league.settings = { currentWeek: 5, roster_positions: ['QB', 'WR', 'RB', 'BN'] };
    league.scoring = { pass_yd: 0.04, rec: 1, rec_yd: 0.1, rush_yd: 0.1 };
    league.lastSyncedAt = stamp;
    league.teams = [
      {
        id: '1',
        name: 'Your fictional team',
        rosterSize: 3,
        roster: ['q1', 'w1', 'r1'].map((id) => ({ ...adviceCatalog.get(id)! })),
      },
      {
        id: '2',
        name: 'Other fictional team',
        rosterSize: 3,
        roster: ['q2', 'w2', 'r2'].map((id) => ({ ...adviceCatalog.get(id)! })),
      },
    ];
    league.draft = {
      id: 'fictional-draft',
      status: 'complete',
      season: 2026,
      picks: ['q1', 'w1', 'r1'].map((id, index) => ({
        playerId: id,
        playerName: adviceCatalog.get(id)!.name,
        teamId: '1',
        pickNumber: index * 2 + 1,
        round: index + 1,
      })),
    };
    const projections: PlayerProjection[] = [];
    for (const [index, player] of [...adviceCatalog.values()].entries())
      for (const scope of ['week', 'season', 'remaining'] as const)
        projections.push({
          id: `${player.id}-${scope}`,
          leagueId: league.id,
          sourceId: `fictional-${scope}`,
          scoringMatched: true,
          playerId: player.id,
          playerName: player.name,
          position: player.position,
          projectedPoints:
            (player.position === 'QB' ? 20 : player.position === 'WR' ? 15 : 12) + index,
          ...(scope === 'week'
            ? { week: 5 }
            : scope === 'season'
              ? { projectedPoints: 250 + index * 30, averageDraftPosition: index + 10 }
              : {
                  projectedPoints: 200 + index * 20,
                  period: { season: 2026, fromWeek: 5, throughWeek: 18 },
                }),
          sourceName: 'Fictional scoring-confirmed projections',
          importedAt: stamp,
        });
    state.playerProjections = projections;
    state.settings.aiRuntime = {
      mode: 'api',
      model: 'fixture-reasoning-model',
      command: '',
      args: '',
      baseUrl: 'https://example.test/v1',
      inputUsdPerMillionTokens: 1,
      outputUsdPerMillionTokens: 2,
    };
  });
}
export function adviceData(): FootballDataSnapshot {
  const data: FootballDataSnapshot = {
    season: 2026,
    players: [],
    games: [],
    market: [{ sleeperId: 'w3', adds: 120, drops: 10, lookbackHours: 24 }],
    sources: ['games', 'stats-2026', 'market-add', 'market-drop'].map((id) => ({
      id,
      name: `Fictional ${id}`,
      status: 'available',
      retrievedAt: stamp,
      url: `https://example.test/${id}`,
    })),
    warnings: [],
  };
  for (let week = 1; week <= 4; week++) {
    data.games.push({
      id: `played-${week}`,
      season: 2026,
      week,
      seasonType: 'REG',
      date: `2026-09-${10 + week}`,
      home: 'BUF',
      away: 'MIA',
      homeScore: 27 + week,
      awayScore: 21,
    });
    for (const player of adviceCatalog.values())
      data.players.push({
        playerId: player.gsisId!,
        name: player.name,
        position: player.position!,
        team: player.nflTeam!,
        opponent: player.nflTeam === 'BUF' ? 'MIA' : 'BUF',
        gameId: `played-${week}`,
        season: 2026,
        week,
        seasonType: 'REG',
        stats: {
          passing_yards: player.position === 'QB' ? 250 + week * 10 : 0,
          receptions: player.position === 'WR' ? 5 : 0,
          receiving_yards: player.position === 'WR' ? 70 + week * 10 : 0,
          targets: player.position === 'WR' ? 9 : 0,
          rushing_yards: player.position === 'RB' ? 80 : 0,
          carries: player.position === 'RB' ? 18 : 0,
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
  return data;
}
/** A deterministic external model substitute; actual production code computes all metrics. */
export function adviceAnswer(request: AIRequest) {
  const block = request.prompt.match(
    /<untrusted_advice_data>\n([\s\S]*?)\n<\/untrusted_advice_data>/,
  )?.[1];
  if (!block) throw new Error('Missing advice evidence.');
  const context = expandCompactAdviceEvidence(JSON.parse(block)) as unknown as {
    request: { mode: string; dropPlayerId?: string };
    decisionPolicy: { maximumVerdict: AdviceAssessment['verdict'] };
    metrics: AdviceMetric[];
    players: { id: string; metrics: AdviceMetric[] }[];
    sources: { id: string }[];
    allowedPlayerIds: string[];
    lineup?: { assignments: { playerId: string }[] };
    startSit?: { candidateIds: string[] };
  };
  const metric = context.metrics[0] ?? context.players.flatMap((player) => player.metrics)[0];
  const dropComparison = context.request.mode === 'waivers' && context.request.dropPlayerId;
  const comparisonMetrics = dropComparison
    ? context.metrics.filter(
        (m) =>
          m.id === 'waiver-before' ||
          m.id === 'waiver-drop' ||
          m.id === `${context.allowedPlayerIds[0]}:waiver-after` ||
          m.id === `${context.allowedPlayerIds[0]}:waiver-gain`,
      )
    : [];
  const answer: AdviceAssessment = {
    verdict: dropComparison
      ? context.decisionPolicy.maximumVerdict
      : metric
        ? 'lean'
        : 'insufficient',
    headline: 'Compare the fictional choices before acting',
    recommendedPlayerIds:
      dropComparison && ['hold', 'insufficient'].includes(context.decisionPolicy.maximumVerdict)
        ? []
        : context.startSit
          ? context.allowedPlayerIds.slice(0, 1)
          : context.request.mode === 'lineup'
            ? (context.lineup?.assignments.map((row) => row.playerId) ?? [])
            : context.allowedPlayerIds.slice(0, 1),
    reasons: [
      ...(comparisonMetrics.length
        ? [
            {
              text: `The proposed move compares ${comparisonMetrics.map((m) => `{{${m.id}}}`).join(' and ')}.`,
              metricIds: comparisonMetrics.map((m) => m.id),
              sourceIds: [],
            },
          ]
        : []),
      ...(context.startSit
        ? context.players
            .filter((player) => context.allowedPlayerIds.includes(player.id))
            .flatMap((player) => {
              const estimate = player.metrics.find((metric) =>
                /:(projected|baseline)$/.test(metric.id),
              );
              return estimate
                ? [
                    {
                      text: `This alternative has a weekly estimate of {{${estimate.id}}}.`,
                      metricIds: [estimate.id],
                      sourceIds: estimate.sourceIds,
                    },
                  ]
                : [];
            })
        : []),
      {
        text: metric
          ? `Computed supporting evidence is {{${metric.id}}}.`
          : 'The evidence is incomplete.',
        metricIds: metric ? [metric.id] : [],
        sourceIds: metric?.sourceIds ?? [],
      },
    ],
    risks: [
      {
        text: 'Confirm current availability and roster rules before acting.',
        metricIds: [],
        sourceIds: [],
      },
    ],
    alternative: {
      text: 'Keep the current choice until fresh evidence supports a change.',
      metricIds: [],
      sourceIds: [],
    },
    perception: {
      tone: 'unknown',
      text: 'The fictional headlines are a limited sample of perception.',
      metricIds: [],
      sourceIds: context.sources.some((source) => source.id === 'news-0') ? ['news-0'] : [],
    },
    ...(context.request.mode === 'betting'
      ? {
          forecast: {
            probability: 0.6,
            lower: 0.4,
            upper: 0.75,
            rationale: {
              text: 'This is an uncalibrated model judgment with substantial uncertainty.',
              metricIds: [],
              sourceIds: ['model-judgment'],
            },
          },
        }
      : {}),
  };
  return JSON.stringify(answer);
}
