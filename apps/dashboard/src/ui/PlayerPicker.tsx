import { useId, useState } from 'react';
import type { AdviceOptions } from '@sidekick/core';

export function PlayerPicker({
  label,
  hint,
  players,
  selected,
  maximum = 20,
  onChange,
}: {
  label: string;
  hint?: string;
  players: AdviceOptions['players'];
  selected: string[];
  maximum?: number;
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const id = useId();
  const names = new Map(players.map((player) => [player.id, player]));
  const normalized = query
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  const matches = players
    .filter((player) =>
      `${player.name} ${player.position} ${player.nflTeam ?? ''}`
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .includes(normalized),
    )
    .slice(0, 8);
  return (
    <div className="advice-picker">
      <label htmlFor={id}>
        {label}
        <input
          id={id}
          type="search"
          value={query}
          maxLength={120}
          placeholder="Search by name, position, or NFL team"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {hint && <p>{hint}</p>}
      {!!selected.length && (
        <ul className="advice-selected">
          {selected.map((key) => (
            <li key={key}>
              <span>{names.get(key)?.name ?? 'Unavailable player'}</span>
              <button
                type="button"
                aria-label={`Remove ${names.get(key)?.name ?? 'player'}`}
                onClick={() => onChange(selected.filter((item) => item !== key))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="advice-player-choices" role="group" aria-label={`${label} choices`}>
        {matches.map((player) => (
          <label key={player.id}>
            <input
              type="checkbox"
              checked={selected.includes(player.id)}
              disabled={!selected.includes(player.id) && selected.length >= maximum}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? maximum === 1
                      ? [player.id]
                      : [...selected, player.id]
                    : selected.filter((item) => item !== player.id),
                )
              }
            />
            <span>
              {player.name}
              <small>
                {player.position}
                {player.nflTeam ? ` · ${player.nflTeam}` : ''}
              </small>
            </span>
          </label>
        ))}
      </div>
      <p role="status">
        {matches.length
          ? `Showing ${matches.length} matches · ${selected.length} selected`
          : 'No matching players in this snapshot.'}
      </p>
    </div>
  );
}
