import { useEffect, useState } from 'react';
import { isPropGameLog, type PropGameLog, type FootballStatKey } from '@sidekick/core';
import { requestJson } from './api-client';
import { ResearchChart } from './ResearchChart';
import './market-signals.css';
export function PlayerPropResearch({
  gameId,
  playerId,
  stat,
  line,
}: {
  gameId: string;
  playerId: string;
  stat: FootballStatKey;
  line: string;
}) {
  const [log, setLog] = useState<PropGameLog>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setLog(undefined);
    setError('');
    setBusy(false);
    if (!gameId || !playerId) return;
    const controller = new AbortController();
    setBusy(true);
    void requestJson(
      `/api/player-props/log?${new URLSearchParams({ game: gameId, player: playerId, stat })}`,
      isPropGameLog,
      { signal: controller.signal },
      45000,
    )
      .then((r) => {
        if (!controller.signal.aborted) setLog(r);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : 'Player logs could not load.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [gameId, playerId, stat]);
  const threshold = line.trim() !== '' && Number.isFinite(Number(line)) ? Number(line) : undefined;
  const values = log?.rows.map((r) => r.value) ?? [];
  return (
    <section className="prop-research" aria-label="Player prop research">
      <h3>Player prop research</h3>
      {busy ? (
        <p role="status">Loading completed game stats…</p>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : !log ? (
        <p>Choose a game and player to see recent stats.</p>
      ) : (
        <>
          <ResearchChart
            title={`${log.name} · ${stat.replaceAll('_', ' ')}`}
            unit={stat.includes('yards') ? 'yards' : 'count'}
            kind="bar"
            points={log.rows.map((r) => ({
              label: `${r.season} W${r.week} vs ${r.opponent}`,
              value: r.value,
            }))}
            {...(threshold !== undefined ? { reference: threshold } : {})}
          />
          {threshold !== undefined && (
            <p className="visual-source">Dashed line: your entered {threshold} threshold.</p>
          )}
          {values.length > 0 && (
            <p>
              Last {values.length} completed games · average{' '}
              {(values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)}
              {threshold !== undefined
                ? ` · Over ${values.filter((v) => v > threshold).length} / Under ${values.filter((v) => v < threshold).length} / Push ${values.filter((v) => v === threshold).length} at ${threshold}`
                : ''}
              .
            </p>
          )}
          <details>
            <summary>Prop data & limits</summary>
            <p>
              Recent results are descriptive, not a probability or verified sportsbook edge. Missing
              values and ambiguous rows are excluded; game data has a 24-hour availability
              allowance. Enter your sportsbook’s exact line and both prices below, and confirm
              participation/settlement rules. No live prop-price feed is connected.
            </p>
            {log.sources.map((url) => (
              <p key={url}>
                <a href={url} target="_blank" rel="noreferrer">
                  nflverse player statistics
                </a>
              </p>
            ))}
          </details>
        </>
      )}
    </section>
  );
}
