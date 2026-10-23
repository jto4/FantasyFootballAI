import { useEffect, useRef, useState } from 'react';
import {
  isMarketSignalsSnapshot,
  isMarketResearchRecord,
  noVigOver,
  type MarketSignalsSnapshot,
  type MarketResearchRecord,
  type FootballGame,
} from '@sidekick/core';
import { requestJson } from './api-client';
import { formatDateTime } from './date-format';
import { ResearchChart } from './ResearchChart';
import './market-signals.css';
import { ErrorNotice } from './ErrorNotice';
const isRecords = (x: unknown): x is { records: MarketResearchRecord[] } =>
  !!x &&
  typeof x === 'object' &&
  Array.isArray((x as { records?: unknown }).records) &&
  (x as { records: unknown[] }).records.length <= 500 &&
  (x as { records: unknown[] }).records.every(isMarketResearchRecord);
const isGames = (x: unknown): x is { season: number; games: FootballGame[] } =>
  !!x &&
  typeof x === 'object' &&
  Number.isInteger((x as { season?: number }).season) &&
  Array.isArray((x as { games?: unknown }).games) &&
  (x as { games: FootballGame[] }).games.length <= 40 &&
  (x as { games: FootballGame[] }).games.every(
    (g) =>
      typeof g.id === 'string' &&
      typeof g.home === 'string' &&
      typeof g.away === 'string' &&
      typeof g.kickoffAt === 'string' &&
      Number.isFinite(Date.parse(g.kickoffAt)),
  );
export function MarketSignalsPanel() {
  const [games, setGames] = useState<FootballGame[]>([]),
    [gameId, setGameId] = useState(''),
    [line, setLine] = useState(''),
    [provider, setProvider] = useState<'kalshi' | 'polymarket'>('kalshi');
  const [snapshot, setSnapshot] = useState<MarketSignalsSnapshot>(),
    [records, setRecords] = useState<MarketResearchRecord[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    active.current = controller;
    void Promise.all([
      requestJson('/api/market-signals/games', isGames, { signal: controller.signal }),
      requestJson('/api/market-signals/records', isRecords, { signal: controller.signal }),
    ])
      .then(([g, r]) => {
        if (!controller.signal.aborted) {
          setGames(g.games);
          setRecords(r.records);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError('Market research could not load. Reopen this tab to retry.');
      });
    return () => controller.abort();
  }, []);
  async function action(kind: 'capture' | 'freeze' | 'resolve') {
    if (busy) return;
    const controller = new AbortController();
    active.current?.abort();
    active.current = controller;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(
          kind === 'capture'
            ? { gameId, line: Number(line), provider }
            : kind === 'freeze'
              ? { snapshotId: snapshot?.id }
              : {},
        ),
      };
      if (kind === 'capture') {
        setSnapshot(undefined);
        const s = await requestJson(
          '/api/market-signals/capture',
          isMarketSignalsSnapshot,
          options,
          180000,
        );
        if (!controller.signal.aborted) setSnapshot(s);
      } else if (kind === 'freeze') {
        const r = await requestJson('/api/market-signals/freeze', isMarketResearchRecord, options);
        if (!controller.signal.aborted) {
          setRecords((prior) => [r, ...prior.filter((p) => p.id !== r.id)]);
          setNotice(
            `Frozen ${r.snapshot.game.away} at ${r.snapshot.game.home}, total ${r.snapshot.line}. The first record for this game/provider is retained.`,
          );
        }
      } else {
        const r = await requestJson('/api/market-signals/resolve', isRecords, options, 90000);
        if (!controller.signal.aborted) {
          setRecords(r.records);
          setNotice('Checked final scores. Unfinished games stay pending.');
        }
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : 'Market research could not finish.');
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  const selected = games.find((g) => g.id === gameId);
  const eligible = !!snapshot?.baseline && snapshot.complete && !!snapshot.prices.length;
  const mentions = new Map<string, number>();
  for (const h of snapshot?.headlines ?? []) {
    const day = h.publishedAt.slice(0, 10);
    mentions.set(day, (mentions.get(day) ?? 0) + 1);
  }
  return (
    <section className="market-signals" aria-label="Market Signals">
      <div className="visuals-heading">
        <div>
          <p className="section-overline">RESEARCH ONLY</p>
          <h2>Market Signals</h2>
          <p>Explore game totals. These signals do not affect betting predictions.</p>
        </div>
      </div>
      <div className="advice-fields research-filters">
        <label>
          NFL game
          <select
            value={gameId}
            disabled={busy}
            onChange={(e) => {
              const g = games.find((r) => r.id === e.target.value);
              setGameId(e.target.value);
              setLine(g?.totalLine === undefined ? '' : String(g.totalLine));
              setSnapshot(undefined);
            }}
          >
            <option value="">Choose an upcoming game</option>
            {games.map((g) => (
              <option key={g.id} value={g.id}>
                {g.away} at {g.home} · {g.date}
              </option>
            ))}
          </select>
        </label>
        <label>
          Provider
          <select
            value={provider}
            disabled={busy}
            onChange={(e) => {
              setProvider(e.target.value as typeof provider);
              setSnapshot(undefined);
            }}
          >
            <option value="kalshi">Kalshi</option>
            <option value="polymarket">Polymarket</option>
          </select>
        </label>
        <label>
          Exact game total
          <input
            type="number"
            min="1.5"
            max="149.5"
            step="1"
            placeholder="e.g. 40.5"
            value={line}
            disabled={busy}
            onChange={(e) => {
              setLine(e.target.value);
              setSnapshot(undefined);
            }}
          />
        </label>
      </div>
      <button
        type="button"
        className="small-button research-primary"
        disabled={busy || !selected || !line || Number(line) % 1 !== 0.5}
        onClick={() => void action('capture')}
      >
        {busy ? 'Working…' : 'Load signals'}
      </button>
      <p className="visual-source">
        Use the current sportsbook total to get an exact baseline match. No automatic collection
        runs in the background.
      </p>
      {error && <ErrorNotice error={error} />}
      {notice && <p role="status">{notice}</p>}
      {snapshot && (
        <>
          <p className="visual-source">
            {snapshot.game.away} at {snapshot.game.home} · O/U {snapshot.line} · captured{' '}
            {formatDateTime(snapshot.capturedAt)} · 24-hour window
          </p>
          <div className="research-cards">
            <article>
              <h3>Price movement</h3>
              <ResearchChart
                title="Over contract price"
                unit="%"
                probability
                points={snapshot.prices.map((p) => ({
                  label: formatDateTime(p.at),
                  time: Date.parse(p.at),
                  value: p.probability * 100,
                }))}
                reference={snapshot.baseline ? noVigOver(snapshot.baseline) * 100 : undefined}
              />
              <p className="visual-source">
                {snapshot.baseline
                  ? `Dashed: ${snapshot.baseline.sportsbook} no-vig Over probability. `
                  : ''}
                Prices are not a calibrated forecast.
              </p>
            </article>
            <article>
              <h3>Whale activity</h3>
              <ResearchChart
                title="Large executed trades by hour"
                unit="USD"
                kind="bar"
                points={snapshot.activity.map((b) => ({
                  label: formatDateTime(b.at),
                  time: Date.parse(b.at),
                  value: b.largeCash,
                }))}
              />
              <p className="visual-source">
                Trades ≥ $500 executed cash.{' '}
                {snapshot.complete ? 'Complete pagination' : 'Partial or missing coverage'}. Large
                trades do not identify informed traders.
              </p>
            </article>
            <article>
              <h3>Public perception</h3>
              <ResearchChart
                title="Relevant headlines by publication day"
                unit="stories"
                kind="bar"
                points={[...mentions]
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([label, value]) => ({ label, value, time: Date.parse(label) }))}
              />
              <p className="visual-source">
                {snapshot.mediaStatus} feed · up to 8 selected stories over 7 days. Coverage proxy;
                broader public sentiment is unknown.
              </p>
            </article>
          </div>
          <div className="research-actions">
            <button
              type="button"
              className="small-button research-primary"
              disabled={busy || !eligible}
              onClick={() => void action('freeze')}
            >
              Freeze prospective record
            </button>
            <small>Requires complete, fresh prices before kickoff.</small>
          </div>
          <details>
            <summary>Sources, coverage & methodology</summary>
            <p>
              Whale chart sums executed cash (shares × paid outcome price) in trades of at least
              $500. It cannot identify unique whales or skill. Missing hours are not filled with
              zero. Prices come from verified completed pre-cutoff aggregates at the exact line.
              Kalshi prices are bid/ask midpoints; Polymarket uses its price-history feed.
            </p>
            <p>
              24-hour taker flow: $
              {snapshot.activity.reduce((a, b) => a + b.overCash, 0).toFixed(2)} toward Over; $
              {snapshot.activity.reduce((a, b) => a + b.underCash, 0).toFixed(2)} toward Under.
              Anonymous Kalshi trades; no wallet identities stored in this panel.
            </p>
            <p>
              Contract: {snapshot.contractId ?? 'unavailable'}.{' '}
              <a
                href={
                  snapshot.provider === 'kalshi'
                    ? 'https://docs.kalshi.com/api-reference/market/get-trades'
                    : 'https://data-api.polymarket.com/v2/docs'
                }
                target="_blank"
                rel="noreferrer"
              >
                Provider data documentation
              </a>
            </p>
            {snapshot.baseline && (
              <p>
                <a href={snapshot.baseline.sourceUrl} target="_blank" rel="noreferrer">
                  {snapshot.baseline.sportsbook} via ESPN
                </a>{' '}
                · retrieved {formatDateTime(snapshot.baseline.observedAt)}; retrieval is not the
                publisher update time.
              </p>
            )}
            <ul>
              {snapshot.headlines.map((h) => (
                <li key={h.url}>
                  <a href={h.url} target="_blank" rel="noreferrer">
                    {h.title}
                  </a>{' '}
                  · {h.source} · {formatDateTime(h.publishedAt)}
                </li>
              ))}
            </ul>
            {snapshot.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
          </details>
        </>
      )}
      <details className="research-ledger" open={records.length > 0}>
        <summary>Prospective tracking ({records.length})</summary>
        <p>
          external-price-v1 freezes the latest Over contract price against a matched no-vig
          sportsbook baseline. One first record per game/provider. Flow and headlines are saved as
          covariates; no fitted correction or prediction promotion. Lower Brier is better; small
          selected samples cannot establish an edge.
        </p>
        <div className="research-actions">
          <button
            type="button"
            className="small-button"
            disabled={busy || !records.some((r) => !r.result)}
            onClick={() => void action('resolve')}
          >
            Check final scores
          </button>
          <a href="/api/market-signals/export" download>
            Export research
          </a>
        </div>
        {!records.length && <p>No frozen records yet. Capture before kickoff to start tracking.</p>}
        {(['kalshi', 'polymarket'] as const).flatMap((p) =>
          [
            ...new Set(
              records.filter((r) => r.snapshot.provider === p).map((r) => r.snapshot.game.season),
            ),
          ].map((season) => {
            const group = records.filter(
                (r) => r.snapshot.provider === p && r.snapshot.game.season === season,
              ),
              settled = group.filter((r) => r.result);
            const brier = (candidate: boolean) =>
              settled.reduce(
                (a, r) =>
                  a +
                  ((candidate ? r.candidateProbability : r.baselineProbability) -
                    Number(r.result!.total > r.snapshot.line)) **
                    2,
                0,
              ) / settled.length;
            return (
              <p key={`${p}-${season}`}>
                <strong>
                  {p} · {season}
                </strong>
                : {settled.length} settled / {group.length} frozen
                {settled.length
                  ? ` · price Brier ${brier(true).toFixed(4)} · sportsbook ${brier(false).toFixed(4)}`
                  : ' · awaiting outcomes'}
                .
              </p>
            );
          }),
        )}
        <div className="research-table">
          <table>
            <thead>
              <tr>
                <th>Game / total</th>
                <th>Frozen</th>
                <th>Over price</th>
                <th>Sportsbook</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {records.slice(0, 20).map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.snapshot.game.away} at {r.snapshot.game.home} / {r.snapshot.line}
                    <small>{r.snapshot.provider}</small>
                  </td>
                  <td>{formatDateTime(r.frozenAt)}</td>
                  <td>{(r.candidateProbability * 100).toFixed(1)}%</td>
                  <td>{(r.baselineProbability * 100).toFixed(1)}%</td>
                  <td>
                    {r.result ? (
                      <a href={r.result.sourceUrl} target="_blank" rel="noreferrer">
                        {r.result.total} points ·{' '}
                        {r.result.total > r.snapshot.line ? 'Over' : 'Under'}
                      </a>
                    ) : (
                      'Pending'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {records.length > 20 && <p>Showing latest 20. Export includes every record.</p>}
      </details>
    </section>
  );
}
