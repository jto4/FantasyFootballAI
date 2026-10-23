import { useRef, useEffect, useState } from 'react';
import { isAdviceJournalReport, type AdviceJournalReport } from '@sidekick/core';
import { requestJson, requestResponse } from './api-client';
import { adviceTitle, isAdviceMode } from './advice-navigation';
const methodNames: Record<string, string> = {
  imported: 'Imported projections',
  'historical-baseline': 'Historical scoring baseline',
  'public-projection-v1': 'Public projections',
  'sidekick-model-v1': 'Sidekick projections',
  'rolling-form-v1': 'Form and workload forecasts',
  'rolling-baseline-v1': 'Historical scoring forecasts',
  'market-context-v3': 'Game context model',
  'market-regularized-v2': 'Opponent-adjusted game model',
  'health-weather-total-v4': 'Injury and weather totals model',
  'rolling-residual-v1': 'Scores-only model',
};
function projectionLabel(value: string) {
  const [mode, scope, method] = value.split(':');
  return `${isAdviceMode(mode) ? adviceTitle(mode) : 'Older saved forecasts'} · ${scope === 'remaining-season' ? 'Remaining season' : scope === 'season' ? 'Season' : 'Weekly'} · ${methodNames[method ?? ''] ?? 'Saved projection method'}`;
}
const number = (n: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(n);
export function AdviceJournal({ disabled }: { disabled: boolean }) {
  const [report, setReport] = useState<AdviceJournalReport | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  async function load(settle = false) {
    if (busy || disabled) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError('');
    try {
      if (settle)
        await requestResponse(
          '/api/advice/performance/refresh',
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}',
            signal: controller.signal,
          },
          95000,
        );
      const next = await requestJson('/api/advice/journal', isAdviceJournalReport, {
        signal: controller.signal,
      });
      if (!controller.signal.aborted) setReport(next);
    } catch {
      if (!controller.signal.aborted)
        setError('The outcome journal could not be loaded. Saved forecasts are retained.');
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <details
      className="advice-journal"
      onToggle={(e) => {
        if (e.currentTarget.open && !report) void load();
      }}
    >
      <summary>Fantasy outcome journal and prospective experiments</summary>
      <p>
        Compare frozen recommendations with their original alternatives. No AI call, wager or
        platform transaction is made here.
      </p>
      <button
        type="button"
        className="small-button"
        disabled={busy || disabled}
        onClick={() => void load(true)}
      >
        Check finished games and update journal
      </button>{' '}
      <button
        type="button"
        className="text-button"
        disabled={busy || disabled}
        onClick={() => void load()}
      >
        Reload journal
      </button>
      {busy && <p role="status">Checking the local journal…</p>}
      {error && <p role="alert">{error}</p>}
      {report && (
        <>
          <h3>Fantasy decision comparisons</h3>
          {!report.decisions.length && (
            <p>
              No complete future decision comparison has been recorded. A legal baseline and
              pre-kickoff forecasts for every compared player are required.
            </p>
          )}
          {report.decisions.map((d) => (
            <article key={d.adviceId}>
              <h4>
                {isAdviceMode(d.mode) ? adviceTitle(d.mode) : 'Fantasy decision'} · {d.status}
              </h4>
              <p>{d.baselineLabel}</p>
              <p>
                {d.projectedChange === undefined
                  ? 'Projected change is unknown.'
                  : `Estimated change: ${number(d.projectedChange)} points.`}{' '}
                {d.actualChange === undefined
                  ? 'Outcome change is unresolved.'
                  : `Observed change: ${number(d.actualChange)} points.`}
              </p>
              <p>Hypothetical comparison; this does not establish that the move was executed.</p>
            </article>
          ))}
          <h3>Projection accuracy by workflow</h3>
          <p>
            Different leagues, scoring rules, positions, seasons and game horizons are kept
            separate.
          </p>
          {!report.projections.length && <p>No settled scoring-matched player forecasts yet.</p>}
          {report.projections.map((p) => (
            <p key={p.key}>
              {projectionLabel(p.mode)} · {p.league} · {p.season} · {p.position} ·{' '}
              {p.gamesPerForecast} game horizon: {p.samples} forecasts · mean absolute error{' '}
              {number(p.mae)} points
              {p.baselineMae === undefined
                ? ' · no complete matched baseline'
                : ` · baseline error ${number(p.baselineMae)} points`}
              .
            </p>
          ))}
          <h3>Betting research · prospective only</h3>
          <p>
            Each cohort fixes the installed numerical code and compares forecasts at the same
            verified quote. Sentiment and whale signals remain experimental. No automatic model
            promotion.
          </p>
          {!report.experiments.length && (
            <p>
              No settled versioned game-market comparisons yet. Historical replay is shown
              separately in Prediction accuracy and paper results.
            </p>
          )}
          {report.experiments.map((e) => (
            <article key={`${e.protocolId}:${e.season}:${e.market}`}>
              <h4>
                {methodNames[e.method] ?? 'Saved forecast model'} · {e.season} · {e.market}
              </h4>
              <p>
                {e.samples} matched non-push outcomes across {e.weeks} weeks. Model error{' '}
                {number(e.brier)} · sportsbook error {number(e.baselineBrier)} · improvement{' '}
                {number(e.improvement)}.
              </p>
              <p>
                {e.interval
                  ? `Weekly-cluster improvement interval: ${number(e.interval[0])} to ${number(e.interval[1])}.`
                  : 'At least eight settled weeks are required for an interval.'}{' '}
                Positive sample results do not establish consistent superiority.
              </p>
              <details>
                <summary>Calibration and frozen protocol</summary>
                <p>Protocol {e.protocolId}</p>
                {e.calibration.map((b) => (
                  <p key={b.range}>
                    {b.range}: {b.samples} samples · average predicted {number(100 * b.predicted)}%
                    · observed {number(100 * b.observed)}%.
                  </p>
                ))}
              </details>
            </article>
          ))}
          <p>
            {report.excludedBetRecords} betting records excluded from the strict prospective
            comparison.
          </p>
          {report.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </>
      )}
    </details>
  );
}
