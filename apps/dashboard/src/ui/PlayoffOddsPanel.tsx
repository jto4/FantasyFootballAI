import { useMemo } from 'react';
import { playoffOdds, type LeagueConnection } from '@sidekick/core';

const percent = (n: number) =>
  n >= 0.995 ? '>99%' : n > 0 && n < 0.005 ? '<1%' : `${Math.round(n * 100)}%`;

/**
 * Chance of making the playoffs for every team, from simulating the rest of the regular season.
 * Bars use the chart highlight for the selected team and the context color for the rest.
 */
export function PlayoffOddsPanel({
  league,
  selected,
}: {
  league: LeagueConnection;
  selected: string;
}) {
  const odds = useMemo(() => playoffOdds(league), [league]);
  if (!odds)
    return (
      <p className="trend-caption">
        Playoff odds appear after two played weeks. Week one overreactions are not data.
      </p>
    );
  if (!odds.remainingWeeks.length)
    return <p className="trend-caption">The regular season is complete.</p>;
  return (
    <>
      <p className="trend-caption">
        {odds.simulations.toLocaleString()} simulations of weeks {odds.remainingWeeks[0]}–
        {odds.remainingWeeks[odds.remainingWeeks.length - 1]} from each team’s scoring so far.{' '}
        {odds.playoffSpots} teams make the playoffs.
        {odds.scheduleKnown
          ? ''
          : ' The remaining schedule isn’t in this league data, so matchups are drawn at random.'}
      </p>
      <ol className="playoff-odds" aria-label="Playoff chances">
        {odds.teams.map((team) => (
          <li key={team.teamId} className={team.teamId === selected ? 'selected' : undefined}>
            <span className="playoff-odds-team">
              {team.name}
              <small>
                {team.wins}-{team.losses}
                {team.ties ? `-${team.ties}` : ''} · {team.projectedWins.toFixed(1)} projected wins
              </small>
            </span>
            <span className="playoff-odds-bar" aria-hidden="true">
              <span style={{ width: `${Math.max(1, team.playoffChance * 100)}%` }} />
            </span>
            <strong>{percent(team.playoffChance)}</strong>
          </li>
        ))}
      </ol>
      <p className="trend-caption">
        Estimates assume each team keeps scoring like it has so far; injuries, trades and waiver
        moves can change them.
      </p>
    </>
  );
}
