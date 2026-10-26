import { record, type LiveMatchup } from '@sidekick/core';
import { PlayerName } from './PlayerCard';
import { useApi } from './hooks/useApi';
import { points, type MatchupSide, type WeeklyBriefing } from './weekly-briefing';

type LiveReport = { matchupWeek?: number; matchup?: LiveMatchup };
const isLiveReport = (x: unknown): x is LiveReport =>
  record(x) &&
  (x.matchup === undefined ||
    (record(x.matchup) && record(x.matchup.you) && record(x.matchup.opponent)));

type Score = { name: string; points?: number; projected?: number };
function Side({ side, align }: { side: Score; align: 'start' | 'end' }) {
  return (
    <div className={`matchup-side matchup-side-${align}`}>
      <p className="matchup-team">{side.name}</p>
      <p className="matchup-score">{side.points !== undefined ? points(side.points) : '—'}</p>
      <p className="matchup-projected">
        {side.projected !== undefined
          ? `Projected ${points(side.projected)}`
          : 'Projection unavailable'}
      </p>
    </div>
  );
}

function Estimate({ starter }: { starter: MatchupSide['starters'][number] }) {
  return (
    <>
      {points(starter.estimate!)}
      {starter.range && (
        <span
          className="matchup-range"
          title="Likely range: 8 in 10 similar projections finished inside it"
        >
          {' '}
          {starter.range.low.toFixed(0)}–{starter.range.high.toFixed(0)}
        </span>
      )}
      {starter.playChance !== undefined && (
        <span
          className="matchup-range matchup-questionable"
          title="Listed Questionable: the estimate is if he plays; the team total counts the chance he sits"
        >
          {' '}
          Q · {Math.round(starter.playChance * 100)}% to play
        </span>
      )}
    </>
  );
}

/**
 * Head-to-head view of the league's current week; never mixes in another week's estimates. Once
 * any starter's game has begun, the score, projection and win chance come from Live (NFL box
 * scores), the same numbers the Live page shows, since saved league scores can be days old.
 */
export function MatchupCard({
  briefing,
  leagueId,
  teamId,
  onLive,
}: {
  briefing: WeeklyBriefing;
  leagueId?: string | undefined;
  teamId?: string | undefined;
  onLive?: (() => void) | undefined;
}) {
  const matchup = briefing.matchup;
  const underway = Boolean(
    matchup && [...matchup.you.starters, ...matchup.opponent.starters].some((p) => p.started),
  );
  const { data: live } = useApi(
    underway && leagueId && teamId
      ? `/api/live?${new URLSearchParams({ league: leagueId, team: teamId })}`
      : undefined,
    isLiveReport,
    { timeoutMs: 60_000 },
  );
  if (!matchup) return null;
  const { you, opponent } = matchup;
  const liveMatchup = live?.matchup && live.matchupWeek === matchup.week ? live.matchup : undefined;
  const score = (side: MatchupSide, other?: LiveMatchup['you']): Score =>
    other
      ? {
          name: side.name,
          ...(other.points !== undefined ? { points: other.points } : {}),
          ...(other.projectedFinal !== undefined ? { projected: other.projectedFinal } : {}),
        }
      : side;
  const mine = score(you, liveMatchup?.you);
  const theirs = score(opponent, liveMatchup?.opponent);
  // While games are on, saved scores are not shown as current: wait for Live's numbers.
  const waiting = underway && !liveMatchup;
  const both = !waiting && mine.projected !== undefined && theirs.projected !== undefined;
  const edge = both ? mine.projected! - theirs.projected! : undefined;
  const chance = underway ? liveMatchup?.winChance : matchup.winProbability;
  const rows = Math.max(you.starters.length, opponent.starters.length);
  const stale = matchup.week !== briefing.week;
  return (
    <section className="matchup-card" aria-labelledby="matchup-card-title">
      <p className="section-overline">WEEK {matchup.week} MATCHUP</p>
      <h3 id="matchup-card-title">
        {edge === undefined
          ? `${you.name} vs ${opponent.name}`
          : Math.abs(edge) < 1
            ? 'Projected to be close'
            : edge > 0
              ? `You’re projected to win by ${points(edge)}`
              : `You’re projected to lose by ${points(-edge)}`}
      </h3>
      {chance !== undefined && (
        <div className="matchup-chance">
          <p>
            <strong>{Math.round(chance * 100)}%</strong> chance you win
          </p>
          <span className="matchup-chance-bar" aria-hidden="true">
            <span style={{ width: `${Math.round(chance * 100)}%` }} />
          </span>
          <small>
            {underway
              ? 'Live: the score so far from NFL box scores, plus estimates for starters yet to play.'
              : 'Before kickoff, from each starter’s estimate and how far past results strayed from similar estimates. Teammates’ scores are treated as unrelated.'}
            {underway && onLive ? (
              <>
                {' '}
                <button type="button" className="text-button" onClick={onLive}>
                  Open Live
                </button>
              </>
            ) : null}
          </small>
        </div>
      )}
      {waiting && <p className="matchup-note">Games are under way; checking live scores…</p>}
      {stale && (
        <p className="matchup-note">
          From the league’s week {matchup.week} data; update the league for week {briefing.week}.
        </p>
      )}
      <div className="matchup-scoreline">
        <Side side={waiting ? { name: you.name } : mine} align="start" />
        <span className="matchup-vs" aria-hidden="true">
          vs
        </span>
        <Side side={waiting ? { name: opponent.name } : theirs} align="end" />
      </div>
      {rows > 0 && (
        <details className="matchup-lineups">
          <summary>Compare starting lineups</summary>
          <table>
            <caption className="visually-hidden">
              Starting lineups for {you.name} and {opponent.name}
            </caption>
            <thead>
              <tr>
                <th scope="col">{you.name}</th>
                <th scope="col">Est.</th>
                <th scope="col">Est.</th>
                <th scope="col">{opponent.name}</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rows }, (_, index) => {
                const mine = you.starters[index];
                const theirs = opponent.starters[index];
                return (
                  <tr key={index}>
                    <td>
                      {mine ? (
                        <>
                          <span className="matchup-position">{mine.position}</span>{' '}
                          <PlayerName id={mine.id} name={mine.name} />
                        </>
                      ) : null}
                    </td>
                    <td className="matchup-estimate">
                      {mine?.estimate !== undefined ? (
                        <Estimate starter={mine} />
                      ) : mine?.started ? (
                        'Played'
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="matchup-estimate">
                      {theirs?.estimate !== undefined ? (
                        <Estimate starter={theirs} />
                      ) : theirs?.started ? (
                        'Played'
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {theirs ? (
                        <>
                          <span className="matchup-position">{theirs.position}</span>{' '}
                          <PlayerName id={theirs.id} name={theirs.name} />
                        </>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
}
