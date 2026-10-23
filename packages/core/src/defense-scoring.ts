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

// ESPN D/ST stat IDs, as used in league scoring settings and their slot-16 overrides.
const espnEvents: Record<string, FootballStatKey> = {
  '93': 'dst_blocked_kick_return_tds',
  '95': 'dst_interceptions',
  '96': 'dst_fumble_recoveries',
  '97': 'dst_blocked_kicks',
  '98': 'dst_safeties',
  '99': 'dst_sacks',
  '101': 'dst_kickoff_return_tds',
  '102': 'dst_punt_return_tds',
  '103': 'dst_interception_return_tds',
  '104': 'dst_fumble_return_tds',
  '120': 'dst_points_allowed',
  '127': 'dst_yards_allowed',
  '206': 'dst_two_point_returns',
  '209': 'dst_one_point_safeties',
};
const espnBands: Record<string, [FootballStatKey, number, number]> = {
  '89': ['dst_points_allowed', 0, 0],
  '90': ['dst_points_allowed', 1, 6],
  '91': ['dst_points_allowed', 7, 13],
  '92': ['dst_points_allowed', 14, 17],
  '121': ['dst_points_allowed', 18, 21],
  '122': ['dst_points_allowed', 22, 27],
  '123': ['dst_points_allowed', 28, 34],
  '124': ['dst_points_allowed', 35, 45],
  '125': ['dst_points_allowed', 46, 150],
  '128': ['dst_yards_allowed', 0, 99],
  '129': ['dst_yards_allowed', 100, 199],
  '130': ['dst_yards_allowed', 200, 299],
  '131': ['dst_yards_allowed', 300, 349],
  '132': ['dst_yards_allowed', 350, 399],
  '133': ['dst_yards_allowed', 400, 449],
  '134': ['dst_yards_allowed', 450, 499],
  '135': ['dst_yards_allowed', 500, 549],
  '136': ['dst_yards_allowed', 550, 2000],
};

/** Sleeper and ESPN defense rules; other platforms stay unsupported. Never infer from a final. */
export function defenseScoreValue(platform: string, key: string, row: PlayerGameStats) {
  if (platform !== 'sleeper' && platform !== 'espn') return;
  const eventRules = platform === 'espn' ? espnEvents : events;
  const bandRules = platform === 'espn' ? espnBands : bands;
  const field = Object.hasOwn(eventRules, key) ? eventRules[key] : undefined;
  const band = Object.hasOwn(bandRules, key) ? bandRules[key] : undefined;
  if (!field && !band) return;
  const stat = (field ?? band![0])!;
  const value = row.stats[stat];
  const max = stat === 'dst_points_allowed' ? 150 : stat === 'dst_yards_allowed' ? 2000 : 100;
  if (value === undefined || !Number.isInteger(value) || value < 0 || value > max)
    return { value: 0, missing: [stat] };
  return { value: band ? Number(value >= band[1] && value <= band[2]) : value, missing: [] };
}
