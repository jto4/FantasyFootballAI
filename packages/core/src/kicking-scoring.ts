import type { FootballStatKey, PlayerGameStats } from './advice-types.js';

type Rule = { fields: FootballStatKey[]; blockedRange?: [number, number]; yardsOver30?: true };
const sleeperRules: Record<string, Rule> = {
  xpm: { fields: ['pat_made'] },
  xpmiss: { fields: ['pat_missed', 'pat_blocked'] },
  fgm: { fields: ['fg_made'] },
  fgmiss: { fields: ['fg_missed', 'fg_blocked'] },
  fgm_0_19: { fields: ['fg_made_0_19'] },
  fgm_20_29: { fields: ['fg_made_20_29'] },
  fgm_30_39: { fields: ['fg_made_30_39'] },
  fgm_40_49: { fields: ['fg_made_40_49'] },
  fgm_50_59: { fields: ['fg_made_50_59'] },
  fgm_50p: { fields: ['fg_made_50_59', 'fg_made_60_'] },
  fgm_60p: { fields: ['fg_made_60_'] },
  fgmiss_0_19: { fields: ['fg_missed_0_19'], blockedRange: [0, 19] },
  fgmiss_20_29: { fields: ['fg_missed_20_29'], blockedRange: [20, 29] },
  fgmiss_30_39: { fields: ['fg_missed_30_39'], blockedRange: [30, 39] },
  fgmiss_40_49: { fields: ['fg_missed_40_49'], blockedRange: [40, 49] },
  fgmiss_50_59: { fields: ['fg_missed_50_59'], blockedRange: [50, 59] },
  fgmiss_50p: { fields: ['fg_missed_50_59', 'fg_missed_60_'], blockedRange: [50, 100] },
  fgmiss_60p: { fields: ['fg_missed_60_'], blockedRange: [60, 100] },
  fgm_yds: { fields: ['fg_made_distance'] },
  fgm_yds_over_30: { fields: ['fg_made'], yardsOver30: true },
};
const yahooRules: Record<string, Rule> = {
  'Field Goals 0-19 Yards': sleeperRules.fgm_0_19!,
  'Field Goals 20-29 Yards': sleeperRules.fgm_20_29!,
  'Field Goals 30-39 Yards': sleeperRules.fgm_30_39!,
  'Field Goals 40-49 Yards': sleeperRules.fgm_40_49!,
  'Field Goals 50+ Yards': sleeperRules.fgm_50p!,
  'Point After Attempt Made': sleeperRules.xpm!,
};
export const sleeperKickingRules = new Set(Object.keys(sleeperRules));
export const yahooKickingRules = new Set(Object.keys(yahooRules));

/** nflverse missed counts/buckets exclude blocks; Sleeper penalizes both as misses. */
export function kickingScoreValue(platform: string, key: string, row: PlayerGameStats) {
  const mapping = platform === 'sleeper' ? sleeperRules : platform === 'yahoo' ? yahooRules : {};
  const rule = Object.hasOwn(mapping, key) ? mapping[key] : undefined;
  if (!rule) return;
  const missing: string[] = [];
  const read = (field: FootballStatKey) => {
    const value = row.stats[field];
    if (
      value === undefined ||
      !Number.isFinite(value) ||
      value < 0 ||
      !Number.isInteger(value) ||
      value > (field === 'fg_made_distance' ? 2_000 : 20)
    ) {
      missing.push(field);
      return 0;
    }
    return value;
  };
  let value = rule.fields.reduce((sum, field) => sum + read(field), 0);
  if (rule.blockedRange) {
    const count = read('fg_blocked');
    if (count > 0) {
      const distances = row.blockedFieldGoalDistances;
      if (!completeDistances(distances, count)) missing.push('blockedFieldGoalDistances');
      else {
        const [low, high] = rule.blockedRange;
        value += distances.filter((distance) => distance >= low && distance <= high).length;
      }
    }
  }
  if (rule.yardsOver30) {
    const distances = row.madeFieldGoalDistances;
    if (value === 0 && !missing.length) value = 0;
    else if (!completeDistances(distances, value)) missing.push('madeFieldGoalDistances');
    else value = distances.reduce((sum, distance) => sum + Math.max(0, distance - 30), 0);
  }
  return { value, missing };
}
function completeDistances(distances: number[] | undefined, count: number): distances is number[] {
  return (
    Array.isArray(distances) &&
    distances.length === count &&
    distances.length <= 20 &&
    distances.every((distance) => Number.isInteger(distance) && distance >= 1 && distance <= 100)
  );
}
