import { useState } from 'react';
import {
  defaultNotificationPreferences,
  homeCardLabels,
  orderedHomeCards,
  type AITask,
  type LeagueConnection,
  type LineupStrategy,
  type UserPreferences,
} from '@sidekick/core';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useApi } from './hooks/useApi';
import { PlayerPicker } from './PlayerPicker';
import { ErrorNotice } from './ErrorNotice';
import {
  setDisplayPreference,
  useDisplayPreferences,
  type DisplayPreferences,
} from './display-preferences';
import { setTheme, useThemePreference, type ThemePreference } from './theme';

type PlayerList = { players: { id: string; name: string; position: string; nflTeam?: string }[] };
const isPlayerList = (value: unknown): value is PlayerList =>
  typeof value === 'object' &&
  value !== null &&
  Array.isArray((value as PlayerList).players) &&
  (value as PlayerList).players.length <= 5_000 &&
  (value as PlayerList).players.every(
    (p) =>
      typeof p?.id === 'string' && typeof p.name === 'string' && typeof p.position === 'string',
  );

/** Sportsbooks the props board and price checks commonly list; names match case-insensitively. */
export const knownSportsbooks = [
  'DraftKings',
  'FanDuel',
  'BetMGM',
  'Caesars',
  'ESPN BET',
  'BetRivers',
  'Fanatics',
  'bet365',
  'Hard Rock Bet',
  'BetOnline.ag',
  'Bovada',
];

const strategies: { id: LineupStrategy; label: string; detail: string }[] = [
  { id: 'balanced', label: 'Balanced', detail: 'Start the highest projections. The default.' },
  {
    id: 'safe',
    label: 'Safe floor',
    detail: 'Prefer players unlikely to bust when projections are close.',
  },
  {
    id: 'upside',
    label: 'Chase upside',
    detail: 'Prefer boom potential when projections are close.',
  },
  {
    id: 'win-chance',
    label: 'Maximize win chance',
    detail:
      'Play it safe when favored and chase upside as the underdog, using this week’s matchup.',
  },
];

function Choice<T extends string>({
  name,
  legend,
  value,
  options,
  onChange,
}: {
  name: string;
  legend: string;
  value: T;
  options: { id: T; label: string; detail?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="personalize-choice">
      <legend>{legend}</legend>
      {options.map((option) => (
        <label key={option.id}>
          <input
            type="radio"
            name={name}
            value={option.id}
            checked={value === option.id}
            onChange={() => onChange(option.id)}
          />
          <span>
            <strong>{option.label}</strong>
            {option.detail && <small>{option.detail}</small>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function Select<K extends keyof DisplayPreferences>({
  label,
  field,
  options,
}: {
  label: string;
  field: K;
  options: [DisplayPreferences[K], string][];
}) {
  const display = useDisplayPreferences();
  return (
    <label>
      {label}
      <select
        value={display[field]}
        onChange={(event) =>
          setDisplayPreference(field, event.target.value as DisplayPreferences[K])
        }
      >
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Device appearance; applies at once and is kept on this computer only. */
export function AppearanceSettings() {
  const theme = useThemePreference();
  return (
    <fieldset className="appearance-settings" data-search-target="appearance" tabIndex={-1}>
      <legend>Appearance and display</legend>
      <p>These apply right away on this computer.</p>
      <div className="theme-options">
        {(
          [
            ['light', 'Light'],
            ['dark', 'Dark'],
            ['system', 'Match system'],
          ] as [ThemePreference, string][]
        ).map(([value, label]) => (
          <label key={value}>
            <input
              type="radio"
              name="appearance"
              value={value}
              checked={theme === value}
              onChange={() => setTheme(value)}
            />{' '}
            {label}
          </label>
        ))}
      </div>
      <div className="personalize-grid">
        <Select
          label="Text size"
          field="textSize"
          options={[
            ['small', 'Small'],
            ['default', 'Default'],
            ['large', 'Large'],
            ['larger', 'Larger'],
          ]}
        />
        <Select
          label="Density"
          field="density"
          options={[
            ['comfortable', 'Comfortable'],
            ['compact', 'Compact'],
          ]}
        />
        <Select
          label="Motion"
          field="motion"
          options={[
            ['system', 'Follow system'],
            ['reduced', 'Reduce motion'],
          ]}
        />
        <Select
          label="Open the app on"
          field="startPage"
          options={[
            ['League desk', 'Home'],
            ['Advice', 'Advice'],
            ['Live', 'Live'],
            ['Ask', 'Ask'],
            ['Reports', 'Reports'],
          ]}
        />
        <Select
          label="Odds format"
          field="oddsFormat"
          options={[
            ['american', 'American (+120)'],
            ['decimal', 'Decimal (2.20)'],
            ['implied', 'Implied chance (45.5%)'],
          ]}
        />
        <Select
          label="Clock"
          field="clock"
          options={[
            ['system', 'Follow system'],
            ['12h', '12-hour'],
            ['24h', '24-hour'],
          ]}
        />
      </div>
    </fieldset>
  );
}

/**
 * A percent field that lets the owner type freely ("-", "-2", "-20") and saves on blur or Enter:
 * whole numbers from -50 to 50 other than 0; anything else returns to the last saved value.
 */
function NudgeInput({ value, onCommit }: { value: number; onCommit: (percent: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const commit = () => {
    const percent = Number(draft);
    if (Number.isInteger(percent) && percent !== 0 && Math.abs(percent) <= 50) {
      if (percent !== value) onCommit(percent);
      setDraft(String(percent));
    } else setDraft(String(value));
  };
  return (
    <input
      type="text"
      inputMode="numeric"
      value={draft}
      onChange={(event) => setDraft(event.target.value.slice(0, 4))}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        }
      }}
    />
  );
}

/** League-scoped player list with add (via the league's player pool) and remove. */
function PlayerList({
  leagues,
  title,
  hint,
  items,
  onAdd,
  render,
  searchTarget,
}: {
  leagues: LeagueConnection[];
  title: string;
  hint: string;
  items: { leagueId: string; playerId: string; name: string }[];
  onAdd: (player: { leagueId: string; playerId: string; name: string }) => void;
  render: (item: { leagueId: string; playerId: string; name: string }) => React.ReactNode;
  searchTarget: string;
}) {
  const [leagueId, setLeagueId] = useState(leagues[0]?.id ?? '');
  const {
    data: options,
    error,
    reload,
  } = useApi(
    leagueId ? `/api/advice/players?${new URLSearchParams({ league: leagueId })}` : undefined,
    isPlayerList,
    { timeoutMs: 60_000 },
  );
  return (
    <section className="personalize-block" data-search-target={searchTarget} tabIndex={-1}>
      <h3>{title}</h3>
      <p className="schedule-explainer">{hint}</p>
      {items.length ? (
        <ul className="personalize-players">
          {items.map((item) => (
            <li key={`${item.leagueId}:${item.playerId}`}>{render(item)}</li>
          ))}
        </ul>
      ) : (
        <p>None yet.</p>
      )}
      {leagues.length > 1 && (
        <label>
          League
          <select value={leagueId} onChange={(event) => setLeagueId(event.target.value)}>
            {leagues.map((league) => (
              <option key={league.id} value={league.id}>
                {league.displayName}
              </option>
            ))}
          </select>
        </label>
      )}
      {error ? (
        <ErrorNotice error={error} onRetry={reload} compact />
      ) : (
        <PlayerPicker
          label={`Add a player to ${title.toLowerCase()}`}
          players={options?.players ?? []}
          selected={[]}
          maximum={1}
          onChange={(ids) => {
            const player = options?.players.find((p) => p.id === ids[0]);
            if (player && leagueId) onAdd({ leagueId, playerId: player.id, name: player.name });
          }}
        />
      )}
    </section>
  );
}

/** Saved preferences: Home layout, notifications, lineups and projections, props, AI style. */
export function PersonalizeSection({
  preferences,
  leagues,
  onChange,
}: {
  preferences: UserPreferences;
  leagues: LeagueConnection[];
  onChange: (next: UserPreferences) => void;
}) {
  const set = <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) =>
    onChange({ ...preferences, [key]: value });
  const cards = orderedHomeCards(preferences);
  const notifications = { ...defaultNotificationPreferences, ...preferences.notifications };
  const ai = preferences.ai ?? {};
  const props = preferences.props ?? {};
  const books = props.sportsbooks ?? [];
  const leagueName = (id: string) => leagues.find((l) => l.id === id)?.displayName ?? 'League';
  const moveCard = (index: number, step: number) => {
    const next = [...cards];
    const [card] = next.splice(index, 1);
    next.splice(index + step, 0, card!);
    set('homeCards', next);
  };
  return (
    <div className="personalize">
      <AppearanceSettings />

      <section className="personalize-block" data-search-target="home-layout" tabIndex={-1}>
        <h3>Home layout</h3>
        <p className="schedule-explainer">Show, hide and reorder the cards on Home.</p>
        <ol className="personalize-cards">
          {cards.map((card, index) => (
            <li key={card.id}>
              <label>
                <input
                  type="checkbox"
                  checked={card.visible}
                  onChange={(event) =>
                    set(
                      'homeCards',
                      cards.map((c) =>
                        c.id === card.id ? { ...c, visible: event.target.checked } : c,
                      ),
                    )
                  }
                />{' '}
                {homeCardLabels[card.id]}
              </label>
              <span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Move ${homeCardLabels[card.id]} up`}
                  disabled={index === 0}
                  onClick={() => moveCard(index, -1)}
                >
                  <ArrowUp size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Move ${homeCardLabels[card.id]} down`}
                  disabled={index === cards.length - 1}
                  onClick={() => moveCard(index, 1)}
                >
                  <ArrowDown size={14} aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section
        className="personalize-block"
        data-search-target="notification-preferences"
        tabIndex={-1}
      >
        <h3>Notifications</h3>
        <p className="schedule-explainer">Desktop notifications while the app is running.</p>
        <div className="personalize-checks">
          {(
            [
              ['out', 'A starter is out'],
              ['inactive', 'A starter is inactive on game day'],
              ['doubtful', 'A starter is doubtful'],
              ['bye', 'A starter is on bye'],
              ['stale', 'An imported league is out of date'],
              ['watchlist', 'A watched player is ruled out'],
              ['gameDaySummary', 'Game-day summary before your first kickoff'],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={notifications[key]}
                onChange={(event) =>
                  set('notifications', {
                    ...preferences.notifications,
                    [key]: event.target.checked,
                  })
                }
              />{' '}
              {label}
            </label>
          ))}
        </div>
        <div className="personalize-grid">
          <label>
            Warn about starters
            <select
              value={notifications.leadHours}
              onChange={(event) =>
                set('notifications', {
                  ...preferences.notifications,
                  leadHours: Number(event.target.value) as 2 | 6 | 24,
                })
              }
            >
              <option value={24}>Up to a day before kickoff</option>
              <option value={6}>Up to 6 hours before</option>
              <option value={2}>Up to 2 hours before</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={Boolean(notifications.quietStart)}
              onChange={(event) => {
                const {
                  quietStart: _start,
                  quietEnd: _end,
                  ...rest
                } = preferences.notifications ?? {};
                void _start;
                void _end;
                set(
                  'notifications',
                  event.target.checked ? { ...rest, quietStart: '23:00', quietEnd: '08:00' } : rest,
                );
              }}
            />{' '}
            Quiet hours
          </label>
          {notifications.quietStart && (
            <>
              <label>
                From
                <input
                  type="time"
                  value={notifications.quietStart}
                  onChange={(event) =>
                    event.target.value &&
                    set('notifications', {
                      ...preferences.notifications,
                      quietStart: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Until
                <input
                  type="time"
                  value={notifications.quietEnd}
                  onChange={(event) =>
                    event.target.value &&
                    set('notifications', {
                      ...preferences.notifications,
                      quietEnd: event.target.value,
                    })
                  }
                />
              </label>
            </>
          )}
        </div>
        {notifications.quietStart && (
          <small>
            Alerts that come due in quiet hours wait until they end, unless the game has started by
            then.
          </small>
        )}
      </section>

      <section className="personalize-block" data-search-target="lineup-strategy" tabIndex={-1}>
        <Choice
          name="lineup-strategy"
          legend="Lineup strategy"
          value={preferences.lineupStrategy ?? 'balanced'}
          options={strategies}
          onChange={(value) => set('lineupStrategy', value)}
        />
        <small>
          Projections stay the same; only which close calls get the start changes. Locked starters
          never move.
        </small>
      </section>

      <section
        className="personalize-block"
        data-search-target="projection-preferences"
        tabIndex={-1}
      >
        <h3>Projection adjustments</h3>
        <div className="personalize-checks">
          <label>
            <input
              type="checkbox"
              checked={preferences.projectionAdjustments?.wind !== false}
              onChange={(event) =>
                set('projectionAdjustments', {
                  ...preferences.projectionAdjustments,
                  wind: event.target.checked,
                })
              }
            />{' '}
            Lower offense and kickers in strong forecast wind
          </label>
          <label>
            <input
              type="checkbox"
              checked={preferences.projectionAdjustments?.vacatedCarries !== false}
              onChange={(event) =>
                set('projectionAdjustments', {
                  ...preferences.projectionAdjustments,
                  vacatedCarries: event.target.checked,
                })
              }
            />{' '}
            Give running backs carries when a teammate back is ruled out
          </label>
        </div>
      </section>

      {leagues.length > 0 && (
        <PlayerList
          leagues={leagues}
          title="Player nudges"
          hint="Your own take on a player: raise or lower the app’s projection by up to 50%. Shown wherever the projection appears."
          searchTarget="player-nudges"
          items={preferences.playerNudges ?? []}
          onAdd={(player) => {
            if (
              (preferences.playerNudges ?? []).some(
                (n) => n.leagueId === player.leagueId && n.playerId === player.playerId,
              )
            )
              return;
            set('playerNudges', [...(preferences.playerNudges ?? []), { ...player, percent: 10 }]);
          }}
          render={(item) => {
            const nudge = preferences.playerNudges!.find(
              (n) => n.leagueId === item.leagueId && n.playerId === item.playerId,
            )!;
            return (
              <>
                <span>
                  {item.name} <small>· {leagueName(item.leagueId)}</small>
                </span>
                <label>
                  <span className="visually-hidden">Nudge for {item.name} in percent</span>
                  <NudgeInput
                    value={nudge.percent}
                    onCommit={(percent) =>
                      set(
                        'playerNudges',
                        preferences.playerNudges!.map((n) => (n === nudge ? { ...n, percent } : n)),
                      )
                    }
                  />
                  %
                </label>
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    set(
                      'playerNudges',
                      preferences.playerNudges!.filter((n) => n !== nudge),
                    )
                  }
                >
                  Remove
                </button>
              </>
            );
          }}
        />
      )}

      {leagues.length > 0 && (
        <PlayerList
          leagues={leagues}
          title="Watchlist"
          hint="Players to keep an eye on, rostered or not. They appear on Home, and you can be alerted when one is ruled out."
          searchTarget="watchlist"
          items={preferences.watchlist ?? []}
          onAdd={(player) => {
            if (
              (preferences.watchlist ?? []).some(
                (p) => p.leagueId === player.leagueId && p.playerId === player.playerId,
              )
            )
              return;
            set('watchlist', [...(preferences.watchlist ?? []), player]);
          }}
          render={(item) => (
            <>
              <span>
                {item.name} <small>· {leagueName(item.leagueId)}</small>
              </span>
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  set(
                    'watchlist',
                    preferences.watchlist!.filter(
                      (p) => !(p.leagueId === item.leagueId && p.playerId === item.playerId),
                    ),
                  )
                }
              >
                Remove
              </button>
            </>
          )}
        />
      )}

      <section className="personalize-block" data-search-target="prop-preferences" tabIndex={-1}>
        <h3>Props and sportsbooks</h3>
        <label>
          Minimum edge before a prop lean is shown (percentage points over break-even)
          <input
            type="number"
            min={0}
            max={20}
            step={0.5}
            value={props.minEdgePoints ?? 0}
            onChange={(event) =>
              set('props', {
                ...props,
                minEdgePoints: Math.max(0, Math.min(20, Number(event.target.value) || 0)),
              })
            }
          />
        </label>
        <fieldset className="personalize-checks">
          <legend>Sportsbooks to show (none checked shows all)</legend>
          {knownSportsbooks.map((book) => (
            <label key={book}>
              <input
                type="checkbox"
                checked={books.includes(book)}
                onChange={(event) =>
                  set('props', {
                    ...props,
                    sportsbooks: event.target.checked
                      ? [...books, book]
                      : books.filter((b) => b !== book),
                  })
                }
              />{' '}
              {book}
            </label>
          ))}
        </fieldset>
        <label>
          <input
            type="checkbox"
            checked={props.lineCapture !== false}
            onChange={(event) => set('props', { ...props, lineCapture: event.target.checked })}
          />{' '}
          Save prop lines in the background (used to check the prop model later)
        </label>
      </section>

      <section className="personalize-block" data-search-target="ai-style" tabIndex={-1}>
        <Choice
          name="ai-tone"
          legend="Ask and advice tone"
          value={ai.tone ?? 'friendly'}
          options={[
            { id: 'straight', label: 'Straight', detail: 'Just the call and the reason.' },
            { id: 'friendly', label: 'Friendly', detail: 'Plain and encouraging. The default.' },
            { id: 'playful', label: 'Playful', detail: 'A little trash talk, same numbers.' },
          ]}
          onChange={(tone) => set('ai', { ...ai, tone })}
        />
        <Choice
          name="ai-length"
          legend="Answer length"
          value={ai.length ?? 'standard'}
          options={[
            { id: 'brief', label: 'Brief' },
            { id: 'standard', label: 'Standard' },
            { id: 'detailed', label: 'Detailed' },
          ]}
          onChange={(length) => set('ai', { ...ai, length })}
        />
        <fieldset className="personalize-grid">
          <legend>Model per task (API connections only; blank uses the connection’s model)</legend>
          {(
            [
              ['chat', 'Ask'],
              ['advice', 'Advice analysis'],
              ['reports', 'Reports'],
            ] as [AITask, string][]
          ).map(([task, label]) => (
            <label key={task}>
              {label}
              <input
                type="text"
                maxLength={120}
                placeholder="Connection default"
                value={ai.models?.[task] ?? ''}
                onChange={(event) => {
                  const value = event.target.value.trim();
                  const { [task]: _drop, ...others } = ai.models ?? {};
                  void _drop;
                  set('ai', { ...ai, models: value ? { ...others, [task]: value } : others });
                }}
              />
            </label>
          ))}
        </fieldset>
      </section>
    </div>
  );
}
