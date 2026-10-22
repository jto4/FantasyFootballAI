import { describe, expect, it } from 'vitest';
import {
  adviceConfidence,
  americanOdds,
  analyzeBetHistory,
  historicalPlayerGames,
  optimizeLineup,
  scoreHistoricalGame,
  wilsonInterval,
  isUpcomingFootballGame,
} from './advice-math.js';
import { kickingStatKeys } from './advice-types.js';
import type {
  FootballDataSnapshot,
  FootballGame,
  PlayerAdviceEvidence,
  PlayerGameStats,
} from './advice-types.js';

const row: PlayerGameStats = {
  playerId: 'gsis-1',
  name: 'Fictional Receiver',
  position: 'WR',
  team: 'BUF',
  opponent: 'MIA',
  gameId: 'past',
  season: 2026,
  week: 1,
  seasonType: 'REG',
  stats: {
    receiving_yards: 100,
    receiving_tds: 1,
    receptions: 5,
    receiving_fumbles_lost: 0,
    rushing_fumbles_lost: 0,
    sack_fumbles_lost: 0,
  },
};
const game = (values: Partial<FootballGame> = {}): FootballGame => ({
  id: 'past',
  season: 2026,
  week: 1,
  seasonType: 'REG',
  date: '2026-09-10',
  home: 'BUF',
  away: 'MIA',
  homeScore: 27,
  awayScore: 24,
  ...values,
});
const snapshot = (values: Partial<FootballDataSnapshot> = {}): FootballDataSnapshot => ({
  season: 2026,
  players: [row],
  games: [game()],
  market: [],
  sources: [],
  warnings: [],
  ...values,
});

it('requires verified future kickoff for same-day games and handles UTC day rollover without treating missing scores as pregame evidence', () => {
  const now = '2026-10-11T17:00:00Z';
  const upcoming = game({ date: '2026-10-11' });
  delete upcoming.homeScore;
  delete upcoming.awayScore;
  expect(isUpcomingFootballGame(upcoming, now)).toBe(false);
  expect(isUpcomingFootballGame({ ...upcoming, kickoffAt: '2026-10-11T17:00:00Z' }, now)).toBe(
    false,
  );
  expect(isUpcomingFootballGame({ ...upcoming, kickoffAt: '2026-10-11T17:01:00Z' }, now)).toBe(
    true,
  );
  expect(isUpcomingFootballGame({ ...upcoming, kickoffAt: '2026-10-11T16:59:00Z' }, now)).toBe(
    false,
  );
  expect(isUpcomingFootballGame({ ...upcoming, kickoffAt: '2026-10-11T18:00:00' }, now)).toBe(
    false,
  );
  expect(isUpcomingFootballGame({ ...upcoming, date: '2026-10-12' }, now)).toBe(true);
  expect(
    isUpcomingFootballGame(
      { ...upcoming, kickoffAt: '2026-10-12T00:20:00Z' },
      '2026-10-12T00:10:00Z',
    ),
  ).toBe(true);
  expect(
    isUpcomingFootballGame({ ...upcoming, homeScore: 0, kickoffAt: '2026-10-11T18:00:00Z' }, now),
  ).toBe(false);
});
const player = (id: string, position: string, points?: number): PlayerAdviceEvidence => ({
  id,
  name: id,
  position,
  ...(points !== undefined ? { projectedPoints: points } : {}),
  projectionSourceIds: [],
  metrics: [],
  historicalPoints: [],
  warnings: [],
});

describe('league-specific player scoring', () => {
  const kicker: PlayerGameStats = {
    ...row,
    name: 'Fictional Kicker',
    position: 'K',
    stats: {
      ...Object.fromEntries(kickingStatKeys.map((key) => [key, 0])),
      fg_made: 4,
      fg_att: 8,
      fg_missed: 2,
      fg_blocked: 2,
      fg_made_0_19: 1,
      fg_made_20_29: 1,
      fg_made_40_49: 1,
      fg_made_60_: 1,
      fg_missed_20_29: 1,
      fg_missed_50_59: 1,
      fg_made_distance: 157,
      pat_made: 2,
      pat_att: 4,
      pat_missed: 1,
      pat_blocked: 1,
    },
    madeFieldGoalDistances: [19, 29, 49, 60],
    blockedFieldGoalDistances: [36, 60],
  };
  it('scores made kicks, blocks as misses, distance bands and configured overlapping rules', () => {
    const score = (scoring: Record<string, number>) =>
      scoreHistoricalGame({ platform: 'sleeper', scoring }, kicker);
    expect(score({ fgm: 3, xpm: 1, fgmiss: -1, xpmiss: -1, sack: 1 })).toEqual({
      points: 8,
      unsupported: [],
      missing: [],
    });
    expect(
      score({ fgm_0_19: 3, fgm_20_29: 3, fgm_30_39: 3, fgm_40_49: 4, fgm_50p: 5, xpm: 1 }).points,
    ).toBe(17);
    expect(score({ fgmiss_20_29: -2, fgmiss_30_39: -3, fgmiss_50p: -4 }).points).toBe(-13);
    expect(score({ fgm_50p: 5, fgm_50_59: 2, fgm_60p: 1 }).points).toBe(6);
    expect(score({ fgmiss_50p: -2, fgmiss_50_59: -3, fgmiss_60p: -1 }).points).toBe(-8);
    expect(score({ fgm_yds: 0.1 }).points).toBeCloseTo(15.7);
    expect(score({ fgm: 3, fgm_yds_over_30: 0.1 }).points).toBeCloseTo(16.9);
    expect(
      scoreHistoricalGame(
        {
          platform: 'yahoo',
          scoring: {
            'Field Goals 0-19 Yards': 3,
            'Field Goals 20-29 Yards': 3,
            'Field Goals 30-39 Yards': 3,
            'Field Goals 40-49 Yards': 4,
            'Field Goals 50+ Yards': 5,
            'Point After Attempt Made': 1,
          },
        },
        kicker,
      ).points,
    ).toBe(17);
  });
  it('withholds kick penalties when block counts or distances are unknown and preserves rare offensive contributions', () => {
    const absent = { ...kicker, stats: { ...kicker.stats } };
    delete absent.blockedFieldGoalDistances;
    expect(
      scoreHistoricalGame({ platform: 'sleeper', scoring: { fgmiss_30_39: -1 } }, absent),
    ).toEqual({ unsupported: [], missing: ['blockedFieldGoalDistances'] });
    expect(
      scoreHistoricalGame({ platform: 'sleeper', scoring: { fgmiss: -1 } }, absent).points,
    ).toBe(-4);
    delete absent.stats.fg_blocked;
    expect(
      scoreHistoricalGame({ platform: 'sleeper', scoring: { fgmiss: -1 } }, absent).points,
    ).toBeUndefined();
    absent.stats.fg_blocked = 0;
    expect(
      scoreHistoricalGame({ platform: 'sleeper', scoring: { fgmiss_30_39: -1 } }, absent).points,
    ).toBe(0);
    const noMadeDistances = { ...kicker };
    delete noMadeDistances.madeFieldGoalDistances;
    expect(
      scoreHistoricalGame(
        { platform: 'sleeper', scoring: { fgm_yds_over_30: 0.1 } },
        noMadeDistances,
      ).points,
    ).toBeUndefined();
    expect(
      scoreHistoricalGame(
        { platform: 'sleeper', scoring: { fgm: 3, unknown_kicker_bonus: 2 } },
        kicker,
      ).points,
    ).toBeUndefined();
    expect(
      scoreHistoricalGame({ platform: 'sleeper', scoring: { fgm: 3, constructor: 1 } }, kicker)
        .unsupported,
    ).toEqual(['constructor']);
    expect(
      scoreHistoricalGame(
        { platform: 'sleeper', scoring: { fgm: 3, fum_lost: -2 } },
        {
          ...kicker,
          stats: {
            ...kicker.stats,
            rushing_fumbles_lost: 1,
            receiving_fumbles_lost: 0,
            sack_fumbles_lost: 0,
          },
        },
      ).points,
    ).toBe(10);
    expect(
      scoreHistoricalGame(
        { platform: 'sleeper', scoring: { rec: 1, fgm_yds_over_30: 0.1, fgmiss_60p: -1 } },
        row,
      ).points,
    ).toBe(5);
  });
  it('applies actual PPR and yard/TD rules without counting team defense', () => {
    expect(
      scoreHistoricalGame(
        {
          platform: 'sleeper',
          scoring: { rec: 1, rec_yd: 0.1, rec_td: 6, fum_lost: -2, sack: 1, pts_allow_0: 10 },
        },
        row,
      ),
    ).toEqual({ points: 21, unsupported: [], missing: [] });
    expect(
      scoreHistoricalGame(
        { platform: 'sleeper', scoring: { rec: 0.5, rec_yd: 0.1, rec_td: 6 } },
        row,
      ).points,
    ).toBe(18.5);
  });
  it('withholds scores for bonuses, unfamiliar platform IDs, and missing statistics', () => {
    expect(
      scoreHistoricalGame({ platform: 'sleeper', scoring: { rec: 1, bonus_rec_yd_100: 3 } }, row),
    ).toEqual({ unsupported: ['bonus_rec_yd_100'], missing: [] });
    expect(
      scoreHistoricalGame({ platform: 'espn', scoring: { '999': 1 } }, row).points,
    ).toBeUndefined();
    expect(scoreHistoricalGame({ platform: 'sleeper', scoring: { rush_yd: 0.1 } }, row)).toEqual({
      unsupported: [],
      missing: ['rushing_yards'],
    });
    expect(scoreHistoricalGame({ platform: 'sleeper', scoring: {} }, row).points).toBeUndefined();
  });
});

describe('legal starting lineups', () => {
  it('reserves the only TE for TE and never uses a player twice', () => {
    const result = optimizeLineup(
      [player('tight-end', 'TE', 20), player('runner', 'RB', 18), player('receiver', 'WR', 15)],
      ['FLEX', 'TE', 'BN'],
    );
    expect(result.complete).toBe(true);
    expect(result.points).toBe(38);
    expect(result.assignments).toEqual([
      { slot: 'TE 2', playerId: 'tight-end', points: 20 },
      { slot: 'FLEX 1', playerId: 'runner', points: 18 },
    ]);
  });
  it('handles superflex and forced negative scores, but never treats missing projections as zero', () => {
    expect(
      optimizeLineup([player('qb', 'QB', 25), player('rb', 'RB', 20)], ['QB', 'SUPERFLEX']).points,
    ).toBe(45);
    expect(optimizeLineup([player('qb', 'QB', -2)], ['QB']).points).toBe(-2);
    const incomplete = optimizeLineup([player('qb', 'QB', 20), player('te', 'TE')], ['QB', 'TE']);
    expect(incomplete.complete).toBe(false);
    expect(incomplete.points).toBeUndefined();
    expect(incomplete.missingSlots).toEqual(['TE']);
    expect(optimizeLineup([player('qb', 'QB', 20)], ['QB', 'IDP']).complete).toBe(false);
    expect(
      optimizeLineup([player('same', 'QB', 20), player('same', 'QB', 30)], ['QB']).complete,
    ).toBe(false);
  });
});

describe('historical samples and betting terms', () => {
  it('excludes target-week, unscored, postseason and future-day data', () => {
    const data = snapshot({
      players: [
        row,
        { ...row, gameId: 'target', week: 2 },
        { ...row, gameId: 'post', seasonType: 'POST' },
        { ...row, gameId: 'future', week: 1 },
      ],
      games: [
        game(),
        game({ id: 'target', week: 2 }),
        game({ id: 'post' }),
        game({ id: 'future', date: '2026-09-25' }),
      ],
    });
    expect(
      historicalPlayerGames(data, { season: 2026, week: 2, asOf: '2026-09-20T12:00:00Z' }),
    ).toEqual([row]);
  });
  it('computes positive/negative American odds and rejects invalid prices', () => {
    expect(americanOdds(150)).toEqual({ profitPerUnit: 1.5, breakEvenRate: 0.4 });
    expect(americanOdds(-200)).toEqual({ profitPerUnit: 0.5, breakEvenRate: 2 / 3 });
    for (const invalid of [0, 99, -99, NaN, Infinity, 110.5])
      expect(() => americanOdds(invalid)).toThrow();
  });
  it('uses selected-team handicap sign, excludes pushes from rate, includes refunds in ROI', () => {
    const upcoming: FootballGame = {
      id: 'upcoming',
      season: 2026,
      week: 3,
      seasonType: 'REG',
      date: '2026-09-27',
      home: 'BUF',
      away: 'MIA',
    };
    const data = snapshot({
      games: [
        game(),
        game({
          id: 'loss',
          week: 2,
          date: '2026-09-17',
          home: 'MIA',
          away: 'BUF',
          homeScore: 24,
          awayScore: 20,
        }),
        upcoming,
      ],
    });
    const evidence = analyzeBetHistory(
      {
        kind: 'spread',
        gameId: 'upcoming',
        side: 'home',
        line: -3,
        americanOdds: -110,
        oppositeAmericanOdds: -110,
      },
      data,
      '2026-09-20T12:00:00Z',
    );
    expect(evidence.pushes).toBe(1);
    expect(evidence.losses).toBe(1);
    expect(evidence.wins).toBe(0);
    expect(evidence.historicalRate).toBe(0);
    expect(evidence.historicalRoi).toBe(-0.5);
    expect(evidence.metrics.find((metric) => metric.id === 'odds-no-vig')?.value).toBe(50);
    expect(evidence.warnings.join(' ')).toContain('not calibrated forecasts');
  });
  it('handles prop over/under, no sample, and rejects a completed target game', () => {
    const upcoming: FootballGame = {
      id: 'upcoming',
      season: 2026,
      week: 2,
      seasonType: 'REG',
      date: '2026-09-27',
      home: 'BUF',
      away: 'MIA',
    };
    const data = snapshot({ games: [game(), upcoming] });
    expect(
      analyzeBetHistory(
        {
          kind: 'player-prop',
          gameId: 'upcoming',
          playerId: row.playerId,
          stat: 'receiving_yards',
          side: 'over',
          line: 99.5,
          americanOdds: 100,
        },
        data,
        '2026-09-20',
      ).wins,
    ).toBe(1);
    expect(
      analyzeBetHistory(
        {
          kind: 'player-prop',
          gameId: 'upcoming',
          playerId: 'missing',
          stat: 'receiving_yards',
          side: 'under',
          line: 99.5,
          americanOdds: 100,
        },
        data,
        '2026-09-20',
      ).historicalRate,
    ).toBeUndefined();
    expect(() =>
      analyzeBetHistory(
        { kind: 'moneyline', gameId: 'past', side: 'home', americanOdds: 100 },
        data,
        '2026-09-20',
      ),
    ).toThrow('upcoming');
    expect(wilsonInterval(10, 10)[0]).toBeCloseTo(0.722467, 5);
    expect(wilsonInterval(0, 10)[1]).toBeCloseTo(0.277533, 5);
  });
});

it('caps confidence for stale, short-sample or incomplete evidence and distinguishes it from success probability', () => {
  const full = {
    coverage: 1,
    fresh: true,
    sampleSize: 12,
    independentSources: 3,
    decisionMargin: 10,
    uncertainty: 1,
  };
  expect(adviceConfidence(full).score).toBe(100);
  expect(adviceConfidence({ ...full, coverage: 0.9 }).score).toBeLessThanOrEqual(49);
  expect(adviceConfidence({ ...full, fresh: false }).score).toBeLessThanOrEqual(59);
  expect(adviceConfidence({ ...full, sampleSize: 2 }).score).toBeLessThanOrEqual(59);
  expect(adviceConfidence(full).meaning).toContain('not a win probability');
});

it('scores ESPN leagues from numeric stat IDs and leaves return/defensive TDs out', () => {
  const espn = {
    platform: 'espn' as const,
    scoring: {
      '3': 0.04,
      '4': 4,
      '20': -2,
      '42': 0.1,
      '43': 6,
      '53': 0.5,
      '72': -2,
      '101': 6,
      '89': 0,
    },
  };
  const scored = scoreHistoricalGame(espn, {
    playerId: 'p',
    name: 'Fictional Receiver',
    position: 'WR',
    team: 'LA',
    opponent: 'SF',
    gameId: 'g',
    season: 2026,
    week: 7,
    seasonType: 'REG',
    stats: {
      passing_yards: 0,
      passing_tds: 0,
      passing_interceptions: 0,
      receiving_yards: 92,
      receiving_tds: 1,
      receptions: 7,
      rushing_fumbles_lost: 0,
      receiving_fumbles_lost: 0,
      sack_fumbles_lost: 0,
    },
  });
  // 92 × 0.1 + 6 + 7 × 0.5 = 18.7; the kick-return TD rule (101) is not modeled.
  expect(scored.points).toBeCloseTo(18.7);
  expect(scored.unsupported).toEqual([]);
  expect(
    scoreHistoricalGame(
      { platform: 'espn', scoring: { '999': 1 } },
      {
        playerId: 'p',
        name: 'X',
        position: 'WR',
        team: 'LA',
        opponent: 'SF',
        gameId: 'g',
        season: 2026,
        week: 7,
        seasonType: 'REG',
        stats: {},
      },
    ).unsupported,
  ).toContain('999');
});
