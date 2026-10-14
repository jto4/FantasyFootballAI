import type { FootballStatKey, PlayerGameStats } from './advice-types.js';

const events: Record<string, FootballStatKey> = {
  sack: 'dst_sacks',
  int: 'dst_interceptions',
  fum_rec: 'dst_fumble_recoveries',
  def_td: 'dst_touchdowns',
  def_st_td: 'dst_special_teams_touchdowns',
  def_st_fum_rec: 'dst_special_teams_fumble_recoveries',
  ff: 'dst_forced_fumbles',
  def_st_ff: 'dst_special_teams_forced_fumbles',
  safe: 'dst_safeties',
  blk_kick: 'dst_blocked_kicks',
  pts_allow: 'dst_points_allowed',
  yds_allow: 'dst_yards_allowed',
};
const bands: Record<string, [FootballStatKey, number, number]> = {
  pts_allow_0: ['dst_points_allowed', 0, 0],
  pts_allow_1_6: ['dst_points_allowed', 1, 6],
  pts_allow_7_13: ['dst_points_allowed', 7, 13],
  pts_allow_14_20: ['dst_points_allowed', 14, 20],
  pts_allow_21_27: ['dst_points_allowed', 21, 27],
  pts_allow_28_34: ['dst_points_allowed', 28, 34],
  pts_allow_35p: ['dst_points_allowed', 35, 150],
  yds_allow_0_99: ['dst_yards_allowed', 0, 99],
  yds_allow_100_199: ['dst_yards_allowed', 100, 199],
  yds_allow_200_299: ['dst_yards_allowed', 200, 299],
  yds_allow_300_349: ['dst_yards_allowed', 300, 349],
  yds_allow_350_399: ['dst_yards_allowed', 350, 399],
  yds_allow_400_449: ['dst_yards_allowed', 400, 449],
  yds_allow_450_499: ['dst_yards_allowed', 450, 499],
  yds_allow_500_549: ['dst_yards_allowed', 500, 549],
  yds_allow_550p: ['dst_yards_allowed', 550, 2000],
};

export const sleeperDefenseRules = new Set([...Object.keys(events), ...Object.keys(bands)]);

/** Only Sleeper-published defense semantics are verified. Do not substitute a final score. */
export function defenseScoreValue(platform: string, key: string, row: PlayerGameStats) {
  if (platform !== 'sleeper') return;
  const field = Object.hasOwn(events, key) ? events[key] : undefined;
  const band = Object.hasOwn(bands, key) ? bands[key] : undefined;
  if (!field && !band) return;
  const stat = (field ?? band![0])!;
  const value = row.stats[stat];
  const max = stat === 'dst_points_allowed' ? 150 : stat === 'dst_yards_allowed' ? 2000 : 100;
  if (value === undefined || !Number.isInteger(value) || value < 0 || value > max)
    return { value: 0, missing: [stat] };
  return { value: band ? Number(value >= band[1] && value <= band[2]) : value, missing: [] };
}
