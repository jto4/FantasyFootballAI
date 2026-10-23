import { useEffect, useRef, useState } from 'react';
import {
  fairAmericanOdds,
  noVigProbability,
  isSportsbookSnapshot,
  type BookLine,
  type FootballGame,
  type BetTerms,
  type SportsbookQuote,
  type SportsbookSnapshot,
} from '@sidekick/core';
import { requestJson } from './api-client';
import { formatDateTime } from './date-format';
import { ErrorNotice } from './ErrorNotice';
const odds = (n: number) => (n > 0 ? `+${n}` : String(n));
export function LiveSportsbookPrices({
  game,
  season,
  kind,
  side,
  selected,
  onSelect,
  onUsePrice,
  disabled,
}: {
  game: FootballGame | undefined;
  season: number;
  kind: BetTerms['kind'];
  side: BetTerms['side'];
  selected: SportsbookQuote | undefined;
  onSelect: (quote: SportsbookQuote) => void;
  /** Fills line and odds from another book's price; such prices aren't ESPN-verified quotes. */
  onUsePrice?: (price: { line?: number; odds: number; oppositeOdds?: number }) => void;
  disabled: boolean;
}) {
  const [books, setBooks] = useState<{ lines: BookLine[]; warnings: string[] } | null>(null);
  const [snapshot, setSnapshot] = useState<SportsbookSnapshot | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    active.current?.abort();
    setSnapshot(null);
    setBooks(null);
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
      // Other books are optional; a failure here leaves the ESPN prices usable.
      const other = await requestJson(
        `/api/advice/books?${new URLSearchParams({ game: game.id, season: String(season) })}`,
        isBookSnapshot,
        { signal: controller.signal },
        30000,
      ).catch(() => null);
      if (!controller.signal.aborted) setBooks(other);
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
        Fetch current pregame moneylines, spreads and totals displayed by ESPN. Player props have
        their own list.
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
      {error && <ErrorNotice error={error} />}
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
      {snapshot && books && kind !== 'player-prop' && (
        <BookComparison books={books} kind={kind} side={side} onUsePrice={onUsePrice} />
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

const isBookSnapshot = (value: unknown): value is { lines: BookLine[]; warnings: string[] } => {
  const v = value as { lines: BookLine[]; warnings: string[] };
  return (
    !!v &&
    Array.isArray(v.lines) &&
    v.lines.length <= 2000 &&
    v.lines.every(
      (row) =>
        typeof row.sportsbook === 'string' &&
        ['moneyline', 'spread', 'total'].includes(row.kind) &&
        ['home', 'away', 'over', 'under'].includes(row.side) &&
        Number.isInteger(row.americanOdds) &&
        Math.abs(row.americanOdds) >= 100 &&
        (row.line === undefined || Number.isFinite(row.line)),
    ) &&
    Array.isArray(v.warnings)
  );
};
const opposite = { home: 'away', away: 'home', over: 'under', under: 'over' } as const;

/**
 * Price checker: each book's price for this side, its margin-free fair price from that book's
 * own two-way market, and how the price compares with the consensus fair price.
 */
function BookComparison({
  books,
  kind,
  side,
  onUsePrice,
}: {
  books: { lines: BookLine[]; warnings: string[] };
  kind: Exclude<BetTerms['kind'], 'player-prop'>;
  side: BetTerms['side'];
  onUsePrice?:
    ((price: { line?: number; odds: number; oppositeOdds?: number }) => void) | undefined;
}) {
  const rows = books.lines
    .filter((row) => row.kind === kind && row.side === side)
    .map((row) => {
      const other = books.lines.find(
        (o) =>
          o.sportsbook === row.sportsbook &&
          o.kind === kind &&
          o.side === opposite[side] &&
          (kind !== 'spread' || o.line === -(row.line ?? NaN)) &&
          (kind !== 'total' || o.line === row.line),
      );
      return {
        row,
        other,
        fair: other ? noVigProbability(row.americanOdds, other.americanOdds) : undefined,
      };
    });
  const fairs = rows.flatMap((r) => (r.fair === undefined ? [] : [r.fair]));
  const consensus = fairs.length ? fairs.reduce((a, b) => a + b, 0) / fairs.length : undefined;
  const best = Math.max(...rows.map((r) => r.row.americanOdds));
  if (!rows.length)
    return (
      <div className="book-comparison">
        {books.warnings.map((w) => (
          <p key={w}>{w}</p>
        ))}
      </div>
    );
  return (
    <div className="book-comparison">
      <h4>Compare sportsbooks</h4>
      {consensus !== undefined && (
        <p>
          Fair price across books, with the bookmakers’ margin removed:{' '}
          <strong>{odds(fairAmericanOdds(consensus))}</strong> ({(consensus * 100).toFixed(1)}%).
        </p>
      )}
      <table>
        <thead>
          <tr>
            <th scope="col">Sportsbook</th>
            {kind !== 'moneyline' && <th scope="col">Line</th>}
            <th scope="col">Price</th>
            <th scope="col">Implied chance</th>
            <th scope="col">
              <span className="visually-hidden">Use</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows
            .sort((a, b) => b.row.americanOdds - a.row.americanOdds)
            .map(({ row, other }) => {
              const implied =
                row.americanOdds > 0
                  ? 100 / (row.americanOdds + 100)
                  : -row.americanOdds / (-row.americanOdds + 100);
              return (
                <tr key={`${row.sportsbook}-${row.line}`}>
                  <th scope="row">
                    {row.sportsbook}
                    {row.americanOdds === best && <span className="best-price"> Best price</span>}
                  </th>
                  {kind !== 'moneyline' && <td>{row.line}</td>}
                  <td>{odds(row.americanOdds)}</td>
                  <td>
                    {(implied * 100).toFixed(1)}%
                    {consensus !== undefined &&
                      ` (${implied < consensus ? 'better' : 'worse'} than fair by ${Math.abs((consensus - implied) * 100).toFixed(1)})`}
                  </td>
                  <td>
                    {onUsePrice && (
                      <button
                        type="button"
                        className="small-button"
                        onClick={() =>
                          onUsePrice({
                            ...(row.line !== undefined ? { line: row.line } : {}),
                            odds: row.americanOdds,
                            ...(other ? { oppositeOdds: other.americanOdds } : {}),
                          })
                        }
                      >
                        Use
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
      <p className="book-comparison-note">
        Prices from The Odds API. A price better than fair means that book is offering more than the
        market consensus; it is not a prediction that the bet wins.
      </p>
    </div>
  );
}
