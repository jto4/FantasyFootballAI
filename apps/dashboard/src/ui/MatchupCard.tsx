import { points, type MatchupSide, type WeeklyBriefing } from './weekly-briefing';

function Side({ side, align }: { side: MatchupSide; align: 'start' | 'end' }) {
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

/** Head-to-head view of the league's current week; never mixes in another week's estimates. */
export function MatchupCard({ briefing }: { briefing: WeeklyBriefing }) {
  const matchup = briefing.matchup;
  if (!matchup) return null;
  const { you, opponent } = matchup;
  const both = you.projected !== undefined && opponent.projected !== undefined;
  const edge = both ? you.projected! - opponent.projected! : undefined;
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
      {matchup.winProbability !== undefined && (
        <div className="matchup-chance">
          <p>
            <strong>{Math.round(matchup.winProbability * 100)}%</strong> chance you win
          </p>
          <span className="matchup-chance-bar" aria-hidden="true">
            <span style={{ width: `${Math.round(matchup.winProbability * 100)}%` }} />
          </span>
          <small>
            Before kickoff, from each starter’s estimate and how far past results strayed from
            similar estimates. Teammates’ scores are treated as unrelated.
          </small>
        </div>
      )}
      {stale && (
        <p className="matchup-note">
          From the league’s week {matchup.week} data; update the league for week {briefing.week}.
        </p>
      )}
      <div className="matchup-scoreline">
        <Side side={you} align="start" />
        <span className="matchup-vs" aria-hidden="true">
          vs
        </span>
        <Side side={opponent} align="end" />
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
                          <span className="matchup-position">{mine.position}</span> {mine.name}
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
                          <span className="matchup-position">{theirs.position}</span> {theirs.name}
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
