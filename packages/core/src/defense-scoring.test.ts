import { expect, it } from 'vitest';
import { scoreHistoricalGame, defensePlayerIdentity } from './advice-math.js';
import { defenseStatKeys, type PlayerGameStats } from './advice-types.js';
const row: PlayerGameStats = {
  playerId: 'dst:SEA',
  name: 'SEA defense',
  position: 'DST',
  team: 'SEA',
  opponent: 'HOU',
  season: 2025,
  week: 7,
  seasonType: 'REG',
  gameId: 'sea-hou',
  sourceIds: ['dst-2025-7'],
  stats: {
    ...Object.fromEntries(defenseStatKeys.map((k) => [k, 0])),
    dst_sacks: 3,
    dst_interceptions: 1,
    dst_points_allowed: 13,
    dst_yards_allowed: 254,
  },
};
it('adds only configured applicable bands and events, excludes unrelated player/kicker rules, and supports negative scores', () => {
  const scoring = {
    sack: 1,
    int: 2,
    pts_allow_7_13: 4,
    pts_allow_14_20: 1,
    yds_allow_200_299: 2,
    yds_allow_300_349: -1,
    pass_yd: 0.04,
    rec: 1,
    fgm: 3,
    st_td: 6,
  };
  expect(scoreHistoricalGame({ platform: 'sleeper', scoring }, row).points).toBe(11);
  expect(
    scoreHistoricalGame(
      { platform: 'sleeper', scoring: { pts_allow_35p: -4, sack: 1 } },
      { ...row, stats: { ...row.stats, dst_sacks: 0, dst_points_allowed: 45 } },
    ).points,
  ).toBe(-4);
});
it('tests every points/yards band boundary without overlap or hidden standard weights', () => {
  const pointBands = [
    ['pts_allow_0', 0, 0],
    ['pts_allow_1_6', 1, 6],
    ['pts_allow_7_13', 7, 13],
    ['pts_allow_14_20', 14, 20],
    ['pts_allow_21_27', 21, 27],
    ['pts_allow_28_34', 28, 34],
    ['pts_allow_35p', 35, 150],
  ] as const;
  const yardBands = [
    ['yds_allow_0_99', 0, 99],
    ['yds_allow_100_199', 100, 199],
    ['yds_allow_200_299', 200, 299],
    ['yds_allow_300_349', 300, 349],
    ['yds_allow_350_399', 350, 399],
    ['yds_allow_400_449', 400, 449],
    ['yds_allow_450_499', 450, 499],
    ['yds_allow_500_549', 500, 549],
    ['yds_allow_550p', 550, 2000],
  ] as const;
  for (const [bands, field] of [
    [pointBands, 'dst_points_allowed'],
    [yardBands, 'dst_yards_allowed'],
  ] as const)
    for (const [key, low, high] of bands)
      for (const value of new Set([
        Math.max(0, low - 1),
        low,
        high,
        Math.min(field === 'dst_points_allowed' ? 150 : 2000, high + 1),
      ]))
        expect(
          scoreHistoricalGame(
            { platform: 'sleeper', scoring: { [key]: 7 } },
            { ...row, stats: { ...row.stats, [field]: value } },
          ).points,
        ).toBe(value >= low && value <= high ? 7 : 0);
});
it('keeps defense and special-teams units separate and preserves missing required statistics', () => {
  const separate: PlayerGameStats = {
    ...row,
    stats: {
      ...row.stats,
      dst_fumble_recoveries: 1,
      dst_special_teams_fumble_recoveries: 2,
      dst_touchdowns: 1,
      dst_special_teams_touchdowns: 0,
    },
  };
  expect(
    scoreHistoricalGame(
      { platform: 'sleeper', scoring: { fum_rec: 2, def_st_fum_rec: 1, def_td: 6, def_st_td: 6 } },
      separate,
    ).points,
  ).toBe(10);
  delete separate.stats.dst_special_teams_touchdowns;
  expect(
    scoreHistoricalGame({ platform: 'sleeper', scoring: { def_st_td: 6 } }, separate).missing,
  ).toEqual(['dst_special_teams_touchdowns']);
  expect(
    scoreHistoricalGame(
      { platform: 'sleeper', scoring: { sack: 1, unknown_defense_bonus: 2 } },
      row,
    ).points,
  ).toBeUndefined();
  for (const value of [NaN, -1, 0.5, 101])
    expect(
      scoreHistoricalGame(
        { platform: 'sleeper', scoring: { sack: 1 } },
        { ...row, stats: { dst_sacks: value } },
      ).points,
    ).toBeUndefined();
  expect(
    scoreHistoricalGame({ platform: 'yahoo', scoring: { Sack: 1 } }, row).points,
  ).toBeUndefined();
  expect(
    scoreHistoricalGame({ platform: 'espn', scoring: { 'stat-20': 1 } }, row).points,
  ).toBeUndefined();
  expect(
    scoreHistoricalGame({ platform: 'sleeper', scoring: JSON.parse('{"constructor":1}') }, row)
      .points,
  ).toBeUndefined();
});
it('joins DEF/DST by normalized team identity and rejects conflicting platform IDs and missing teams', () => {
  expect(defensePlayerIdentity({ id: 'LAR', position: 'DEF', nflTeam: 'LA' })).toBe('dst:LA');
  expect(defensePlayerIdentity({ id: '20', position: 'DST', nflTeam: 'SEA' })).toBe('dst:SEA');
  for (const player of [
    { id: 'BUF', position: 'DEF', nflTeam: 'MIA' },
    { id: '20', position: 'DEF', nflTeam: 'XXX' },
    { id: '20', position: 'DEF' },
    { id: '20', position: 'WR', nflTeam: 'SEA' },
    { id: '20', position: 'DEF', nflTeam: 'SEA', sleeperId: 'BUF' },
  ])
    expect(defensePlayerIdentity(player)).toBeUndefined();
});
