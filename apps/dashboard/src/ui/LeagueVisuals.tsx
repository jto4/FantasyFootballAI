import { useState } from 'react';
import type { ReportVisuals } from '@sidekick/core';
import { formatDateTime } from './date-format';

type Row = { id: string; label: string; value: number };
function Bars({ rows, label, precision = 2 }: { rows: Row[]; label: string; precision?: 0 | 2 }) {
  const min = Math.min(0, ...rows.map((row) => row.value));
  const max = Math.max(1, ...rows.map((row) => row.value));
  const x = (value: number) => ((value - min) / (max - min)) * 300;
  const zero = x(0);
  return (
    <div
      className="league-bar-chart"
      role="img"
      aria-label={`${label}: ${rows.map((row) => `${row.label} ${row.value.toFixed(precision)}`).join('; ')}`}
    >
      {rows.map((row) => (
        <div
          className="chart-row"
          key={row.id}
          aria-hidden="true"
          title={`${row.label}: ${row.value.toFixed(precision)}`}
        >
          <span className="chart-label">{row.label}</span>
          <svg viewBox="0 0 300 26" preserveAspectRatio="none" focusable="false">
            <line x1={zero} x2={zero} y1="0" y2="26" className="chart-axis" />
            <rect
              x={Math.min(zero, x(row.value))}
              y="2"
              width={Math.abs(x(row.value) - zero)}
              height="22"
              rx="4"
              className="chart-bar"
            />
          </svg>
          <strong className="chart-value">{row.value.toFixed(precision)}</strong>
        </div>
      ))}
    </div>
  );
}

export function LeagueVisuals({
  data,
  syncedAt,
  frozen = false,
}: {
  data: ReportVisuals;
  syncedAt?: string | undefined;
  frozen?: boolean;
}) {
  const [metric, setMetric] = useState<'pointsFor' | 'wins'>('pointsFor');
  const [showAllTeams, setShowAllTeams] = useState(false);
  const [showAllMatchups, setShowAllMatchups] = useState(false);
  const complete =
    data.teams.length > 0 &&
    data.teams.length === data.teamCount &&
    data.teams.every((team) => Number.isFinite(team[metric]));
  const rows: Row[] = complete
    ? [...data.teams]
        .sort((a, b) => b[metric]! - a[metric]!)
        .map((team) => ({ id: team.id, label: team.name, value: team[metric]! }))
    : [];
  const week = data.currentWeek ?? Math.max(0, ...data.matchups.map((matchup) => matchup.week));
  const matchups = data.matchups.filter((matchup) => matchup.week === week);
  const names = new Map(data.teams.map((team) => [team.id, team.name]));
  const shown = showAllTeams ? rows : rows.slice(0, 6);
  return (
    <section
      className="league-visuals"
      aria-label={frozen ? 'Report data snapshot' : 'League at a glance'}
    >
      <div className="visuals-heading">
        <div>
          <p className="section-overline">
            {frozen ? 'SAVED WITH THIS REPORT' : 'LEAGUE AT A GLANCE'}
          </p>
          <h2>{frozen ? 'The numbers behind this report' : 'How the league stacks up'}</h2>
          {data.season !== undefined && (
            <p className="visual-source">
              {data.season} season{week ? ` · Week ${week} matchups` : ''}
            </p>
          )}
        </div>
        <div className="visual-metric" role="group" aria-label="Chart metric">
          <button
            type="button"
            aria-pressed={metric === 'pointsFor'}
            onClick={() => setMetric('pointsFor')}
          >
            Points scored
          </button>
          <button type="button" aria-pressed={metric === 'wins'} onClick={() => setMetric('wins')}>
            Wins
          </button>
        </div>
      </div>
      <div className="visuals-grid">
        <div className="visual-panel">
          <h3>{metric === 'pointsFor' ? 'Season points for' : 'Recorded wins'}</h3>
          {shown.length ? (
            <Bars
              rows={shown}
              label={metric === 'pointsFor' ? 'Season points for' : 'Recorded wins'}
              precision={metric === 'wins' ? 0 : 2}
            />
          ) : (
            <p className="empty-activity">
              A complete {metric === 'pointsFor' ? 'points-for' : 'win'} total for every team is
              needed for this comparison.
            </p>
          )}
          {rows.length > 6 && (
            <button
              type="button"
              className="text-button"
              onClick={() => setShowAllTeams(!showAllTeams)}
            >
              {showAllTeams ? 'Show top six' : `Show all ${rows.length} teams`}
            </button>
          )}
        </div>
        <div className="visual-panel">
          <h3>{week ? `Week ${week} matchup scores` : 'Matchup scores'}</h3>
          {matchups.length === 0 ? (
            <p className="empty-activity">
              No matchup scores for this week in the platform snapshot.
            </p>
          ) : (
            matchups.slice(0, showAllMatchups ? 32 : 3).map((matchup, index) => {
              const sides = matchup.teams;
              const valid =
                sides.length === 2 && sides.every((side) => Number.isFinite(side.points));
              return (
                <div className="matchup-visual" key={`${week}:${index}`}>
                  {valid ? (
                    <Bars
                      label={`Week ${week} matchup ${index + 1}`}
                      rows={sides.map((side, sideIndex) => ({
                        id: `${side.teamId}:${sideIndex}`,
                        label: names.get(side.teamId) ?? side.teamId,
                        value: side.points!,
                      }))}
                    />
                  ) : (
                    <p>
                      {sides.map((side) => names.get(side.teamId) ?? side.teamId).join(' vs ')} ·
                      Score unavailable
                    </p>
                  )}
                </div>
              );
            })
          )}
          {matchups.length > 3 && (
            <button
              type="button"
              className="text-button"
              onClick={() => setShowAllMatchups(!showAllMatchups)}
            >
              {showAllMatchups ? 'Show fewer matchups' : `Show all ${matchups.length} matchups`}
            </button>
          )}
        </div>
      </div>
      <p className="visual-source">
        Platform snapshot · {syncedAt ? formatDateTime(syncedAt) : 'Sync time not recorded'}. Scores
        may be live or final; these are recorded values, not forecasts.
        {frozen && ' This snapshot stays fixed when your league refreshes.'}
      </p>
      <details className="visual-data">
        <summary>View chart data</summary>
        <div className="visual-table-scroll">
          <table>
            <caption>Team totals from the platform snapshot</caption>
            <thead>
              <tr>
                <th>Team</th>
                <th>Wins</th>
                <th>Losses</th>
                <th>Points for</th>
              </tr>
            </thead>
            <tbody>
              {data.teams.map((team) => (
                <tr key={team.id}>
                  <th scope="row">{team.name}</th>
                  <td>{team.wins ?? 'Unavailable'}</td>
                  <td>{team.losses ?? 'Unavailable'}</td>
                  <td>{team.pointsFor?.toFixed(2) ?? 'Unavailable'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
