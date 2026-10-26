import { useMemo, useState } from 'react';
import { record, type PropBoardRow } from '@sidekick/core';
import { useApi } from './hooks/useApi';
import { formatDateTime } from './date-format';
import { LoadingStatus } from './LoadFeedback';
import { formatOdds } from './display-preferences';
import { ErrorNotice } from './ErrorNotice';
import './props.css';

export type PropHandoff = {
  gameId: string;
  playerName: string;
  stat: PropBoardRow['stat'];
  line: number;
  side: 'over' | 'under';
  odds?: number;
  oppositeOdds?: number;
};
type Tally = { wins: number; losses: number; pushes: number; winRate?: number };
type Board = {
  week?: number;
  generatedAt: string;
  priced: boolean;
  games: { id: string; label: string; kickoffAt?: string }[];
  rows: PropBoardRow[];
  warnings: string[];
  model?: { marketWeight: number; fitted: boolean; gradedForFit: number };
  record: {
    pending: number;
    breakEven: number;
    brier?: number;
    pricedGames?: number;
    overall: Tally;
    byStrength: Record<'strong' | 'moderate' | 'slight', Tally>;
  };
};
const isBoard = (x: unknown): x is Board =>
  record(x) &&
  Array.isArray(x.rows) &&
  x.rows.length <= 5000 &&
  x.rows.every(
    (r) => record(r) && typeof r.playerName === 'string' && typeof r.line === 'number',
  ) &&
  Array.isArray(x.games) &&
  Array.isArray(x.warnings) &&
  record(x.record) &&
  record(x.record.overall);

const statLabels: Record<string, string> = {
  passing_yards: 'Passing yards',
  completions: 'Completions',
  attempts: 'Pass attempts',
  passing_tds: 'Passing TDs',
  passing_interceptions: 'Interceptions',
  rushing_yards: 'Rushing yards',
  carries: 'Carries',
  receiving_yards: 'Receiving yards',
  receptions: 'Receptions',
};
const num = (n?: number) =>
  n === undefined ? '—' : new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(n);
const signed = (n?: number) => (n === undefined ? '—' : `${n > 0 ? '+' : ''}${num(n)}`);
const strengthOrder = { strong: 0, moderate: 1, slight: 2 };
const tallyText = (t: Tally) =>
  `${t.wins}–${t.losses}${t.pushes ? `–${t.pushes}` : ''}${t.winRate !== undefined ? ` (${Math.round(t.winRate * 100)}%)` : ''}`;

/**
 * Every published prop this week next to the app's own projection and the player's game log. Leans are
 * saved before kickoff and graded afterwards, so the record shows whether they deserve trust.
 */
export function PropsBoard({
  leagueId,
  myTeamName,
  onAnalyze,
  initialPlayer = '',
}: {
  leagueId: string | undefined;
  myTeamName: string | undefined;
  onAnalyze: (pick: PropHandoff) => void;
  /** Opens filtered to one player (from his player card), across every prop, not just leans. */
  initialPlayer?: string;
}) {
  const [revision, setRevision] = useState(0);
  const [gameId, setGameId] = useState('');
  const [stat, setStat] = useState('');
  const [query, setQuery] = useState(initialPlayer);
  const [scope, setScope] = useState<'all' | 'leans' | 'fantasy' | 'mine'>(
    initialPlayer ? 'all' : 'leans',
  );
  const {
    data: board,
    error,
    reload,
  } = useApi(
    `/api/props/board${leagueId ? `?${new URLSearchParams({ league: leagueId })}` : ''}`,
    isBoard,
    {
      timeoutMs: 120_000,
      revision,
      errorMessage: 'The props board couldn’t load. ESPN may be slow; try again in a minute.',
    },
  );

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (board?.rows ?? [])
      .filter(
        (r) =>
          (!gameId || r.gameId === gameId) &&
          (!stat || r.stat === stat) &&
          (!needle || r.playerName.toLowerCase().includes(needle)) &&
          (scope === 'all' ||
            (scope === 'leans' && r.lean) ||
            (scope === 'fantasy' && r.fantasyTeam) ||
            (scope === 'mine' && myTeamName && r.fantasyTeam === myTeamName)),
      )
      .sort(
        (a, b) =>
          (a.lean ? strengthOrder[a.lean.strength] : 3) -
            (b.lean ? strengthOrder[b.lean.strength] : 3) ||
          Math.abs(b.lean?.score ?? 0) - Math.abs(a.lean?.score ?? 0) ||
          a.playerName.localeCompare(b.playerName),
      );
  }, [board, gameId, stat, query, scope, myTeamName]);

  const graded = board ? board.record.overall.wins + board.record.overall.losses : 0;
  return (
    <section className="props-board" aria-labelledby="props-board-title">
      <div className="props-board-head">
        <div>
          <h2 id="props-board-title">
            Player props{board?.week !== undefined ? ` · Week ${board.week}` : ''}
          </h2>
          <p>
            Every published line next to our own projection and this season’s game log. Research
            only: a lean is a comparison, not a promise.
          </p>
        </div>
        <button type="button" className="small-button" onClick={() => setRevision((n) => n + 1)}>
          Refresh lines
        </button>
      </div>
      {board && (
        <div className="props-record" aria-label="Lean record">
          <div>
            <strong>Lean record {tallyText(board.record.overall)}</strong>
            <span>
              {board.record.overall.winRate !== undefined
                ? `Right ${Math.round(board.record.overall.winRate * 100)}% of the time; at −110 you need ${Math.round(board.record.breakEven * 1000) / 10}% to make money. `
                : `At −110 you need ${Math.round(board.record.breakEven * 1000) / 10}% right to make money. `}
              {graded < 50
                ? `Only ${graded} graded so far, too few to judge.`
                : board.record.overall.winRate !== undefined &&
                    board.record.overall.winRate > board.record.breakEven
                  ? 'Ahead of that so far; keep watching before trusting it.'
                  : 'Not ahead of that; treat leans as conversation, not bets.'}
              {board.record.pending ? ` ${board.record.pending} still waiting on games.` : ''}
            </span>
            <details className="props-method-inline">
              <summary>How sure is the model?</summary>
              <span>
                {board.record.brier !== undefined
                  ? `Its over/under chances score ${board.record.brier} over ${board.record.pricedGames} graded props (0.25 is a coin flip; lower is better). `
                  : ''}
                {board.model
                  ? `It moves ${Math.round(board.model.marketWeight * 100)}% of the way from the sportsbook line toward its own projection${board.model.fitted ? `, a share fitted on ${board.model.gradedForFit} graded props.` : ` until 150 props are graded (${board.model.gradedForFit} so far).`}`
                  : ''}
              </span>
            </details>
          </div>
          <ul>
            {(['strong', 'moderate', 'slight'] as const).map((s) => (
              <li key={s}>
                <span className={`lean-chip ${s}`}>{s}</span>{' '}
                {tallyText(board.record.byStrength[s])}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="props-filters">
        <label>
          Game
          <select value={gameId} onChange={(e) => setGameId(e.target.value)}>
            <option value="">All games</option>
            {board?.games.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
                {g.kickoffAt ? ` · ${formatDateTime(g.kickoffAt)}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          Stat
          <select value={stat} onChange={(e) => setStat(e.target.value)}>
            <option value="">All stats</option>
            {Object.entries(statLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Player
          <input
            type="search"
            value={query}
            placeholder="Search players"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="props-scope" role="group" aria-label="Show">
          {(
            [
              ['leans', 'Leans'],
              ['all', 'All props'],
              ['fantasy', 'On fantasy rosters'],
              ...(myTeamName ? [['mine', 'My players'] as const] : []),
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={scope === value}
              onClick={() => setScope(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {error && <ErrorNotice error={error} onRetry={reload} />}
      {!board && !error && (
        <LoadingStatus message="Pulling every prop for the week…" shape="cards" showElapsed />
      )}
      {board?.warnings.map((w) => (
        <p key={w} className="notice">
          {w}
        </p>
      ))}
      {board && !board.priced && (
        <p className="props-note">
          Lines come from ESPN, which doesn’t show prop prices. Check the price at your book before
          deciding; −110 is typical.
        </p>
      )}
      {board && (
        <div className="props-table-wrap">
          <table className="props-table">
            <thead>
              <tr>
                <th scope="col">Player</th>
                <th scope="col">Prop</th>
                <th
                  scope="col"
                  title="Our projected average, then the typical game (the model’s median)"
                >
                  Our proj. → typical
                </th>
                <th scope="col">This season</th>
                <th
                  scope="col"
                  title="The model’s chance of the over and the line it sees as a coin flip"
                >
                  Model
                </th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 200).map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.playerName}</strong>
                    <small>
                      {r.team ?? ''} · {r.matchup}
                      {r.fantasyTeam && (
                        <span
                          className={`fantasy-chip${r.fantasyTeam === myTeamName ? ' mine' : ''}`}
                        >
                          {r.fantasyTeam === myTeamName ? 'Your player' : r.fantasyTeam}
                        </span>
                      )}
                    </small>
                  </td>
                  <td>
                    <strong>
                      {statLabels[r.stat] ?? r.stat} {num(r.line)}
                    </strong>
                    <small>
                      {r.sportsbook}
                      {r.overOdds !== undefined ? ` · O ${formatOdds(r.overOdds)}` : ''}
                      {r.underOdds !== undefined ? ` · U ${formatOdds(r.underOdds)}` : ''}
                    </small>
                  </td>
                  <td>
                    {r.projection === undefined ? (
                      <small>No projection</small>
                    ) : (
                      <>
                        <strong>
                          {num(r.projection)} → {num(r.typicalGame)}
                        </strong>
                        <small>{signed(r.gap)} vs line</small>
                      </>
                    )}
                  </td>
                  <td>
                    {r.recent.length ? (
                      <>
                        <strong>
                          Over {r.overGames} of {r.recent.length}
                        </strong>
                        <small>
                          avg {num(r.average)} · last {r.recent.slice(-4).map(num).join(', ')}
                        </small>
                      </>
                    ) : (
                      <small>No games yet</small>
                    )}
                  </td>
                  <td>
                    {r.model ? (
                      <>
                        <strong>
                          {Math.round(r.model.overChance * 100)}% over · fair {num(r.model.median)}
                        </strong>
                        {r.lean ? (
                          <span className={`lean-chip ${r.lean.strength}`}>
                            {r.lean.side === 'over' ? 'Over' : 'Under'} · {r.lean.strength}{' '}
                            <span className="lean-edge">+{num(r.lean.score * 100)} pts</span>
                          </span>
                        ) : (
                          <small>No lean{r.model.edge > 0 ? ' without a real price' : ''}</small>
                        )}
                      </>
                    ) : (
                      <small>No model view</small>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() =>
                        onAnalyze({
                          gameId: r.gameId,
                          playerName: r.playerName,
                          stat: r.stat,
                          line: r.line,
                          side: r.lean?.side ?? 'over',
                          ...((r.lean?.side ?? 'over') === 'over'
                            ? {
                                ...(r.overOdds !== undefined ? { odds: r.overOdds } : {}),
                                ...(r.underOdds !== undefined ? { oppositeOdds: r.underOdds } : {}),
                              }
                            : {
                                ...(r.underOdds !== undefined ? { odds: r.underOdds } : {}),
                                ...(r.overOdds !== undefined ? { oppositeOdds: r.overOdds } : {}),
                              }),
                        })
                      }
                    >
                      Analyze
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <p className="empty-activity">No props match these filters.</p>}
          {rows.length > 200 && (
            <p className="props-note">
              Showing the first 200 of {rows.length}. Narrow the filters.
            </p>
          )}
        </div>
      )}
      <details className="props-method">
        <summary>How the model works</summary>
        <p>
          The app makes its own projection: recent games weigh most, then it adjusts for snap share
          and depth-chart changes, the betting total and spread, what the opponent allows to that
          position, and home field. A fitted outcome spread for each stat turns that into a chance
          of the over. On 2026 games it never saw, actual results landed evenly across its predicted
          ranges.
        </p>
        <p>
          Sportsbooks know things it doesn’t, like role changes and late injury news, so the line is
          treated as a coin flip and the model may claim only part of its disagreement. A lean needs
          the model’s chance to clear break-even (52.4% at −110). Touchdown and interception lines
          are often priced far from −110, so they get no lean without a real price.
        </p>
        <p>
          Each lean is saved before kickoff and graded after the game. Lines can move, and the
          record uses the line seen last before kickoff. Nothing here has shown a lasting edge over
          sportsbooks.
        </p>
      </details>
    </section>
  );
}
