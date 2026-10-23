import { useState } from 'react';
import {
  isPropLine,
  playerNameKey,
  type AdviceOptions,
  type FootballStatKey,
  type PropLine,
} from '@sidekick/core';
import { useApi } from './hooks/useApi';
import { LoadingStatus } from './LoadFeedback';

export type PropPick = {
  playerId: string;
  stat: FootballStatKey;
  line: number;
  side: 'over' | 'under';
  odds?: number;
  oppositeOdds?: number;
};

type Snapshot = { lines: PropLine[]; priced: boolean; warnings: string[] };
const isSnapshot = (value: unknown): value is Snapshot => {
  const v = value as Snapshot;
  return (
    !!v &&
    Array.isArray(v.lines) &&
    v.lines.length <= 5000 &&
    v.lines.every(isPropLine) &&
    typeof v.priced === 'boolean' &&
    Array.isArray(v.warnings) &&
    v.warnings.every((w) => typeof w === 'string')
  );
};
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** Published prop lines for the chosen game; picking one fills player, stat, line and price. */
export function PublishedProps({
  game,
  season,
  players,
  statLabels,
  disabled,
  onPick,
}: {
  game: AdviceOptions['games'][number] | undefined;
  season: number;
  players: AdviceOptions['players'];
  statLabels: Record<string, string>;
  disabled: boolean;
  onPick: (pick: PropPick) => void;
}) {
  const {
    data: snapshot,
    error,
    loading,
  } = useApi(
    game
      ? `/api/advice/props?${new URLSearchParams({ game: game.id, season: String(season) })}`
      : undefined,
    isSnapshot,
    {
      timeoutMs: 60_000,
      errorMessage: 'Prop lines could not be loaded. Try again later or enter the prop below.',
    },
  );
  const [query, setQuery] = useState('');
  const [statFilter, setStatFilter] = useState('');
  // Lines name players as the sportsbook spells them; only an exact, unique name match is used.
  const byName = new Map<string, string[]>();
  for (const player of players) {
    const key = playerNameKey(player.name);
    byName.set(key, [...(byName.get(key) ?? []), player.id]);
  }
  const playerId = (name: string) => {
    const ids = byName.get(playerNameKey(name));
    return ids?.length === 1 ? ids[0] : undefined;
  };
  const needle = query.trim().toLowerCase();
  const rows = (snapshot?.lines ?? [])
    .filter(
      (row) =>
        (!needle || row.playerName.toLowerCase().includes(needle)) &&
        (!statFilter || row.stat === statFilter),
    )
    .sort((a, b) => a.playerName.localeCompare(b.playerName) || a.stat.localeCompare(b.stat));
  const stats = [...new Set(snapshot?.lines.map((row) => row.stat) ?? [])];
  return (
    <section className="published-props" aria-label="Published player props">
      <h3>Pick a published prop</h3>
      {!game && <p>Choose an upcoming NFL game first.</p>}
      {loading && <LoadingStatus message="Loading prop lines…" shape="rows" />}
      {error && <p role="alert">{error}</p>}
      {snapshot && (
        <>
          <p className="published-props-note">
            {snapshot.priced
              ? 'Prices from The Odds API. Prices can change before you act.'
              : 'Lines from ESPN, which doesn’t publish prop prices. After picking, enter your sportsbook’s price or use the typical −110.'}
          </p>
          {snapshot.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
          {snapshot.lines.length > 0 && (
            <div className="published-props-filters">
              <label>
                Player
                <input
                  type="search"
                  value={query}
                  maxLength={60}
                  placeholder="Search players"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <label>
                Statistic
                <select value={statFilter} onChange={(event) => setStatFilter(event.target.value)}>
                  <option value="">All statistics</option>
                  {stats.map((stat) => (
                    <option key={stat} value={stat}>
                      {statLabels[stat] ?? stat}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {snapshot.lines.length === 0 ? (
            <p>No player props are published for this game yet. Enter the prop below.</p>
          ) : (
            <div className="published-props-table">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Player</th>
                    <th scope="col">Statistic</th>
                    <th scope="col">Line</th>
                    <th scope="col">Book</th>
                    <th scope="col">
                      <span className="visually-hidden">Pick a side</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 200).map((row) => {
                    const id = playerId(row.playerName);
                    const label = `${row.playerName} ${statLabels[row.stat] ?? row.stat} ${row.line}`;
                    return (
                      <tr key={row.id}>
                        <th scope="row">{row.playerName}</th>
                        <td>{statLabels[row.stat] ?? row.stat}</td>
                        <td>{row.line}</td>
                        <td>{row.sportsbook}</td>
                        <td className="published-props-pick">
                          {(['over', 'under'] as const).map((side) => {
                            const odds = side === 'over' ? row.overOdds : row.underOdds,
                              opposite = side === 'over' ? row.underOdds : row.overOdds;
                            return (
                              <button
                                key={side}
                                type="button"
                                className="small-button"
                                disabled={disabled || !id}
                                aria-label={`${side === 'over' ? 'Over' : 'Under'} ${label}`}
                                onClick={() =>
                                  id &&
                                  onPick({
                                    playerId: id,
                                    stat: row.stat,
                                    line: row.line,
                                    side,
                                    ...(odds !== undefined ? { odds } : {}),
                                    ...(opposite !== undefined ? { oppositeOdds: opposite } : {}),
                                  })
                                }
                              >
                                {side === 'over' ? 'Over' : 'Under'}
                                {odds !== undefined ? ` ${signed(odds)}` : ''}
                              </button>
                            );
                          })}
                          {!id && <small>Player not in this game’s list</small>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {rows.length > 200 && <p>Showing 200 of {rows.length}. Search to narrow.</p>}
            </div>
          )}
        </>
      )}
    </section>
  );
}
