import { expect, it } from 'vitest';
import type { LeagueConnection, RosterPlayer } from './domain-types.js';
import type { FootballDataSnapshot, FootballGame, PlayerGameStats } from './advice-types.js';
import { prepareFantasyForecast } from './fantasy-forecast.js';
import { buildPlayerEvidence } from './player-evidence.js';
import { buildFantasyAdvicePlan } from './fantasy-advice.js';
import { adviceDecisionPolicy } from './advice-policy.js';
import { footballStatKeys } from './advice-types.js';
import { scoreHistoricalGame } from './advice-math.js';

const target = { season: 2026, week: 5, asOf: '2026-10-07T12:00:00Z' };
const league: LeagueConnection = {
  id: 'forecast',
  name: 'Fictional',
  displayName: 'Fictional',
  platform: 'sleeper',
  season: 2026,
  teamCount: 2,
  teams: [],
  settings: {},
  scoring: { rec_yd: 0.1 },
  connectedAt: target.asOf,
};
const teams = ['BUF', 'MIA', 'KC', 'NYJ', 'NE', 'LA', 'SF', 'SEA'];
const player: RosterPlayer = {
  id: 'platform',
  gsisId: 'gsis-0',
  name: 'Fictional Receiver Alpha',
  nflTeam: 'BUF',
  position: 'WR',
};
function fixture() {
  const data: FootballDataSnapshot = {
    season: 2026,
    games: [],
    players: [],
    market: [],
    warnings: [],
    sources: ['games', 'stats-2025', 'stats-2026'].map((id) => ({
      id,
      name: id,
      status: 'available',
      retrievedAt: target.asOf,
    })),
  };
  for (const season of [2025, 2026]) {
    let appearance = 0;
    for (let week = 1; week <= 18; week++) {
      if (week === 10) continue;
      for (let pair = 0; pair < 4; pair++) {
        const date = new Date(
          Date.UTC(season, 8, season === 2025 ? 7 : 13) + (week - 1) * 7 * 86400000,
        )
          .toISOString()
          .slice(0, 10);
        const complete = season === 2025 || week < 5;
        const game: FootballGame = {
          id: `${season}-${week}-${pair}`,
          season,
          week,
          seasonType: 'REG',
          date,
          home: teams[2 * pair]!,
          away: teams[2 * pair + 1]!,
          ...(complete ? { homeScore: 24, awayScore: 21 } : {}),
        };
        data.games.push(game);
        if (complete)
          for (let side = 0; side < 2; side++) {
            const index = pair * 2 + side;
            const time = appearance + (season === 2026 ? 17 : 0);
            const points = 8 + index + (0.25 + index * 0.07) * time;
            const row: PlayerGameStats = {
              playerId: `gsis-${index}`,
              name:
                index === 0 ? player.name : `Fictional Receiver ${String.fromCharCode(65 + index)}`,
              position: 'WR',
              team: teams[index]!,
              opponent: teams[pair * 2 + 1 - side]!,
              gameId: game.id,
              season,
              week,
              seasonType: 'REG',
              stats: { receiving_yards: points * 10, targets: 5 + time * 0.2 },
            };
            data.players.push(row);
          }
      }
      appearance++;
    }
  }
  return data;
}
const kickingLeague = {
  ...league,
  scoring: {
    rec_yd: 0.1,
    fgm_0_19: 3,
    fgm_20_29: 3,
    fgm_30_39: 3,
    fgm_40_49: 4,
    fgm_50p: 5,
    xpm: 1,
    fgmiss: -1,
    xpmiss: -1,
    fum_lost: -2,
  },
};
const kicker = {
  ...player,
  id: 'kicker',
  gsisId: 'k-gsis-0',
  name: 'Fictional Kicker Alpha',
  position: 'K',
};
function kickingFixture() {
  const data = fixture();
  data.players.push(
    ...data.players.map((r) => {
      const blocked = r.week % 4 === 0 ? 1 : 0;
      return {
        ...r,
        playerId: `k-${r.playerId}`,
        name: r.playerId === 'gsis-0' ? kicker.name : `Fictional Kicker ${r.playerId}`,
        position: 'K',
        stats: {
          ...Object.fromEntries(footballStatKeys.map((key) => [key, 0])),
          fg_att: 2 + blocked,
          fg_made: 2,
          fg_made_40_49: 2,
          fg_blocked: blocked,
          fg_made_distance: 86,
          pat_att: 2,
          pat_made: 2,
        },
        madeFieldGoalDistances: [43, 43],
        blockedFieldGoalDistances: blocked ? [36] : [],
      };
    }),
  );
  return data;
}
it('forecasts kickers in their own evaluated cohort, preserves recorded/future scope and import priority', () => {
  const data = kickingFixture();
  const predict = prepareFantasyForecast(kickingLeague, data, target);
  const remaining = predict(kicker, 'remaining-season')!;
  expect(remaining).toBeDefined();
  expect(remaining.evaluation.cases).toBeGreaterThanOrEqual(40);
  expect(remaining.evaluation.weeks).toBeGreaterThanOrEqual(8);
  expect(remaining.futureGames).toBe(13);
  expect(remaining.recordedPoints).toBe(0);
  expect(remaining.warnings.join(' ')).toContain('weather');
  const full = predict(kicker, 'season')!;
  expect(full.recordedPoints).toBe(39);
  expect(full.points).toBeCloseTo(remaining.points + 39);
  const shortened = predict(kicker, 'remaining-season', 17)!;
  expect(shortened.futureGames).toBe(12);
  const onlyKickers = { ...data, players: data.players.filter((r) => r.position === 'K') };
  expect(
    prepareFantasyForecast(kickingLeague, onlyKickers, target)(kicker, 'remaining-season'),
  ).toEqual(remaining);
  const evidenceInput = {
    ...target,
    league: kickingLeague,
    data,
    players: [kicker],
    projections: [],
    scope: 'remaining-season' as const,
  };
  const automatic = buildPlayerEvidence(evidenceInput)[0]!;
  expect(automatic.projectedPoints).toBe(remaining.points);
  expect(automatic.metrics.find((m) => m.id.endsWith(':fg_att'))).toBeDefined();
  expect(automatic.metrics.some((m) => m.id.endsWith(':targets'))).toBe(false);
  expect(automatic.metrics.length).toBeLessThanOrEqual(30);
  const imported = buildPlayerEvidence({
    ...evidenceInput,
    projections: [
      {
        id: 'k-import',
        sourceId: 'confirmed-k',
        leagueId: league.id,
        sourceName: 'Confirmed kicker forecast',
        scoringMatched: true,
        playerId: kicker.id,
        playerName: kicker.name,
        position: 'K',
        projectedPoints: 200,
        period: { season: 2026, fromWeek: 5, throughWeek: 18 },
        importedAt: target.asOf,
      },
    ],
  })[0]!;
  expect(imported.projectionMethod).toBe('imported');
  expect(imported.projectedPoints).toBe(200);
});
it('keeps kicker forecasts independent of later outcomes and withholds unknown scoring/availability', () => {
  const data = kickingFixture();
  const before = prepareFantasyForecast(kickingLeague, data, target)(kicker, 'remaining-season');
  const later = data.players.find((r) => r.playerId === kicker.gsisId)!;
  data.players.push({
    ...later,
    season: 2026,
    week: 5,
    gameId: '2026-5-0',
    stats: { ...later.stats, fg_made: 19 },
  });
  expect(prepareFantasyForecast(kickingLeague, data, target)(kicker, 'remaining-season')).toEqual(
    before,
  );
  expect(
    prepareFantasyForecast(
      { ...kickingLeague, scoring: { fgm: 3, unknown_kicker_bonus: 2 } },
      data,
      target,
    )(kicker, 'remaining-season'),
  ).toBeUndefined();
  data.players = data.players.filter(
    (r) => r.playerId !== kicker.gsisId || r.gameId !== '2026-1-0',
  );
  expect(prepareFantasyForecast(kickingLeague, data, target)(kicker, 'season')).toBeUndefined();
  const unavailable = buildPlayerEvidence({
    ...target,
    league: kickingLeague,
    data,
    players: [{ ...kicker, status: 'Out' }],
    projections: [],
    scope: 'week',
  })[0]!;
  expect(unavailable.projectedPoints).toBeUndefined();
  const weekly = buildPlayerEvidence({
    ...target,
    league: kickingLeague,
    data: kickingFixture(),
    players: [kicker],
    projections: [],
    scope: 'week',
  })[0]!;
  const prior = kickingFixture()
    .players.filter((r) => r.playerId === kicker.gsisId)
    .sort((a, b) => b.season - a.season || b.week - a.week)
    .slice(0, 8);
  // The kicker projection is a recency-weighted average, close to the plain 8-game mean here.
  expect(weekly.projectedPoints).toBeCloseTo(
    prior.reduce((sum, r) => sum + scoreHistoricalGame(kickingLeague, r).points!, 0) / 8,
    0,
  );
  const missing = kickingFixture();
  delete missing.players.find(
    (r) => r.playerId === kicker.gsisId && r.season === 2026 && r.week === 4,
  )!.stats.fg_blocked;
  const insufficient = buildPlayerEvidence({
    ...target,
    league: kickingLeague,
    data: missing,
    players: [kicker],
    projections: [],
    scope: 'week',
  })[0]!;
  expect(insufficient.projectedPoints).toBeUndefined();
});
it('learns form/workload/opponent adjustments chronologically and provides a source-linked remaining window', () => {
  const data = fixture(),
    forecast = prepareFantasyForecast(league, data, target)(player, 'remaining-season')!;
  expect(forecast).toBeDefined();
  expect(forecast.method).toBe('rolling-form-v1');
  expect(forecast.futureGames).toBe(13);
  expect(forecast.recordedPoints).toBe(0);
  expect(forecast.evaluation.cases).toBeGreaterThanOrEqual(40);
  expect(forecast.evaluation.weeks).toBeGreaterThanOrEqual(8);
  expect(forecast.evaluation.mae).toBeLessThan(forecast.evaluation.baselineMae);
  expect(forecast.lower).toBeLessThanOrEqual(forecast.points);
  expect(forecast.upper).toBeGreaterThanOrEqual(forecast.points);
  expect(forecast.points).toBeCloseTo(
    forecast.baselinePoints +
      forecast.formAdjustment +
      forecast.workloadAdjustment +
      forecast.opponentAdjustment,
  );
  expect(forecast.sourceIds).toEqual(['games', 'stats-2025', 'stats-2026']);
  const shorter = prepareFantasyForecast(league, data, target)(player, 'remaining-season', 17)!;
  expect(shorter.futureGames).toBe(12);
  expect(shorter.points).toBeLessThan(forecast.points);
  const full = prepareFantasyForecast(league, data, target)(player, 'season')!;
  expect(full.futureGames).toBe(13);
  expect(full.recordedPoints).toBeCloseTo(50.5);
  expect(full.points).toBeCloseTo(forecast.points + full.recordedPoints);
});
it('supports a preseason draft using two prior seasons without letting later scored games enter the forecast', () => {
  const data = fixture();
  data.games.push(
    ...data.games
      .filter((g) => g.season === 2025)
      .map((g) => ({
        ...g,
        season: 2024,
        id: g.id.replace('2025', '2024'),
        date: new Date(Date.parse(g.date) - 365 * 86400000).toISOString().slice(0, 10),
      })),
  );
  data.players.push(
    ...data.players
      .filter((r) => r.season === 2025)
      .map((r) => ({ ...r, season: 2024, gameId: r.gameId.replace('2025', '2024') })),
  );
  const preseason = { ...target, week: 1, asOf: '2026-08-15T12:00:00Z' };
  data.sources.push({
    id: 'stats-2024',
    name: 'Prior public season',
    status: 'available',
    retrievedAt: preseason.asOf,
  });
  for (const source of data.sources) source.retrievedAt = preseason.asOf;
  for (const g of data.games.filter((g) => g.season === 2026)) {
    delete g.homeScore;
    delete g.awayScore;
  }
  const forecast = prepareFantasyForecast(league, data, preseason)(player, 'season')!;
  expect(forecast).toBeDefined();
  expect(forecast.futureGames).toBe(17);
  expect(forecast.recordedPoints).toBe(0);
  expect(forecast.sourceIds).not.toContain('stats-2026');
  expect(forecast.evaluation.weeks).toBeGreaterThanOrEqual(8);
  const changed = structuredClone(data);
  for (const r of changed.players.filter((r) => r.season === 2026)) r.stats.receiving_yards = 99999;
  expect(prepareFantasyForecast(league, changed, preseason)(player, 'season')).toEqual(forecast);
  expect(
    prepareFantasyForecast(
      league,
      data,
      preseason,
    )({ ...player, name: 'Fictional Rookie', gsisId: 'new' }, 'season'),
  ).toBeUndefined();
});
it('rejects an ambiguous historical game and keeps incomplete opponent contributors out of learned totals', () => {
  const missing = fixture();
  const row = missing.players.find(
    (r) => r.playerId === 'gsis-7' && r.season === 2025 && r.week === 15,
  )!;
  delete row.stats.receiving_yards;
  const duplicate = fixture();
  duplicate.players.push(
    structuredClone(
      duplicate.players.find((r) => r.playerId === 'gsis-7' && r.season === 2025 && r.week === 15)!,
    ),
  );
  expect(prepareFantasyForecast(league, duplicate, target)(player, 'remaining-season')).toEqual(
    prepareFantasyForecast(league, missing, target)(player, 'remaining-season'),
  );
  const ambiguous = fixture();
  ambiguous.games.push({ ...ambiguous.games.find((g) => g.id === '2026-1-0')!, homeScore: 50 });
  expect(prepareFantasyForecast(league, ambiguous, target)(player, 'season')).toBeUndefined();
});
it('retains automatic range evidence and limits a complete trade to tentative evidence confidence', () => {
  const other = {
    ...player,
    id: 'other',
    gsisId: 'gsis-1',
    name: 'Fictional Receiver B',
    nflTeam: 'MIA',
  };
  const connected = {
    ...league,
    lastSyncedAt: target.asOf,
    settings: { currentWeek: 5, roster_positions: ['WR'] },
    teams: [
      { id: 'mine', name: 'Mine', roster: [player], rosterSize: 1 },
      { id: 'theirs', name: 'Theirs', roster: [other], rosterSize: 1 },
    ],
  };
  const players = buildPlayerEvidence({
    ...target,
    league: connected,
    data: fixture(),
    players: [player, other],
    projections: [],
    scope: 'remaining-season',
  });
  const request = {
    mode: 'trade' as const,
    leagueId: league.id,
    teamId: 'mine',
    tradeTeamId: 'theirs',
    giveIds: [player.id],
    receiveIds: [other.id],
    week: 5,
    season: 2026,
    throughWeek: 18,
  };
  const plan = buildFantasyAdvicePlan(connected, request, players, target.asOf);
  expect(plan.metrics.find((m) => m.id === 'trade-gain')?.value).toBeGreaterThan(0);
  expect(plan.confidence.score).toBeLessThanOrEqual(69);
  expect(plan.confidence.meaning).toContain('participation');
  expect(adviceDecisionPolicy(request, plan, undefined, players).maximumVerdict).toBe('lean');
});
it('does not use a target or later outcome to forecast an earlier window and groups simultaneous outcomes', () => {
  const data = fixture(),
    before = prepareFantasyForecast(league, data, target)(player, 'remaining-season', 9);
  const changed = structuredClone(data);
  changed.players.push({
    ...changed.players[0]!,
    season: 2026,
    week: 5,
    gameId: '2026-5-0',
    stats: { receiving_yards: 9999, targets: 999 },
  });
  changed.players.push({
    ...changed.players[0]!,
    season: 2026,
    week: 14,
    gameId: '2026-14-0',
    stats: { receiving_yards: 8888 },
  });
  expect(prepareFantasyForecast(league, changed, target)(player, 'remaining-season', 9)).toEqual(
    before,
  );
  const reversed = { ...data, players: [...data.players].reverse() };
  expect(prepareFantasyForecast(league, reversed, target)(player, 'remaining-season', 9)).toEqual(
    before,
  );
});
it('refuses incomplete schedules, stale sources, unknown identity/scoring and absent credited-game rows', () => {
  for (const alter of [
    (d: FootballDataSnapshot) => {
      d.games = d.games.filter((g) => g.id !== '2026-18-0');
    },
    (d: FootballDataSnapshot) => {
      d.games.push({ ...d.games.find((g) => g.id === '2026-18-0')!, id: 'duplicate-week' });
    },
    (d: FootballDataSnapshot) => {
      d.sources[0]!.status = 'unavailable';
    },
    (d: FootballDataSnapshot) => {
      d.sources[0]!.retrievedAt = '2026-10-01T00:00:00Z';
    },
  ]) {
    const data = fixture();
    alter(data);
    expect(
      prepareFantasyForecast(league, data, target)(player, 'remaining-season'),
    ).toBeUndefined();
  }
  expect(
    prepareFantasyForecast(
      { ...league, scoring: { unknown_rule: 3 } },
      fixture(),
      target,
    )(player, 'remaining-season'),
  ).toBeUndefined();
  expect(
    prepareFantasyForecast(
      league,
      fixture(),
      target,
    )({ ...player, gsisId: 'wrong-id' }, 'remaining-season'),
  ).toBeUndefined();
  const missing = fixture();
  missing.players = missing.players.filter(
    (r) => r.gameId !== '2026-1-0' || r.playerId !== 'gsis-0',
  );
  expect(prepareFantasyForecast(league, missing, target)(player, 'season')).toBeUndefined();
  expect(prepareFantasyForecast(league, missing, target)(player, 'remaining-season')).toBeDefined();
});
it('counts byes correctly and excludes a started game from remaining value without inventing full-season credited points', () => {
  const data = fixture(),
    sunday = { ...target, asOf: '2026-10-11T16:00:00Z' };
  for (const source of data.sources) source.retrievedAt = sunday.asOf;
  expect(prepareFantasyForecast(league, data, sunday)(player, 'remaining-season')).toBeUndefined();
  data.games.find((g) => g.id === '2026-5-0')!.kickoffAt = '2026-10-11T17:00:00Z';
  expect(
    prepareFantasyForecast(league, data, sunday)(player, 'remaining-season')?.futureGames,
  ).toBe(13);
  const after = { ...sunday, asOf: '2026-10-11T18:00:00Z' };
  expect(prepareFantasyForecast(league, data, after)(player, 'remaining-season')?.futureGames).toBe(
    12,
  );
  expect(prepareFantasyForecast(league, data, after)(player, 'season')).toBeUndefined();
});
it('uses an evaluated baseline if added adjustments do not improve earlier predictions', () => {
  const data = fixture();
  for (const row of data.players) {
    row.stats.receiving_yards = 100;
    row.stats.targets = 8;
  }
  const forecast = prepareFantasyForecast(league, data, target)(player, 'remaining-season')!;
  expect(forecast.method).toBe('rolling-baseline-v1');
  expect(forecast.points).toBe(130);
  expect(forecast.warnings.join(' ')).toContain('lacked reliable gains');
});

it('reports the selected baseline error separately from an unsupported adjustment candidate', () => {
  const data = fixture();
  let seed = 3077;
  for (const row of data.players) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    row.stats.receiving_yards = 20 + (seed % 140);
    row.stats.targets = 8;
  }
  const forecast = prepareFantasyForecast(league, data, target)(player, 'remaining-season')!;
  expect(forecast.method).toBe('rolling-baseline-v1');
  expect(forecast.evaluation.mae).toBe(forecast.evaluation.baselineMae);
  expect(forecast.evaluation.candidateMae).not.toBe(forecast.evaluation.mae);
  expect(forecast.evaluation.improvementLower).toBeLessThanOrEqual(0);
});
it('integrates automatic period estimates without replacing scoring-confirmed imports', () => {
  const input = {
    ...target,
    league,
    data: fixture(),
    players: [player],
    scope: 'remaining-season' as const,
    projections: [],
  };
  const automatic = buildPlayerEvidence(input)[0]!;
  expect(automatic.projectionMethod).toBe('rolling-form-v1');
  expect(automatic.projectionPeriod).toEqual({ season: 2026, fromWeek: 5, throughWeek: 18 });
  expect(automatic.metrics.find((m) => m.id.endsWith(':forecast-games'))?.value).toBe(13);
  const imported = buildPlayerEvidence({
    ...input,
    projections: [
      {
        id: 'import',
        leagueId: league.id,
        sourceId: 'confirmed',
        sourceName: 'Confirmed owner source',
        scoringMatched: true,
        playerId: player.id,
        playerName: player.name,
        position: player.position!,
        projectedPoints: 300,
        importedAt: target.asOf,
        period: { season: 2026, fromWeek: 5, throughWeek: 18 },
      },
    ],
  })[0]!;
  expect(imported.projectionMethod).toBe('imported');
  expect(imported.projectedPoints).toBe(300);
});

const defensePlayer: RosterPlayer = {
  id: 'BUF',
  name: 'Buffalo D/ST',
  position: 'DEF',
  nflTeam: 'BUF',
};
const defenseLeague = {
  ...league,
  scoring: {
    sack: 1,
    int: 2,
    fum_rec: 2,
    def_td: 6,
    def_st_td: 6,
    safe: 2,
    blk_kick: 2,
    pts_allow_7_13: 4,
    pass_yd: 0.04,
    fgm: 3,
  },
};
function defenseFixture() {
  const data = fixture();
  for (const game of data.games.filter((g) => g.homeScore !== undefined))
    for (const [index, team] of [game.home, game.away].entries()) {
      const id = `dst-${game.season}-${game.week}`;
      if (!data.sources.some((s) => s.id === id))
        data.sources.push({ id, name: id, status: 'available', retrievedAt: target.asOf });
      data.players.push({
        playerId: `dst:${team}`,
        name: `${team} team defense`,
        position: 'DST',
        team,
        opponent: team === game.home ? game.away : game.home,
        gameId: game.id,
        season: game.season,
        week: game.week,
        seasonType: 'REG',
        sourceIds: [id],
        stats: {
          dst_sacks: 3 + index,
          dst_interceptions: 1,
          dst_fumble_recoveries: 0,
          dst_touchdowns: 0,
          dst_special_teams_touchdowns: 0,
          dst_safeties: 0,
          dst_blocked_kicks: 0,
          dst_points_allowed: 13,
          dst_yards_allowed: 250,
        },
      });
    }
  return data;
}
it('provides team-joined defense history, weekly/season numbers and independent evaluated cohorts with complete weekly provenance', () => {
  const data = defenseFixture();
  const forecast = prepareFantasyForecast(
    defenseLeague,
    data,
    target,
  )(defensePlayer, 'remaining-season')!;
  expect(forecast).toBeDefined();
  expect(forecast.futureGames).toBe(13);
  expect(forecast.points).toBe(117);
  expect(forecast.evaluation.cases).toBeGreaterThanOrEqual(40);
  expect(forecast.evaluation.weeks).toBeGreaterThanOrEqual(8);
  expect(forecast.sourceIds).toContain('dst-2025-1');
  expect(forecast.sourceIds.some((id) => id.startsWith('stats-'))).toBe(false);
  expect(
    prepareFantasyForecast(
      defenseLeague,
      { ...data, players: data.players.filter((r) => r.position === 'DST') },
      target,
    )(defensePlayer, 'remaining-season'),
  ).toEqual(forecast);
  expect(
    prepareFantasyForecast(defenseLeague, data, target)(defensePlayer, 'season')!.recordedPoints,
  ).toBe(36);
  const input = {
    ...target,
    data,
    league: defenseLeague,
    players: [defensePlayer],
    projections: [],
    scope: 'week' as const,
  };
  const evidence = buildPlayerEvidence(input)[0]!;
  expect(evidence.position).toBe('DST');
  expect(evidence.projectedPoints).toBeCloseTo(9);
  expect(evidence.metrics.find((m) => m.id.endsWith(':dst_sacks'))!.value).toBe(3);
  expect(evidence.metrics.some((m) => m.id.endsWith(':targets'))).toBe(false);
  expect(evidence.projectionSourceIds).toContain('games');
  const imported = buildPlayerEvidence({
    ...input,
    projections: [
      {
        id: 'def-import',
        leagueId: league.id,
        sourceId: 'confirmed',
        sourceName: 'Owner confirmed DST',
        scoringMatched: true,
        playerId: 'BUF',
        playerName: defensePlayer.name,
        position: 'DEF',
        week: 5,
        projectedPoints: 15,
        importedAt: target.asOf,
      },
    ],
  })[0]!;
  expect(imported.projectedPoints).toBe(15);
  expect(imported.projectionMethod).toBe('imported');
});
it('withholds incomplete, duplicate, stale and missing latest defense appearances instead of selecting an older favorable sample', () => {
  for (const alter of [
    (d: FootballDataSnapshot) => {
      delete d.players.find((r) => r.playerId === 'dst:BUF' && r.season === 2026 && r.week === 4)!
        .stats.dst_touchdowns;
    },
    (d: FootballDataSnapshot) => {
      d.players = d.players.filter((r) => r.playerId !== 'dst:BUF' || r.gameId !== '2026-4-0');
    },
    (d: FootballDataSnapshot) => {
      d.players.push({
        ...d.players.find((r) => r.playerId === 'dst:BUF' && r.season === 2026 && r.week === 4)!,
      });
    },
    (d: FootballDataSnapshot) => {
      d.sources.find((s) => s.id === 'dst-2026-4')!.retrievedAt = '2026-10-01T00:00:00Z';
    },
  ]) {
    const data = defenseFixture();
    alter(data);
    expect(
      prepareFantasyForecast(defenseLeague, data, target)(defensePlayer, 'remaining-season'),
    ).toBeUndefined();
    expect(
      buildPlayerEvidence({
        ...target,
        data,
        league: defenseLeague,
        players: [defensePlayer],
        projections: [],
        scope: 'week',
      })[0]!.projectedPoints,
    ).toBeUndefined();
  }
});
it('keeps negative defense estimates, future outcomes and conflicting roster identity from distorting a chronological forecast', () => {
  const data = defenseFixture();
  for (const row of data.players.filter((r) => r.position === 'DST'))
    row.stats.dst_points_allowed = 45;
  const negative = { ...defenseLeague, scoring: { pts_allow_35p: -4, sack: 0 } };
  const before = prepareFantasyForecast(negative, data, target)(defensePlayer, 'remaining-season')!;
  expect(before.points).toBe(-52);
  data.players.push({
    ...data.players.find((r) => r.playerId === 'dst:BUF')!,
    week: 5,
    season: 2026,
    gameId: '2026-5-0',
    stats: { dst_points_allowed: 0 },
  });
  expect(prepareFantasyForecast(negative, data, target)(defensePlayer, 'remaining-season')).toEqual(
    before,
  );
  expect(
    prepareFantasyForecast(
      negative,
      data,
      target,
    )({ ...defensePlayer, nflTeam: 'MIA' }, 'remaining-season'),
  ).toBeUndefined();
});
