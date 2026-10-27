import { useEffect, useState } from 'react';
import { playerNameKey, record, type LeagueConnection, type LiveMatchup } from '@sidekick/core';
import { requestJson } from './api-client';
import { isWeeklyBriefing, points, type WeeklyBriefing } from './weekly-briefing';
import { readTeamSelections } from './team-selection';
import { LoadingStatus } from './LoadFeedback';
import { platformName } from './platform-name';
import './compare.css';

type Live = { matchupWeek?: number; matchup?: LiveMatchup };
const isLive = (x: unknown): x is Live => record(x);
type LeagueDay = {
  league: LeagueConnection;
  teamId: string;
  briefing?: WeeklyBriefing;
  live?: Live;
  failed?: boolean;
};

export type SundayRow = {
  key: string;
  name: string;
  position: string;
  starting: string[];
  benched: string[];
  status?: string;
};

/**
 * Your players across every league with a chosen team, one row per real player (matched by name
 * and position, since each platform uses its own ids): where he starts, where he sits.
 */
export function sundayRows(days: LeagueDay[]): SundayRow[] {
  const rows = new Map<string, SundayRow>();
  for (const day of days) {
    const team = day.league.teams.find((t) => t.id === day.teamId);
    const starters = new Set(
      day.live?.matchup?.you.starters.map((s) => s.id) ??
        day.briefing?.matchup?.you.starters.map((s) => s.id) ??
        [],
    );
    for (const player of team?.roster ?? []) {
      if (/^(IR|TAXI)$/i.test(player.rosterPosition ?? '')) continue;
      const key = `${playerNameKey(player.name)}:${(player.position ?? '').toUpperCase()}`;
      const row = rows.get(key) ?? {
        key,
        name: player.name,
        position: player.position ?? '',
        starting: [],
        benched: [],
      };
      (starters.has(player.id) ? row.starting : row.benched).push(day.league.displayName);
      const flagged = day.briefing?.availability.find((a) => a.id === player.id)?.status;
      if (flagged && flagged !== 'No game designation') row.status = flagged;
      rows.set(key, row);
    }
  }
  return [...rows.values()]
    .filter((row) => row.starting.length)
    .sort(
      (a, b) =>
        Number(Boolean(b.benched.length)) - Number(Boolean(a.benched.length)) ||
        b.starting.length - a.starting.length ||
        a.name.localeCompare(b.name),
    );
}

/** Every league at once on game day: scores, win chances, problems, and shared players. */
export function SundayPage({
  leagues,
  onOpenLeague,
}: {
  leagues: LeagueConnection[];
  onOpenLeague: (leagueId: string, section: 'Live' | 'League desk') => void;
}) {
  const [days, setDays] = useState<LeagueDay[]>();
  useEffect(() => {
    const selections = readTeamSelections();
    const chosen = leagues
      .filter((league) => league.teams.some((t) => t.id === selections[league.id]))
      .map((league) => ({ league, teamId: selections[league.id]! }));
    const controller = new AbortController();
    const query = (day: { league: LeagueConnection; teamId: string }) =>
      new URLSearchParams({ league: day.league.id, team: day.teamId });
    void Promise.all(
      chosen.map(async (day): Promise<LeagueDay> => {
        const [briefing, live] = await Promise.allSettled([
          requestJson(
            `/api/advice/briefing?${query(day)}`,
            isWeeklyBriefing,
            { signal: controller.signal },
            60_000,
          ),
          requestJson(`/api/live?${query(day)}`, isLive, { signal: controller.signal }, 60_000),
        ]);
        return {
          ...day,
          ...(briefing.status === 'fulfilled' ? { briefing: briefing.value } : {}),
          ...(live.status === 'fulfilled' ? { live: live.value } : {}),
          ...(briefing.status === 'rejected' && live.status === 'rejected' ? { failed: true } : {}),
        };
      }),
    ).then((result) => !controller.signal.aborted && setDays(result));
    return () => controller.abort();
  }, [leagues]);
  const rows = days ? sundayRows(days) : [];
  const split = rows.filter((row) => row.benched.length);
  return (
    <div className="sunday-page">
      <div className="page-title-block">
        <div>
          <p className="section-overline">GAME DAY · EVERY LEAGUE</p>
          <h1>All my leagues</h1>
          <p>Each matchup, what needs fixing, and the players you share between teams.</p>
        </div>
      </div>
      {!days ? (
        <LoadingStatus message="Checking every league…" shape="cards" />
      ) : !days.length ? (
        <p className="empty-activity">
          Choose your team in each league (on Home) and they all show up here.
        </p>
      ) : (
        <>
          <div className="sunday-grid">
            {days.map((day) => {
              const live =
                day.live?.matchup &&
                day.live.matchupWeek === (day.briefing?.matchup?.week ?? day.live.matchupWeek)
                  ? day.live.matchup
                  : undefined;
              const chance = live?.winChance ?? day.briefing?.matchup?.winProbability;
              const flags = [
                ...(day.briefing?.lineup.changes ?? []).map(
                  (c) => `Start ${c.start.name}${c.bench ? ` over ${c.bench.name}` : ''}`,
                ),
                ...(day.briefing?.availability ?? [])
                  .filter(
                    (a) =>
                      day.briefing?.matchup?.you.starters.some((s) => s.id === a.id) &&
                      a.status !== 'No game designation',
                  )
                  .map((a) => `${a.name}: ${a.status}`),
              ];
              return (
                <article key={day.league.id} className="sunday-card">
                  <h2>{day.league.displayName}</h2>
                  <p>
                    {platformName(day.league.platform)} ·{' '}
                    {day.league.teams.find((t) => t.id === day.teamId)?.name}
                  </p>
                  {day.failed ? (
                    <p>This league could not be checked. Open it to see why.</p>
                  ) : live ? (
                    <div className="sunday-score">
                      <strong>
                        {live.you.points !== undefined ? points(live.you.points) : '—'} –{' '}
                        {live.opponent.points !== undefined ? points(live.opponent.points) : '—'}
                      </strong>
                      <span>
                        {chance !== undefined ? `${Math.round(chance * 100)}% to win` : ''}
                      </span>
                    </div>
                  ) : (
                    <p>{chance !== undefined ? `${Math.round(chance * 100)}% to win` : ''}</p>
                  )}
                  {live && (
                    <p>
                      Projected {points(live.you.projectedFinal ?? 0)} to{' '}
                      {points(live.opponent.projectedFinal ?? 0)} vs {live.opponent.name}
                    </p>
                  )}
                  {flags.length > 0 && (
                    <ul className="sunday-flags">
                      {flags.slice(0, 4).map((flag) => (
                        <li key={flag}>{flag}</li>
                      ))}
                    </ul>
                  )}
                  <div className="sunday-links">
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => onOpenLeague(day.league.id, 'Live')}
                    >
                      Live
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => onOpenLeague(day.league.id, 'League desk')}
                    >
                      Home
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          {split.length > 0 && (
            <p className="notice">
              Starting in one league, benched in another: {split.map((row) => row.name).join(', ')}.
              Worth a second look.
            </p>
          )}
          {rows.length > 0 && (
            <section aria-labelledby="sunday-starters">
              <h2 id="sunday-starters">Your starters, all leagues</h2>
              <div className="sunday-table-wrap">
                <table className="sunday-table">
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>Starting in</th>
                      <th>Benched in</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.key}>
                        <td>
                          {row.name} <small>{row.position}</small>
                        </td>
                        <td>{row.starting.join(', ')}</td>
                        <td>{row.benched.join(', ') || '—'}</td>
                        <td>{row.status ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
