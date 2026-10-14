import { useEffect, useRef, useState } from 'react';
import {
  isSportsbookSnapshot,
  type FootballGame,
  type BetTerms,
  type SportsbookQuote,
  type SportsbookSnapshot,
} from '@sidekick/core';
import { requestJson } from './api-client';
import { formatDateTime } from './date-format';
const odds = (n: number) => (n > 0 ? `+${n}` : String(n));
export function LiveSportsbookPrices({
  game,
  season,
  kind,
  side,
  selected,
  onSelect,
  disabled,
}: {
  game: FootballGame | undefined;
  season: number;
  kind: BetTerms['kind'];
  side: BetTerms['side'];
  selected: SportsbookQuote | undefined;
  onSelect: (quote: SportsbookQuote) => void;
  disabled: boolean;
}) {
  const [snapshot, setSnapshot] = useState<SportsbookSnapshot | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    active.current?.abort();
    setSnapshot(null);
    setError('');
    setBusy(false);
    return () => active.current?.abort();
  }, [game?.id]);
  async function load() {
    if (!game || busy) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError('');
    try {
      const x = await requestJson(
        `/api/advice/odds?${new URLSearchParams({ game: game.id, season: String(season) })}`,
        isSportsbookSnapshot,
        { signal: controller.signal },
        30000,
      );
      if (!controller.signal.aborted) setSnapshot(x);
    } catch {
      if (!controller.signal.aborted) {
        setSnapshot(null);
        setError('Prices could not be checked. Try again or enter a price from your sportsbook.');
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  const choices = snapshot?.quotes.filter((q) => q.kind === kind && q.side === side) ?? [];
  return (
    <section className="advice-live-prices" aria-label="Live sportsbook prices">
      <h3>Get sportsbook prices</h3>
      <p>
        Fetch current pregame moneylines, spreads and totals displayed by ESPN. Player props can be
        entered below.
      </p>
      <button
        type="button"
        className="small-button"
        disabled={!game || busy || disabled || kind === 'player-prop'}
        onClick={() => void load()}
      >
        {busy
          ? 'Checking prices…'
          : snapshot
            ? 'Refresh sportsbook prices'
            : 'Fetch sportsbook prices'}
      </button>
      {!game && <p>Choose an upcoming NFL game first.</p>}
      {kind === 'player-prop' && (
        <p>
          This public feed does not provide verified player-prop prices. Enter the line and odds
          offered by your sportsbook.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {snapshot && (
        <>
          <p>Checked {snapshot.observedAt ? formatDateTime(snapshot.observedAt) : 'just now'}.</p>
          {snapshot.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
          {choices.length ? (
            <ul>
              {choices.map((q) => (
                <li key={q.id}>
                  <strong>{q.sportsbook}</strong> ·{' '}
                  {q.side === 'home'
                    ? game?.home
                    : q.side === 'away'
                      ? game?.away
                      : q.side === 'over'
                        ? 'Over'
                        : 'Under'}{' '}
                  {q.line === undefined ? 'moneyline' : q.kind === 'spread' ? odds(q.line) : q.line}{' '}
                  · odds {odds(q.americanOdds)}{' '}
                  <button
                    type="button"
                    className="small-button"
                    disabled={disabled}
                    onClick={() => onSelect(q)}
                  >
                    {selected?.id === q.id ? 'Price selected' : 'Use this price'}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p>No verified prices match this bet type and side. You can enter a price manually.</p>
          )}
        </>
      )}
      {selected && (
        <p role="status">
          Using {selected.sportsbook} via ESPN, fetched {formatDateTime(selected.observedAt)}.
          Editing the line or odds switches to manual entry. Prices can change before you act.
        </p>
      )}
    </section>
  );
}
