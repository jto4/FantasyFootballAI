import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  leagueInsights,
  type LeagueConnection,
  type TeamInsight,
  type WeekSummary,
} from '@sidekick/core';
import { readTeamSelections, selectedTeamId } from './team-selection';
import { PlayoffOddsPanel } from './PlayoffOddsPanel';

const one = (value: number) => value.toFixed(1);
const signed = (value: number) => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}`;
const record = (team: Pick<TeamInsight, 'wins' | 'losses' | 'ties'>) =>
  `${team.wins}-${team.losses}${team.ties ? `-${team.ties}` : ''}`;

/**
 * Clean axis ticks over the data range (for example 75 / 100 / 125 / 150). Line charts need no
 * zero baseline, so the axis starts at the step below the lowest value.
 */
function niceTicks(low: number, high: number) {
  const span = Math.max(1, high - Math.max(0, low));
  const step = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((s) => span / s <= 5) ?? 2000;
  const min = Math.max(0, Math.floor(Math.max(0, low) / step) * step);
  const max = Math.max(min + step, Math.ceil(high / step) * step);
  return Array.from({ length: (max - min) / step + 1 }, (_, i) => min + i * step);
}

/** Charts draw at their container's real pixel width so text never scales with the SVG. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry?.contentRect.width ?? 0);
      if (next > 0) setWidth(Math.max(280, next));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

type Tip = { x: number; y: number; content: ReactNode } | undefined;

function Tooltip({ tip }: { tip: Tip }) {
  if (!tip) return null;
  return (
    <div className="trend-tooltip" role="status" style={{ left: `${tip.x}%`, top: `${tip.y}%` }}>
      {tip.content}
    </div>
  );
}

function WeeklyScoring({ weeks, team }: { weeks: WeekSummary[]; team: TeamInsight }) {
  const [ref, width] = useWidth();
  const [tip, setTip] = useState<Tip>();
  const [active, setActive] = useState<number>();
  const height = 240,
    left = 40,
    right = width < 480 ? 96 : 128,
    top = 12,
    bottom = 28;
  const plotWidth = width - left - right,
    plotHeight = height - top - bottom;
  const ticks = niceTicks(
    Math.min(...weeks.map((w) => w.low), ...team.weekly.map((w) => w.points)),
    Math.max(...weeks.map((w) => w.high), ...team.weekly.map((w) => w.points)),
  );
  const min = ticks[0]!,
    max = ticks.at(-1)!;
  const first = weeks[0]!.week,
    last = weeks.at(-1)!.week;
  const x = (week: number) =>
    left + (last === first ? plotWidth / 2 : ((week - first) / (last - first)) * plotWidth);
  const y = (points: number) =>
    top + plotHeight - ((Math.max(min, points) - min) / (max - min)) * plotHeight;
  const band = [
    ...weeks.map((w) => `${x(w.week)},${y(w.high)}`),
    ...[...weeks].reverse().map((w) => `${x(w.week)},${y(w.low)}`),
  ].join(' ');
  const medianPath = weeks.map((w) => `${x(w.week)},${y(w.median)}`).join(' ');
  const teamPath = team.weekly.map((w) => `${x(w.week)},${y(w.points)}`).join(' ');
  const lastTeam = team.weekly.at(-1)!;
  const lastWeek = weeks.at(-1)!;
  // Keep the two end labels from colliding when the lines finish close together.
  let teamLabelY = y(lastTeam.points),
    medianLabelY = y(lastWeek.median);
  if (Math.abs(teamLabelY - medianLabelY) < 14) {
    const shift = (14 - Math.abs(teamLabelY - medianLabelY)) / 2;
    if (teamLabelY < medianLabelY) {
      teamLabelY -= shift;
      medianLabelY += shift;
    } else {
      teamLabelY += shift;
      medianLabelY -= shift;
    }
  }
  const step = weeks.length > 1 ? plotWidth / (weeks.length - 1) : plotWidth;
  return (
    <div className="trend-chart" ref={ref}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${team.name} weekly points against the league median and range: ${team.weekly
          .map((w) => `week ${w.week} ${one(w.points)}`)
          .join(', ')}`}
        onMouseLeave={() => {
          setTip(undefined);
          setActive(undefined);
        }}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={left}
              x2={left + plotWidth}
              y1={y(tick)}
              y2={y(tick)}
              className="trend-grid"
            />
            <text x={left - 6} y={y(tick)} className="trend-axis" textAnchor="end" dy="0.32em">
              {Math.round(tick)}
            </text>
          </g>
        ))}
        {weeks.map((w) => (
          <text
            key={w.week}
            x={x(w.week)}
            y={height - 8}
            className="trend-axis"
            textAnchor="middle"
          >
            {weeks.length > 12 && w.week % 2 === 0 && w.week !== last ? '' : `W${w.week}`}
          </text>
        ))}
        <polygon points={band} className="trend-band" />
        <polyline points={medianPath} className="trend-line trend-line-context" />
        <polyline points={teamPath} className="trend-line trend-line-highlight" />
        {active !== undefined && (
          <line
            x1={x(active)}
            x2={x(active)}
            y1={top}
            y2={top + plotHeight}
            className="trend-crosshair"
          />
        )}
        {team.weekly.map((w) => (
          <circle
            key={w.week}
            cx={x(w.week)}
            cy={y(w.points)}
            r={active === w.week ? 6 : 4}
            className="trend-dot"
          />
        ))}
        <text x={left + plotWidth + 10} y={teamLabelY} dy="0.32em" className="trend-label-strong">
          {team.name.length > (width < 480 ? 11 : 16)
            ? `${team.name.slice(0, width < 480 ? 10 : 15)}…`
            : team.name}
        </text>
        <text x={left + plotWidth + 10} y={medianLabelY} dy="0.32em" className="trend-label">
          {width < 480 ? 'Median' : 'League median'}
        </text>
        {weeks.map((w) => {
          const row = team.weekly.find((item) => item.week === w.week);
          return (
            <rect
              key={w.week}
              x={x(w.week) - step / 2}
              y={top}
              width={step}
              height={plotHeight}
              className="trend-hit"
              onMouseEnter={() => {
                setActive(w.week);
                setTip({
                  x: (x(w.week) / width) * 100,
                  y: (Math.min(y(w.high), row ? y(row.points) : y(w.high)) / height) * 100,
                  content: (
                    <>
                      <strong>Week {w.week}</strong>
                      {row ? (
                        <span>
                          {team.name}: {one(row.points)} ({row.result} vs {one(row.opponentPoints)})
                        </span>
                      ) : (
                        <span>{team.name}: no game</span>
                      )}
                      <span>League median: {one(w.median)}</span>
                      <span>
                        Range: {one(w.low)}–{one(w.high)}
                      </span>
                    </>
                  ),
                });
              }}
            />
          );
        })}
      </svg>
      <Tooltip tip={tip} />
      <ul className="trend-legend" aria-label="Legend">
        <li>
          <span className="key-line key-highlight" /> {team.name}
        </li>
        <li>
          <span className="key-line key-context" /> League median
        </li>
        <li>
          <span className="key-band" /> League low to high
        </li>
      </ul>
    </div>
  );
}

function PowerRank({
  weeks,
  teams,
  selected,
}: {
  weeks: WeekSummary[];
  teams: TeamInsight[];
  selected: string;
}) {
  const [ref, width] = useWidth();
  const [tip, setTip] = useState<Tip>();
  const [active, setActive] = useState<number>();
  const count = teams.length;
  const rowGap = 22,
    top = 12,
    bottom = 28,
    left = 32,
    right = width < 480 ? 96 : 140;
  const height = top + (count - 1) * rowGap + bottom;
  const first = weeks[0]!.week,
    last = weeks.at(-1)!.week;
  const plotWidth = width - left - right;
  const x = (week: number) =>
    left + (last === first ? plotWidth / 2 : ((week - first) / (last - first)) * plotWidth);
  const y = (rank: number) => top + (rank - 1) * rowGap;
  const path = (team: TeamInsight) =>
    team.rankByWeek.map((r) => `${x(r.week)},${y(r.rank)}`).join(' ');
  const mine = teams.find((t) => t.id === selected)!;
  const latest = mine.rankByWeek.at(-1);
  const step = weeks.length > 1 ? plotWidth / (weeks.length - 1) : plotWidth;
  // Selected team drawn last so it sits on top of the context lines.
  const ordered = [...teams].sort((a, b) => Number(a.id === selected) - Number(b.id === selected));
  return (
    <div className="trend-chart" ref={ref}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${mine.name} power rank by week: ${mine.rankByWeek
          .map((r) => `week ${r.week} rank ${r.rank}`)
          .join(', ')}`}
        onMouseLeave={() => {
          setTip(undefined);
          setActive(undefined);
        }}
      >
        {[1, Math.ceil(count / 2), count].map((rank) => (
          <text
            key={rank}
            x={left - 8}
            y={y(rank)}
            dy="0.32em"
            textAnchor="end"
            className="trend-axis"
          >
            {rank}
          </text>
        ))}
        {weeks.map((w) => (
          <text
            key={w.week}
            x={x(w.week)}
            y={height - 6}
            textAnchor="middle"
            className="trend-axis"
          >
            {weeks.length > 12 && w.week % 2 === 0 && w.week !== last ? '' : `W${w.week}`}
          </text>
        ))}
        {active !== undefined && (
          <line
            x1={x(active)}
            x2={x(active)}
            y1={top - 6}
            y2={y(count) + 6}
            className="trend-crosshair"
          />
        )}
        {ordered.map((team) => (
          <polyline
            key={team.id}
            points={path(team)}
            className={
              team.id === selected
                ? 'trend-line trend-line-highlight'
                : 'trend-line trend-line-context rank-line-context'
            }
          />
        ))}
        {mine.rankByWeek.map((r) => (
          <circle
            key={r.week}
            cx={x(r.week)}
            cy={y(r.rank)}
            r={active === r.week ? 6 : 4}
            className="trend-dot"
          />
        ))}
        {latest && (
          <text
            x={x(latest.week) + 10}
            y={y(latest.rank)}
            dy="0.32em"
            className="trend-label-strong"
          >
            #{latest.rank}{' '}
            {mine.name.length > (width < 480 ? 9 : 14)
              ? `${mine.name.slice(0, width < 480 ? 8 : 13)}…`
              : mine.name}
          </text>
        )}
        {weeks.map((w) => (
          <rect
            key={w.week}
            x={x(w.week) - step / 2}
            y={0}
            width={step}
            height={height - bottom}
            className="trend-hit"
            onMouseEnter={() => {
              setActive(w.week);
              const ranked = teams
                .map((t) => ({ t, r: t.rankByWeek.find((item) => item.week === w.week)?.rank }))
                .filter((entry): entry is { t: TeamInsight; r: number } => entry.r !== undefined)
                .sort((a, b) => a.r - b.r);
              const you = ranked.find((entry) => entry.t.id === selected);
              setTip({
                x: (x(w.week) / width) * 100,
                y: 8,
                content: (
                  <>
                    <strong>After week {w.week}</strong>
                    {ranked.slice(0, 3).map((entry) => (
                      <span key={entry.t.id}>
                        #{entry.r} {entry.t.name}
                      </span>
                    ))}
                    {you && you.r > 3 && (
                      <span>
                        #{you.r} {you.t.name}
                      </span>
                    )}
                  </>
                ),
              });
            }}
          />
        ))}
      </svg>
      <Tooltip tip={tip} />
      <ul className="trend-legend" aria-label="Legend">
        <li>
          <span className="key-line key-highlight" /> {mine.name}
        </li>
        <li>
          <span className="key-line key-context" /> Other teams
        </li>
      </ul>
    </div>
  );
}

function LuckCheck({ teams, selected }: { teams: TeamInsight[]; selected: string }) {
  const [ref, width] = useWidth();
  const [tip, setTip] = useState<Tip>();
  const rows = [...teams].sort((a, b) => b.luck - a.luck);
  const maxWins = Math.max(1, ...rows.map((team) => team.games));
  const rowHeight = 28,
    left = 150,
    right = 56,
    top = 8;
  const height = top + rows.length * rowHeight + 22;
  const x = (wins: number) => left + (wins / maxWins) * (width - left - right);
  const ticks = Array.from({ length: maxWins + 1 }, (_, i) => i).filter(
    (i) => maxWins <= 10 || i % 2 === 0,
  );
  return (
    <div className="trend-chart" ref={ref} onMouseLeave={() => setTip(undefined)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Actual wins compared with wins expected from weekly scoring: ${rows
          .map((t) => `${t.name} ${t.wins} actual, ${one(t.expectedWins)} expected`)
          .join('; ')}`}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={x(tick)} x2={x(tick)} y1={top} y2={height - 22} className="trend-grid" />
            <text x={x(tick)} y={height - 6} className="trend-axis" textAnchor="middle">
              {tick}
            </text>
          </g>
        ))}
        {rows.map((team, index) => {
          const cy = top + index * rowHeight + rowHeight / 2;
          const actual = team.wins + team.ties / 2;
          const lucky = team.luck >= 0;
          const isSelected = team.id === selected;
          return (
            <g
              key={team.id}
              onMouseEnter={() =>
                setTip({
                  x: (x(Math.max(actual, team.expectedWins)) / width) * 100,
                  y: (cy / height) * 100,
                  content: (
                    <>
                      <strong>{team.name}</strong>
                      <span>
                        Record {record(team)} · expected {one(team.expectedWins)} wins
                      </span>
                      <span>
                        All-play {team.allPlayWins}-{team.allPlayLosses}
                        {team.allPlayTies ? `-${team.allPlayTies}` : ''}
                      </span>
                      <span>
                        {lucky ? 'Luckier' : 'Unluckier'} than scoring suggests by{' '}
                        {Math.abs(team.luck).toFixed(1)} wins
                      </span>
                    </>
                  ),
                })
              }
            >
              <rect
                x="0"
                y={cy - rowHeight / 2}
                width={width}
                height={rowHeight}
                className="trend-hit"
              />
              <text
                x={left - 10}
                y={cy}
                dy="0.32em"
                textAnchor="end"
                className={isSelected ? 'trend-label-strong' : 'trend-label'}
              >
                {team.name.length > 20 ? `${team.name.slice(0, 19)}…` : team.name}
              </text>
              <line
                x1={x(team.expectedWins)}
                x2={x(actual)}
                y1={cy}
                y2={cy}
                className="luck-connector"
              />
              <circle cx={x(team.expectedWins)} cy={cy} r="4" className="luck-expected" />
              <circle
                cx={x(actual)}
                cy={cy}
                r="5"
                className={lucky ? 'luck-actual luck-lucky' : 'luck-actual luck-unlucky'}
              />
              <text x={width - right + 8} y={cy} dy="0.32em" className="trend-label">
                {signed(team.luck)}
              </text>
            </g>
          );
        })}
      </svg>
      <Tooltip tip={tip} />
      <ul className="trend-legend" aria-label="Legend">
        <li>
          <span className="key-dot luck-expected" /> Wins expected from scoring
        </li>
        <li>
          <span className="key-dot luck-lucky" /> Actual wins, more than expected
        </li>
        <li>
          <span className="key-dot luck-unlucky" /> Actual wins, fewer than expected
        </li>
      </ul>
    </div>
  );
}

function PointsScatter({ teams, selected }: { teams: TeamInsight[]; selected: string }) {
  const [ref, width] = useWidth();
  const [tip, setTip] = useState<Tip>();
  const height = 300,
    left = 48,
    right = 20,
    top = 16,
    bottom = 36;
  const pf = teams.map((t) => t.pointsFor),
    pa = teams.map((t) => t.pointsAgainst);
  const pad = (values: number[]) => {
    const spread = Math.max(...values) - Math.min(...values) || 10;
    return [Math.min(...values) - spread * 0.12, Math.max(...values) + spread * 0.12] as const;
  };
  const [x0, x1] = pad(pf),
    [y0, y1] = pad(pa);
  const x = (v: number) => left + ((v - x0) / (x1 - x0)) * (width - left - right);
  const y = (v: number) => top + (1 - (v - y0) / (y1 - y0)) * (height - top - bottom);
  const avgPf = pf.reduce((a, b) => a + b, 0) / pf.length,
    avgPa = pa.reduce((a, b) => a + b, 0) / pa.length;
  const topScorer = [...teams].sort((a, b) => b.pointsFor - a.pointsFor)[0]!;
  const labelled = new Set([selected, topScorer.id]);
  // Draw the highlighted team last so it sits above the rest.
  const ordered = [...teams].sort((a, b) => Number(a.id === selected) - Number(b.id === selected));
  return (
    <div className="trend-chart" ref={ref} onMouseLeave={() => setTip(undefined)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Season points for and against: ${teams
          .map((t) => `${t.name} ${one(t.pointsFor)} for, ${one(t.pointsAgainst)} against`)
          .join('; ')}`}
      >
        <line x1={x(avgPf)} x2={x(avgPf)} y1={top} y2={height - bottom} className="trend-grid" />
        <line x1={left} x2={width - right} y1={y(avgPa)} y2={y(avgPa)} className="trend-grid" />
        {width >= 420 && (
          <>
            <text x={width - right - 4} y={top + 10} textAnchor="end" className="trend-axis">
              High scoring · tough schedule
            </text>
            <text
              x={width - right - 4}
              y={height - bottom - 6}
              textAnchor="end"
              className="trend-axis"
            >
              High scoring · easy schedule
            </text>
            <text x={left + 4} y={top + 10} className="trend-axis">
              Low scoring · tough schedule
            </text>
            <text x={left + 4} y={height - bottom - 6} className="trend-axis">
              Low scoring · easy schedule
            </text>
          </>
        )}
        <text
          x={(left + width - right) / 2}
          y={height - 6}
          textAnchor="middle"
          className="trend-axis"
        >
          Points scored →
        </text>
        <text
          transform={`translate(14 ${(top + height - bottom) / 2}) rotate(-90)`}
          textAnchor="middle"
          className="trend-axis"
        >
          Points allowed →
        </text>
        {ordered.map((team) => {
          const isSelected = team.id === selected;
          return (
            <g
              key={team.id}
              onMouseEnter={() =>
                setTip({
                  x: (x(team.pointsFor) / width) * 100,
                  y: (y(team.pointsAgainst) / height) * 100,
                  content: (
                    <>
                      <strong>{team.name}</strong>
                      <span>
                        {one(team.pointsFor)} for · {one(team.pointsAgainst)} against
                      </span>
                      <span>Record {record(team)}</span>
                    </>
                  ),
                })
              }
            >
              <circle
                cx={x(team.pointsFor)}
                cy={y(team.pointsAgainst)}
                r="14"
                className="trend-hit"
              />
              <circle
                cx={x(team.pointsFor)}
                cy={y(team.pointsAgainst)}
                r={isSelected ? 7 : 5}
                className={isSelected ? 'scatter-dot scatter-highlight' : 'scatter-dot'}
              />
              {labelled.has(team.id) && (
                <text
                  x={x(team.pointsFor) + (x(team.pointsFor) > width - 160 ? -10 : 10)}
                  y={y(team.pointsAgainst)}
                  dy="0.32em"
                  textAnchor={x(team.pointsFor) > width - 160 ? 'end' : 'start'}
                  className={isSelected ? 'trend-label-strong' : 'trend-label'}
                >
                  {team.name.length > 20 ? `${team.name.slice(0, 19)}…` : team.name}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}

/** Season trends computed live from completed weekly scores; never saved with reports. */
export function LeagueTrends({ league }: { league: LeagueConnection }) {
  const insights = useMemo(() => leagueInsights(league), [league]);
  const saved = selectedTeamId(league, readTeamSelections());
  const fallback = insights?.teams.reduce<TeamInsight | undefined>(
    (best, team) => (!best || team.pointsFor > best.pointsFor ? team : best),
    undefined,
  )?.id;
  const [choice, setChoice] = useState<string>();
  const selected =
    (choice && insights?.teams.some((t) => t.id === choice) ? choice : undefined) ??
    (saved && insights?.teams.some((t) => t.id === saved) ? saved : undefined) ??
    fallback ??
    '';
  if (!insights) {
    return (
      <section className="league-trends" aria-label="Season trends">
        <p className="section-overline">SEASON SO FAR</p>
        <h2>Season trends</h2>
        <p className="empty-activity">
          Weekly history appears after a league update that includes completed weeks.
          {league.connectionMode === 'snapshot'
            ? ' Re-import an updated ESPN page to load it.'
            : ' Refresh the league to load it.'}
        </p>
      </section>
    );
  }
  const team = insights.teams.find((t) => t.id === selected)!;
  const standings = [...insights.teams].sort(
    (a, b) => b.wins + b.ties / 2 - (a.wins + a.ties / 2) || b.pointsFor - a.pointsFor,
  );
  const rank = standings.findIndex((t) => t.id === selected) + 1;
  const medianShare =
    team.weekly.filter((w) => {
      const week = insights.weeks.find((item) => item.week === w.week);
      return week && w.points > week.median;
    }).length / team.weekly.length;
  const first = insights.weeks[0]!.week,
    last = insights.weeks.at(-1)!.week;
  return (
    <section className="league-trends" aria-label="Season trends">
      <div className="visuals-heading">
        <div>
          <p className="section-overline">SEASON SO FAR</p>
          <h2>How {team.name} is trending</h2>
          <p className="visual-source">
            Weeks {first === last ? first : `${first}–${last}`} · completed games only
          </p>
        </div>
        <label className="trend-team-picker">
          Highlight team
          <select value={selected} onChange={(event) => setChoice(event.target.value)}>
            {insights.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ul className="trend-stats" aria-label={`${team.name} season summary`}>
        <li>
          <strong>{record(team)}</strong>
          <span>
            Record · {ordinal(rank)} of {standings.length}
          </span>
        </li>
        <li>
          <strong>{one(team.pointsFor / team.games)}</strong>
          <span>Points per week</span>
        </li>
        <li>
          <strong>{Math.round(medianShare * 100)}%</strong>
          <span>Weeks above the league median</span>
        </li>
        <li>
          <strong>{signed(team.luck)}</strong>
          <span>Wins vs. what scoring suggests</span>
        </li>
      </ul>
      <div className="trend-panels">
        <div className="visual-panel trend-panel-wide">
          <h3>Weekly scoring</h3>
          <WeeklyScoring weeks={insights.weeks} team={team} />
        </div>
        <div className="visual-panel trend-panel-wide">
          <h3>Power rank by week</h3>
          <p className="trend-caption">
            Rank by season-to-date record against every team, so one lucky matchup does not move it.
          </p>
          <PowerRank weeks={insights.weeks} teams={insights.teams} selected={selected} />
        </div>
        <div className="visual-panel trend-panel-wide">
          <h3>Playoff odds</h3>
          <PlayoffOddsPanel league={league} selected={selected} />
        </div>
        <div className="visual-panel">
          <h3>Luck check</h3>
          <p className="trend-caption">
            Expected wins come from playing every team each week. A gap means the schedule helped or
            hurt.
          </p>
          <LuckCheck teams={insights.teams} selected={selected} />
        </div>
        <div className="visual-panel">
          <h3>Points for vs. against</h3>
          <p className="trend-caption">Lines mark the league averages.</p>
          <PointsScatter teams={insights.teams} selected={selected} />
        </div>
      </div>
      <details className="visual-data">
        <summary>View standings data</summary>
        <div className="visual-table-scroll">
          <table>
            <caption>Standings from completed weeks</caption>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Team</th>
                <th scope="col">Record</th>
                <th scope="col">Points for</th>
                <th scope="col">Points against</th>
                <th scope="col">All-play</th>
                <th scope="col">Expected wins</th>
                <th scope="col">Luck</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((t, index) => (
                <tr key={t.id} aria-current={t.id === selected ? 'true' : undefined}>
                  <td>{index + 1}</td>
                  <th scope="row">{t.name}</th>
                  <td>{record(t)}</td>
                  <td>{one(t.pointsFor)}</td>
                  <td>{one(t.pointsAgainst)}</td>
                  <td>
                    {t.allPlayWins}-{t.allPlayLosses}
                    {t.allPlayTies ? `-${t.allPlayTies}` : ''}
                  </td>
                  <td>{one(t.expectedWins)}</td>
                  <td>{signed(t.luck)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function ordinal(value: number) {
  const suffix =
    value % 100 >= 11 && value % 100 <= 13
      ? 'th'
      : (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[value % 10] ?? 'th');
  return `${value}${suffix}`;
}
