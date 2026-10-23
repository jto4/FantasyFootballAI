import { record, type TradeIdea, type WaiverDay } from '@sidekick/core';
import { useApi } from './hooks/useApi';
import { LoadingStatus } from './LoadFeedback';
import { ErrorNotice } from './ErrorNotice';

const points = (n: number) =>
  `${n >= 0 ? '+' : ''}${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(n)}`;
const strings = (x: unknown) => Array.isArray(x) && x.every((w) => typeof w === 'string');
const isWaiverDay = (x: unknown): x is WaiverDay =>
  record(x) && Array.isArray(x.candidates) && Array.isArray(x.weakSpots) && strings(x.warnings);
const isTradeIdeas = (x: unknown): x is { ideas: TradeIdea[]; warnings: string[] } =>
  record(x) && Array.isArray(x.ideas) && strings(x.warnings);

function useReport<T>(path: string, league: string, team: string, guard: (x: unknown) => x is T) {
  return useApi(
    league && team ? `${path}?${new URLSearchParams({ league, team })}` : undefined,
    guard,
    {
      timeoutMs: 60_000,
      errorMessage: 'This list could not be prepared. Try again shortly.',
    },
  );
}

/** This week's free agents ranked by best-lineup gain; choosing one fills the waiver form. */
export function WaiverDayPanel({
  league,
  team,
  onUse,
}: {
  league: string;
  team: string;
  onUse: (candidateId: string, dropId?: string) => void;
}) {
  const { data, error, loading, reload } = useReport(
    '/api/advice/waiver-day',
    league,
    team,
    isWaiverDay,
  );
  return (
    <section className="roster-moves" aria-label="Waiver day">
      <h3>Waiver day</h3>
      {loading && (
        <LoadingStatus message="Ranking free agents for your roster…" shape="rows" showElapsed />
      )}
      {error && <ErrorNotice error={error} onRetry={reload} />}
      {data && (
        <>
          {data.weakSpots.length > 0 && (
            <p className="roster-moves-note">
              Weakest starting spots:{' '}
              {data.weakSpots
                .map((s) => `${s.slot} (${s.name}, ${points(s.points).slice(1)})`)
                .join(' · ')}
            </p>
          )}
          {data.warnings.map((w) => (
            <p key={w} className="roster-moves-note">
              {w}
            </p>
          ))}
          {data.candidates.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th scope="col">Free agent</th>
                  <th scope="col">Estimate</th>
                  <th scope="col">Lineup change</th>
                  <th scope="col">Drop</th>
                  <th scope="col">
                    <span className="visually-hidden">Analyze</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.candidates.map((c) => (
                  <tr key={c.playerId}>
                    <th scope="row">
                      {c.name} <small>{[c.position, c.team].filter(Boolean).join(' · ')}</small>
                    </th>
                    <td>{points(c.projected).slice(1)}</td>
                    <td className={(c.drop?.netGain ?? 0) > 0 ? 'gain' : undefined}>
                      {c.drop
                        ? points(c.drop.netGain)
                        : c.gain !== undefined
                          ? points(c.gain)
                          : '—'}
                    </td>
                    <td>{c.drop?.name ?? '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="small-button"
                        onClick={() => onUse(c.playerId, c.drop?.playerId)}
                        aria-label={`Analyze adding ${c.name}`}
                      >
                        Analyze
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="roster-moves-note">
            Changes are this week’s best-lineup estimate after the add and drop. FAAB budgets and
            waiver order aren’t available from league imports.
          </p>
        </>
      )}
    </section>
  );
}

/** One-for-one trades that raise both best lineups over the rest of the season. */
export function TradeIdeasPanel({
  league,
  team,
  onUse,
}: {
  league: string;
  team: string;
  onUse: (idea: TradeIdea) => void;
}) {
  const { data, error, loading, reload } = useReport(
    '/api/advice/trade-ideas',
    league,
    team,
    isTradeIdeas,
  );
  return (
    <section className="roster-moves" aria-label="Trade ideas">
      <h3>Trade ideas</h3>
      {loading && (
        <LoadingStatus
          message="Looking for trades that help both teams…"
          shape="rows"
          showElapsed
        />
      )}
      {error && <ErrorNotice error={error} onRetry={reload} />}
      {data && (
        <>
          {data.warnings.map((w) => (
            <p key={w} className="roster-moves-note">
              {w}
            </p>
          ))}
          {data.ideas.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th scope="col">Team</th>
                  <th scope="col">You give</th>
                  <th scope="col">You get</th>
                  <th scope="col">Your change</th>
                  <th scope="col">Their change</th>
                  <th scope="col">
                    <span className="visually-hidden">Analyze</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.ideas.map((idea) => (
                  <tr key={`${idea.teamId}-${idea.give.playerId}-${idea.receive.playerId}`}>
                    <th scope="row">{idea.teamName}</th>
                    <td>
                      {idea.give.name} <small>{idea.give.position}</small>
                    </td>
                    <td>
                      {idea.receive.name} <small>{idea.receive.position}</small>
                    </td>
                    <td className="gain">{points(idea.myGain)}</td>
                    <td>{points(idea.theirGain)}</td>
                    <td>
                      <button
                        type="button"
                        className="small-button"
                        onClick={() => onUse(idea)}
                        aria-label={`Analyze trading ${idea.give.name} for ${idea.receive.name}`}
                      >
                        Analyze
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="roster-moves-note">
            Rest-of-season best-lineup estimates for both teams. A trade that helps both sides is
            easier to get accepted; it is not a guarantee either way.
          </p>
        </>
      )}
    </section>
  );
}
