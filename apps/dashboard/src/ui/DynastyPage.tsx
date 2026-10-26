import { useMemo, useState } from 'react';
import { PlayerName } from './PlayerCard';
import { record, type LeagueConnection, type PickTier, type RookiePick } from '@sidekick/core';
import { requestJson } from './api-client';
import { useApi } from './hooks/useApi';
import { LoadingStatus } from './LoadFeedback';
import { ErrorNotice } from './ErrorNotice';
import './dynasty.css';

type Seasons = [number, number, number, number];
type PlayerValue = {
  id: string;
  name: string;
  position: string;
  nflTeam?: string;
  age?: number;
  seasons: Seasons;
  aboveReplacement: Seasons;
  value: number;
  basis: 'production' | 'draft-slot' | 'blend';
  rosterPosition?: string;
};
type Rookie = {
  id: string;
  name: string;
  position: string;
  nflTeam?: string;
  nflDraftPick?: number;
  value: number;
  basis: string;
  rosteredBy?: string;
  worthPick: string;
};
type Brief = { id: string; name: string; position?: string; value: number; thisSeason?: number };
export type DynastyReport = {
  league: {
    id: string;
    name: string;
    format: 'redraft' | 'keeper' | 'dynasty';
    detectedFormat: string;
    teams: number;
    season: number;
    remainingGames: number;
  };
  team: {
    id: string;
    name: string;
    value: number;
    thisSeason: number;
    averageAge?: number;
    nowRank: number;
    longRank: number;
    outlook: string;
  };
  teams: { id: string; name: string; value: number; thisSeason: number; averageAge?: number }[];
  roster: PlayerValue[];
  rookies: {
    season: number;
    board: Rookie[];
    /** Set when the next class is not drafted yet, so there is no plan. */
    nextClass?: number;
    plan?: {
      slot: number;
      need: string[];
      rounds: {
        round: number;
        pick: string;
        pickValue: number;
        target?: Rookie;
        alternatives: Rookie[];
      }[];
    };
  };
  picks: {
    season: number;
    rounds: { round: number; early: number; mid: number; late: number }[];
  }[];
  taxi?: { slots: number; used: number; moveToTaxi: Brief[]; activate: Brief[] };
  keepers?: {
    keepers: number;
    suggested: string[];
    ranked: {
      id: string;
      name: string;
      position: string;
      nextSeason: number;
      draftRound?: number;
      cost?: number;
      surplus?: number;
    }[];
  };
  warnings: string[];
};
export const isDynastyReport = (x: unknown): x is DynastyReport =>
  record(x) &&
  record(x.league) &&
  record(x.team) &&
  Array.isArray(x.roster) &&
  Array.isArray(x.teams) &&
  record(x.rookies) &&
  Array.isArray(x.rookies.board) &&
  Array.isArray(x.picks) &&
  Array.isArray(x.warnings);

type TradeView = {
  give: { value: number; picks: { label: string; value: number }[]; players: PlayerValue[] };
  receive: { value: number; picks: { label: string; value: number }[]; players: PlayerValue[] };
  released: { id: string; name: string; value: number }[];
  releaseCost: number;
  net: number;
  thisSeasonNet: number;
  verdict: 'even' | 'gain' | 'loss';
};
type TradeResult = { yours: TradeView; theirs?: TradeView };
const isTradeResult = (x: unknown): x is TradeResult =>
  record(x) && record(x.yours) && typeof x.yours.net === 'number';

const num = (n: number | undefined) =>
  n === undefined ? '—' : new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
const formatLabel = { redraft: 'Redraft', keeper: 'Keeper', dynasty: 'Dynasty' };
const outlookText: Record<string, string> = {
  contender: 'Contender: built to win now.',
  'build for later': 'Strong future, quieter present: keep building.',
  rebuild: 'Rebuild: trade aging points for youth and picks.',
  middle: 'In the middle: pick a direction before the deadline.',
};
const basisText = {
  production: 'From NFL games',
  'draft-slot': 'From NFL draft slot',
  blend: 'Draft slot and early games',
};

function PickEditor({
  picks,
  onChange,
  season,
}: {
  picks: RookiePick[];
  onChange: (picks: RookiePick[]) => void;
  season: number;
}) {
  return (
    <div className="dynasty-picks-edit">
      {picks.map((pick, index) => (
        <div key={index} className="dynasty-pick-row">
          <select
            aria-label="Draft year"
            value={pick.season}
            onChange={(e) =>
              onChange(
                picks.map((p, i) => (i === index ? { ...p, season: Number(e.target.value) } : p)),
              )
            }
          >
            {[season + 1, season + 2, season + 3].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select
            aria-label="Round"
            value={pick.round}
            onChange={(e) =>
              onChange(
                picks.map((p, i) => (i === index ? { ...p, round: Number(e.target.value) } : p)),
              )
            }
          >
            {[1, 2, 3, 4].map((r) => (
              <option key={r} value={r}>
                Round {r}
              </option>
            ))}
          </select>
          <select
            aria-label="Part of the round"
            value={pick.tier ?? 'mid'}
            onChange={(e) =>
              onChange(
                picks.map((p, i) => (i === index ? { ...p, tier: e.target.value as PickTier } : p)),
              )
            }
          >
            <option value="early">Early</option>
            <option value="mid">Middle</option>
            <option value="late">Late</option>
          </select>
          <button
            type="button"
            className="text-button"
            onClick={() => onChange(picks.filter((_, i) => i !== index))}
          >
            Remove
          </button>
        </div>
      ))}
      {picks.length < 6 && (
        <button
          type="button"
          className="text-button"
          onClick={() => onChange([...picks, { season: season + 1, round: 1, tier: 'mid' }])}
        >
          Add a pick
        </button>
      )}
    </div>
  );
}

function PlayerChecklist({
  players,
  chosen,
  onToggle,
  label,
}: {
  players: { id: string; name: string; position?: string }[];
  chosen: string[];
  onToggle: (id: string) => void;
  label: string;
}) {
  return (
    <fieldset className="dynasty-checklist">
      <legend>{label}</legend>
      {players.map((p) => (
        <label key={p.id}>
          <input type="checkbox" checked={chosen.includes(p.id)} onChange={() => onToggle(p.id)} />
          {p.name}
          {p.position ? <small> {p.position}</small> : null}
        </label>
      ))}
    </fieldset>
  );
}

export function TradeCalculator({
  season,
  league,
  teamId,
  horizon = 'dynasty',
}: {
  season: number;
  league: LeagueConnection;
  teamId: string;
  /** "season": the rest of this season only (redraft), without picks. */
  horizon?: 'season' | 'dynasty';
}) {
  const seasonOnly = horizon === 'season';
  const [partner, setPartner] = useState('');
  const [give, setGive] = useState<string[]>([]);
  const [receive, setReceive] = useState<string[]>([]);
  const [givePicks, setGivePicks] = useState<RookiePick[]>([]);
  const [receivePicks, setReceivePicks] = useState<RookiePick[]>([]);
  const [result, setResult] = useState<TradeResult>();
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const skill = (roster: LeagueConnection['teams'][number]['roster']) =>
    (roster ?? []).filter(
      (p) =>
        ['QB', 'RB', 'WR', 'TE'].includes(p.position ?? '') &&
        !/^(IR|TAXI)$/i.test(p.rosterPosition ?? ''),
    );
  const mine = skill(league.teams.find((t) => t.id === teamId)?.roster);
  const theirs = skill(league.teams.find((t) => t.id === partner)?.roster);
  const toggle = (list: string[], set: (next: string[]) => void) => (id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id].slice(0, 10));
  const empty = !give.length && !receive.length && !givePicks.length && !receivePicks.length;
  async function evaluate() {
    setBusy(true);
    setError(undefined);
    try {
      setResult(
        await requestJson('/api/dynasty/trade', isTradeResult, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            league: league.id,
            team: teamId,
            ...(partner ? { partner } : {}),
            give: { playerIds: give, picks: seasonOnly ? [] : givePicks },
            receive: { playerIds: receive, picks: seasonOnly ? [] : receivePicks },
            ...(seasonOnly ? { horizon: 'season' } : {}),
          }),
        }),
      );
    } catch (failure) {
      setError(failure);
      setResult(undefined);
    } finally {
      setBusy(false);
    }
  }
  const view = result?.yours;
  return (
    <section className="dynasty-card dynasty-trade" aria-labelledby="dynasty-trade-title">
      <h2 id="dynasty-trade-title">Trade calculator</h2>
      <p className="dynasty-note">
        {seasonOnly
          ? 'Values count the rest of this season: points above a replacement starter from recent form. '
          : 'Values count this season and the next three. '}
        Taking more players than you send costs the players you would have to release.
      </p>
      <div className="dynasty-trade-sides">
        <div>
          <h3>You give</h3>
          <PlayerChecklist
            label="Your players"
            players={mine}
            chosen={give}
            onToggle={toggle(give, setGive)}
          />
          {!seasonOnly && <PickEditor picks={givePicks} onChange={setGivePicks} season={season} />}
        </div>
        <div>
          <h3>You get</h3>
          <label className="dynasty-partner">
            From
            <select
              value={partner}
              onChange={(e) => {
                setPartner(e.target.value);
                setReceive([]);
              }}
            >
              <option value="">Choose a team</option>
              {league.teams
                .filter((t) => t.id !== teamId)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </label>
          {partner && (
            <PlayerChecklist
              label="Their players"
              players={theirs}
              chosen={receive}
              onToggle={toggle(receive, setReceive)}
            />
          )}
          {!seasonOnly && (
            <PickEditor picks={receivePicks} onChange={setReceivePicks} season={season} />
          )}
        </div>
      </div>
      <button
        type="button"
        className="primary-button"
        disabled={empty || busy}
        onClick={() => void evaluate()}
      >
        {busy ? 'Checking…' : 'Check trade'}
      </button>
      {error !== undefined && <ErrorNotice error={error} compact />}
      {view && (
        <div className={`dynasty-verdict ${view.verdict}`} role="status">
          <p>
            <strong>
              {view.verdict === 'even'
                ? 'About even'
                : view.verdict === 'gain'
                  ? `You gain ${num(view.net)}`
                  : `You lose ${num(-view.net)}`}
            </strong>{' '}
            (you give {num(view.give.value)}, you get {num(view.receive.value)}
            {view.releaseCost ? `, release cost ${num(view.releaseCost)}` : ''}).
          </p>
          <p>
            {seasonOnly ? null : (
              <>
                This season: {view.thisSeasonNet >= 0 ? '+' : ''}
                {num(view.thisSeasonNet)} points above replacement.
              </>
            )}
            {view.released.length
              ? ` You would release ${view.released.map((p) => p.name).join(', ')}.`
              : ''}
          </p>
          {result?.theirs && (
            <p className="dynasty-note">
              For them: {result.theirs.net >= 0 ? '+' : ''}
              {num(result.theirs.net)}. Trades that help both sides usually help one side now and
              the other later.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/** Dynasty and keeper tools: long-term values, trades, rookies, taxi and keepers. */
export function DynastyPage({
  league,
  teamId,
  onChooseTeam,
  onPersonalize,
}: {
  league: LeagueConnection | undefined;
  teamId: string | undefined;
  onChooseTeam: (id: string) => void;
  onPersonalize: () => void;
}) {
  const url =
    league && teamId
      ? `/api/dynasty?${new URLSearchParams({ league: league.id, team: teamId })}`
      : undefined;
  const {
    data: report,
    error,
    loading,
    reload,
  } = useApi(url, isDynastyReport, {
    timeoutMs: 90_000,
    errorMessage: 'Dynasty values could not be loaded.',
  });
  const [showAll, setShowAll] = useState(false);
  const plan = report?.rookies.plan;
  const roster = useMemo(
    () => (showAll ? report?.roster : report?.roster.slice(0, 12)) ?? [],
    [report, showAll],
  );
  return (
    <div className="dynasty-page">
      <div className="page-title-block">
        <div>
          <p className="section-overline">THIS SEASON AND THE NEXT THREE</p>
          <h1>Dynasty</h1>
          <p>
            {report
              ? `${report.league.name} · ${formatLabel[report.league.format]} league`
              : 'Long-term player values, trades, rookies, taxi squad and keepers.'}
          </p>
        </div>
      </div>
      {!league ? (
        <p className="empty-activity">Connect a league to see long-term values.</p>
      ) : !teamId ? (
        <section className="live-team-choice" aria-label="Choose your team">
          <h2>Which team is yours?</h2>
          <label>
            Your team
            <select defaultValue="" onChange={(event) => onChooseTeam(event.target.value)}>
              <option value="" disabled>
                Choose your team
              </option>
              {league.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
        </section>
      ) : loading && !report ? (
        <LoadingStatus message="Valuing every player over four seasons…" shape="cards" />
      ) : null}
      {error && <ErrorNotice error={error} onRetry={reload} />}
      {report && (
        <>
          {report.league.format === 'redraft' && (
            <p className="notice">
              This league looks like redraft, so these values matter only if players carry over.{' '}
              <button type="button" className="text-button" onClick={onPersonalize}>
                Change the league format
              </button>
            </p>
          )}
          {report.warnings.map((w) => (
            <p key={w} className="notice">
              {w}
            </p>
          ))}
          <section className="dynasty-card dynasty-outlook" aria-label="Team outlook">
            <div>
              <span>Long-term value</span>
              <strong>{num(report.team.value)}</strong>
              <small>
                #{report.team.longRank} of {report.league.teams}
              </small>
            </div>
            <div>
              <span>This season</span>
              <strong>{num(report.team.thisSeason)}</strong>
              <small>
                #{report.team.nowRank} of {report.league.teams}
              </small>
            </div>
            <div>
              <span>Core age</span>
              <strong>{report.team.averageAge ?? '—'}</strong>
              <small>weighted by value</small>
            </div>
            <p>{outlookText[report.team.outlook] ?? ''}</p>
          </section>

          <section className="dynasty-card" aria-labelledby="dynasty-roster-title">
            <h2 id="dynasty-roster-title">Your players</h2>
            <p className="dynasty-note">
              Points above a replacement starter at the position, by season. Value adds them up,
              later seasons counting 15% less each year.
            </p>
            <div className="dynasty-table-wrap">
              <table className="dynasty-table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Age</th>
                    <th>Rest of {report.league.season}</th>
                    <th>{report.league.season + 1}</th>
                    <th>{report.league.season + 2}</th>
                    <th>{report.league.season + 3}</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <strong>
                          <PlayerName id={p.id} name={p.name} />
                        </strong>
                        <small>
                          {p.position}
                          {p.nflTeam ? ` · ${p.nflTeam}` : ''}
                          {p.rosterPosition && /^(TAXI|IR)$/i.test(p.rosterPosition)
                            ? ` · ${p.rosterPosition.toUpperCase()}`
                            : ''}
                          {p.basis !== 'production' ? ` · ${basisText[p.basis]}` : ''}
                        </small>
                      </td>
                      <td>{p.age === undefined ? '—' : Math.floor(p.age)}</td>
                      {p.aboveReplacement.map((v, i) => (
                        <td key={i}>{num(v)}</td>
                      ))}
                      <td>
                        <strong>{num(p.value)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {report.roster.length > 12 && (
              <button type="button" className="text-button" onClick={() => setShowAll((s) => !s)}>
                {showAll ? 'Show fewer' : `Show all ${report.roster.length}`}
              </button>
            )}
          </section>

          <TradeCalculator season={report.league.season} league={league!} teamId={teamId!} />

          <div className="dynasty-grid">
            <section className="dynasty-card" aria-labelledby="dynasty-plan-title">
              {plan ? (
                <>
                  <h2 id="dynasty-plan-title">{report.rookies.season} rookie draft plan</h2>
                  <p className="dynasty-note">
                    Pick {plan.slot} in each round, from reverse standings (traded picks aren’t
                    known), assuming the room drafts by value.
                    {plan.need.length
                      ? ` Your starters trail the league at ${plan.need.join(', ')}, so a close call goes that way.`
                      : ''}
                  </p>
                  <ol className="dynasty-plan">
                    {plan.rounds.map((r) => (
                      <li key={r.round}>
                        <span className="dynasty-pick">{r.pick}</span>
                        {r.target ? (
                          <span>
                            <strong>{r.target.name}</strong> {r.target.position}
                            {r.target.nflTeam ? `, ${r.target.nflTeam}` : ''}
                            {r.alternatives.length ? (
                              <small> or {r.alternatives.map((a) => a.name).join(', ')}</small>
                            ) : null}
                          </span>
                        ) : (
                          <span>Best available; the class runs thin here.</span>
                        )}
                      </li>
                    ))}
                  </ol>
                </>
              ) : (
                <>
                  <h2 id="dynasty-plan-title">{report.rookies.nextClass} rookie draft plan</h2>
                  <p className="dynasty-note">
                    The {report.rookies.nextClass} class is set by the NFL draft in late April; the
                    plan appears once those players are in the NFL player file. Until then, use the
                    pick values to price trades and the rookies below as targets.
                  </p>
                </>
              )}
            </section>
            <section className="dynasty-card" aria-labelledby="dynasty-picks-title">
              <h2 id="dynasty-picks-title">What picks are worth</h2>
              <table className="dynasty-table">
                <thead>
                  <tr>
                    <th>Pick</th>
                    <th>Early</th>
                    <th>Middle</th>
                    <th>Late</th>
                  </tr>
                </thead>
                <tbody>
                  {report.picks.flatMap((year) =>
                    year.rounds.map((r) => (
                      <tr key={`${year.season}-${r.round}`}>
                        <td>
                          {year.season} round {r.round}
                        </td>
                        <td>{num(r.early)}</td>
                        <td>{num(r.mid)}</td>
                        <td>{num(r.late)}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </section>
          </div>

          <section className="dynasty-card" aria-labelledby="dynasty-rookies-title">
            <h2 id="dynasty-rookies-title">{report.rookies.season} rookies</h2>
            <div className="dynasty-table-wrap">
              <table className="dynasty-table">
                <thead>
                  <tr>
                    <th>Rookie</th>
                    <th>NFL pick</th>
                    <th>Value</th>
                    <th>Worth</th>
                    <th>Team</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rookies.board.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>
                          <PlayerName id={r.id} name={r.name} />
                        </strong>
                        <small>
                          {r.position}
                          {r.nflTeam ? ` · ${r.nflTeam}` : ''}
                        </small>
                      </td>
                      <td>{r.nflDraftPick ?? 'Undrafted'}</td>
                      <td>{num(r.value)}</td>
                      <td>{r.worthPick}</td>
                      <td>{r.rosteredBy ?? 'Available'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {(report.taxi || report.keepers) && (
            <div className="dynasty-grid">
              {report.taxi && (
                <section className="dynasty-card" aria-labelledby="dynasty-taxi-title">
                  <h2 id="dynasty-taxi-title">
                    Taxi squad ({report.taxi.used} of {report.taxi.slots})
                  </h2>
                  {report.taxi.activate.length > 0 && (
                    <p>
                      <strong>Promote:</strong> {report.taxi.activate.map((p) => p.name).join(', ')}{' '}
                      would beat a replacement starter now.
                    </p>
                  )}
                  {report.taxi.moveToTaxi.length > 0 ? (
                    <p>
                      <strong>Stash:</strong> {report.taxi.moveToTaxi.map((p) => p.name).join(', ')}
                      : eligible, not helping this season, worth keeping for later.
                    </p>
                  ) : (
                    <p className="dynasty-note">No eligible player to move to taxi right now.</p>
                  )}
                </section>
              )}
              {report.keepers && (
                <section className="dynasty-card" aria-labelledby="dynasty-keepers-title">
                  <h2 id="dynasty-keepers-title">Keepers ({report.keepers.keepers})</h2>
                  <p className="dynasty-note">
                    Next season’s value against the cost of keeping, assumed to be the round each
                    player was drafted this year. Check your league’s rule.
                  </p>
                  <ol className="dynasty-plan">
                    {report.keepers.ranked.slice(0, 8).map((k) => (
                      <li
                        key={k.id}
                        className={report.keepers!.suggested.includes(k.id) ? 'suggested' : ''}
                      >
                        <span className="dynasty-pick">{k.position}</span>
                        <span>
                          <strong>{k.name}</strong>{' '}
                          <small>
                            {k.draftRound === undefined
                              ? `next season ${num(k.nextSeason)}, no draft cost recorded`
                              : `round ${k.draftRound}: worth ${num(k.nextSeason)}, costs ${num(k.cost)}`}
                          </small>
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </div>
          )}
          <details className="dynasty-method">
            <summary>How these values work</summary>
            <p>
              Each season’s points come from models fitted on NFL seasons since 2010 and tested on
              later ones: recent points per game, games played and age predict the next three
              seasons, with missed seasons counted as zero. Rookies start from their NFL draft slot
              and shift toward their own games as they play. Picks are priced as the rookie usually
              taken at that spot. A replacement starter is the best player left after every team
              fills its lineup.
            </p>
          </details>
        </>
      )}
    </div>
  );
}
