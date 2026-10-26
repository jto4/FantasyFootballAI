import type { LeagueConnection } from './domain-types.js';

/** Regular-season weeks left after this one, from the league's schedule settings. */
export function regularWeeksLeft(league: Pick<LeagueConnection, 'settings'>, week: number) {
  const s = league.settings;
  const last =
    typeof s.regularSeasonWeeks === 'number'
      ? s.regularSeasonWeeks
      : typeof s.playoff_week_start === 'number'
        ? s.playoff_week_start - 1
        : typeof s.playoffStartWeek === 'number'
          ? s.playoffStartWeek - 1
          : 14;
  return Math.max(0, Math.min(18, last - week));
}

/**
 * A FAAB bid range for a pickup, as a rule of thumb rather than a fitted model (there is no
 * bidding history to fit on): the points he adds over the rest of the regular season, at about
 * 1% of the remaining budget per point, kept between 1 and 50% of what is left.
 */
export function faabBid(input: { gain: number; weeksLeft: number; remaining: number }) {
  if (!(input.remaining > 0) || !(input.gain > 0)) return undefined;
  const points = input.gain * Math.max(1, input.weeksLeft);
  const share = Math.min(0.5, Math.max(0.01, points / 100));
  const low = Math.max(input.remaining > 0 ? 1 : 0, Math.floor(input.remaining * share * 0.75));
  const high = Math.max(low, Math.ceil(input.remaining * Math.min(0.5, share * 1.25)));
  return { low: Math.min(low, input.remaining), high: Math.min(high, input.remaining) };
}
