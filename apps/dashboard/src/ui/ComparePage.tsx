import { useState } from 'react';
import { record, type LeagueConnection } from '@sidekick/core';
import { requestJson } from './api-client';
import { useApi } from './hooks/useApi';
import { PlayerPicker } from './PlayerPicker';
import { PlayerName } from './PlayerCard';
import { ErrorNotice } from './ErrorNotice';
import { formatDateTime } from './date-format';
import './compare.css';

type Row = {
  id: string;
  name: string;
  position: string;
  nflTeam?: string;
  status?: string;
  projected?: number;
  expected?: number;
  playChance?: number;
  range?: { low: number; high: number };
  matchup?: { opponent: string; home: boolean; date: string };
  windLossPercent?: number;
  winChance?: number;
  started: boolean;
  inLineup: boolean;
};
type Comparison = {
  week: number;
  slots: number;
  players: Row[];
  recommended?: string;
  note?: string;
};
const isComparison = (x: unknown): x is Comparison =>
  record(x) && Array.isArray(x.players) && typeof x.week === 'number';
type Pool = { players: { id: string; name: string; position: string; nflTeam?: string }[] };
const isPool = (x: unknown): x is Pool => record(x) && Array.isArray(x.players);

const num = (n: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(n);

/** Start/sit: two to four players side by side, decided by this week's win chance. No AI. */
export function ComparePage({
  league,
  teamId,
  onChooseTeam,
}: {
  league: LeagueConnection | undefined;
  teamId: string | undefined;
  onChooseTeam: (id: string) => void;
}) {
  const { data: pool } = useApi(
    league ? `/api/advice/players?${new URLSearchParams({ league: league.id })}` : undefined,
    isPool,
    { timeoutMs: 60_000 },
  );
  const [chosen, setChosen] = useState<string[]>([]);
  const [result, setResult] = useState<Comparison>();
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const roster = league?.teams.find((t) => t.id === teamId)?.roster ?? [];
  const mine = new Set(roster.map((p) => p.id));
  const players = [
    ...roster.map((p) => ({
      id: p.id,
      name: p.name,
      position: p.position ?? '',
      ...(p.nflTeam ? { nflTeam: p.nflTeam } : {}),
      teamId: teamId!,
    })),
    ...(pool?.players ?? []).filter((p) => !mine.has(p.id)),
  ];
  async function compare(ids: string[]) {
    if (!league || !teamId) return;
    setBusy(true);
    setError(undefined);
    try {
      setResult(
        await requestJson(
          '/api/players/compare',
          isComparison,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ league: league.id, team: teamId, players: ids }),
          },
          60_000,
        ),
      );
    } catch (failure) {
      setError(failure);
      setResult(undefined);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="compare-page">
      <div className="page-title-block">
        <div>
          <p className="section-overline">START / SIT</p>
          <h1>Compare players</h1>
          <p>
            Two to four players side by side: projection, likely range, chance to play and your win
            chance with each one in the lineup. Instant, no AI.
          </p>
        </div>
      </div>
      {!league ? (
        <p className="empty-activity">Connect a league to compare players.</p>
      ) : !teamId ? (
        <label className="compare-team">
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
      ) : (
        <section className="compare-pick" aria-label="Players to compare">
          <PlayerPicker
            label="Players"
            hint="Your roster first, then anyone in the league’s player pool."
            players={players}
            selected={chosen}
            maximum={4}
            onChange={setChosen}
          />
          <button
            type="button"
            className="primary-button"
            disabled={chosen.length < 2 || busy}
            onClick={() => void compare(chosen)}
          >
            {busy ? 'Comparing…' : 'Compare'}
          </button>
        </section>
      )}
      {error !== undefined && <ErrorNotice error={error} />}
      {result && (
        <section className="compare-result" aria-label="Comparison">
          {result.recommended && (
            <p className="compare-verdict">
              Start <strong>{result.players.find((p) => p.id === result.recommended)?.name}</strong>
              {result.players.some((p) => p.winChance !== undefined)
                ? ' for the best chance to win this week.'
                : ' for the most expected points.'}
            </p>
          )}
          {result.note && <p className="compare-note">{result.note}</p>}
          <div className="compare-grid">
            {result.players.map((p) => (
              <article
                key={p.id}
                className={p.id === result.recommended ? 'compare-card best' : 'compare-card'}
              >
                <h2>
                  <PlayerName id={p.id} name={p.name} />
                </h2>
                <p className="compare-sub">
                  {p.position}
                  {p.nflTeam ? ` · ${p.nflTeam}` : ''}
                  {p.inLineup ? ' · in your lineup' : ''}
                  {p.status ? ` · ${p.status}` : ''}
                </p>
                <strong className="compare-points">
                  {p.started ? 'Played' : p.projected !== undefined ? num(p.projected) : '—'}
                </strong>
                <dl>
                  {p.range && (
                    <div>
                      <dt>Likely range</dt>
                      <dd>
                        {num(p.range.low)}–{num(p.range.high)}
                      </dd>
                    </div>
                  )}
                  {p.playChance !== undefined && (
                    <div>
                      <dt>Chance to play</dt>
                      <dd>{Math.round(p.playChance * 100)}%</dd>
                    </div>
                  )}
                  {p.matchup && (
                    <div>
                      <dt>Game</dt>
                      <dd>
                        {p.matchup.home ? 'vs' : 'at'} {p.matchup.opponent} ·{' '}
                        {formatDateTime(p.matchup.date)}
                      </dd>
                    </div>
                  )}
                  {p.windLossPercent ? (
                    <div>
                      <dt>Wind</dt>
                      <dd>−{p.windLossPercent}%</dd>
                    </div>
                  ) : null}
                  {p.winChance !== undefined && (
                    <div>
                      <dt>Win chance if he starts</dt>
                      <dd>{Math.round(p.winChance * 100)}%</dd>
                    </div>
                  )}
                </dl>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
