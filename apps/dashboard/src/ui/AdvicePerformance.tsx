import { useRef, useState, useEffect, type ReactNode } from 'react';
import { record, type PredictionPerformance, type MarketBacktest } from '@sidekick/core';
import { requestJson, requestResponse } from './api-client';
const numeric = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
const shortText = (x: unknown, n = 300) => typeof x === 'string' && x.length <= n;
const interval = (x: unknown) =>
  x === undefined || (Array.isArray(x) && x.length === 2 && x.every(numeric) && x[0] <= x[1]);
const warnings = (x: unknown) =>
  Array.isArray(x) && x.length <= 20 && x.every((w) => shortText(w, 3000));
export function validPerformance(x: unknown): x is PredictionPerformance {
  const paper = record(x) && record(x.paper) ? x.paper : null;
  return (
    record(x) &&
    ['total', 'pending', 'missing', 'capacity'].every((k) => numeric(x[k])) &&
    Array.isArray(x.groups) &&
    x.groups.length <= 2000 &&
    x.groups.every(
      (g) =>
        record(g) &&
        ['fantasy', 'bet'].includes(String(g.kind)) &&
        shortText(g.method) &&
        ['scope', 'league', 'position'].every((k) => g[k] === undefined || shortText(g[k])) &&
        (g.gamesPerForecast === undefined || numeric(g.gamesPerForecast)) &&
        numeric(g.samples) &&
        ['mae', 'bias', 'brier', 'baselineBrier'].every(
          (k) => g[k] === undefined || numeric(g[k]),
        ) &&
        Array.isArray(g.calibration) &&
        g.calibration.length <= 5 &&
        g.calibration.every(
          (b) =>
            record(b) &&
            shortText(b.range, 40) &&
            ['samples', 'predicted', 'observed'].every((k) => numeric(b[k])),
        ),
    ) &&
    !!paper &&
    (paper.roi === undefined || numeric(paper.roi)) &&
    interval(paper.roiInterval) &&
    ['selections', 'wins', 'losses', 'pushes', 'stakedUnits', 'netUnits', 'weeks'].every((k) =>
      numeric(paper[k]),
    ) &&
    warnings(x.warnings)
  );
}
function validBacktest(x: unknown): x is MarketBacktest {
  return (
    record(x) &&
    typeof x.method === 'string' &&
    typeof x.strategy === 'string' &&
    [
      'rolling-residual-v1',
      'market-regularized-v2',
      'market-context-v3',
      'health-weather-total-v4',
    ].includes(String(x.method)) &&
    [
      'conservative-archive-v1',
      'conservative-archive-v2',
      'conservative-archive-v3',
      'conservative-archive-v4',
    ].includes(String(x.strategy)) &&
    x.publicationTimingVerified === false &&
    shortText(x.asOf, 40) &&
    Number.isFinite(Date.parse(String(x.asOf))) &&
    Array.isArray(x.seasons) &&
    (x.seasons.length === 2 || x.seasons.length === 3) &&
    x.seasons.every(
      (s) =>
        record(s) &&
        numeric(s.season) &&
        ['earlier', 'later', 'current'].includes(String(s.role)) &&
        Array.isArray(s.markets) &&
        s.markets.length === 3 &&
        s.markets.every(
          (m) =>
            record(m) &&
            ['moneyline', 'spread', 'total'].includes(String(m.kind)) &&
            [
              'games',
              'forecasts',
              'selections',
              'wins',
              'losses',
              'pushes',
              'netUnits',
              'weeks',
            ].every((k) => numeric(m[k])) &&
            [
              'brier',
              'marketBrier',
              'previousBrier',
              'priorMarketBrier',
              'priorMarketGames',
              'priorContextBrier',
              'priorContextGames',
              'availabilityAwareForecasts',
              'injuryContextGames',
              'weatherContextGames',
              'quarterbackChangeGames',
              'comparisonBrier',
              'scoredGames',
              'comparisonGames',
              'marketAwareForecasts',
              'roi',
            ].every((k) => m[k] === undefined || numeric(m[k])) &&
            interval(m.roiInterval) &&
            interval(m.marketImprovementInterval),
        ),
    ) &&
    warnings(x.warnings)
  );
}
const number = (x: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(x);
const scoreNumber = (x: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 5 }).format(x);
const methods: Record<string, string> = {
  'public-projection-v1': 'Public forecasts',
  'rolling-form-v1': 'Form and workload forecasts',
  'rolling-baseline-v1': 'Historical scoring forecasts',
  'historical-baseline': 'Historical baseline',
  imported: 'Imported projections',
  'rolling-residual-v1': 'Legacy scores-only betting model',
  'market-regularized-v2': 'Market-aware opponent-adjusted model (v2)',
  'health-weather-total-v4': 'Injury and weather totals model (v4)',
  'market-context-v3': 'Market-aware context model (v3)',
};
function MarketCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <td>
      <span className="advice-metric-cell-label" aria-hidden="true">
        {label}:{' '}
      </span>
      {children}
    </td>
  );
}
export function AdvicePerformance({ disabled = false }: { disabled?: boolean }) {
  const [report, setReport] = useState<PredictionPerformance | null>(null),
    [backtest, setBacktest] = useState<MarketBacktest | null>(null),
    [busy, setBusy] = useState(''),
    [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  async function run(operation: 'load' | 'refresh' | 'backtest') {
    if (busy) return;
    const c = new AbortController();
    active.current = c;
    setBusy(operation);
    setError('');
    try {
      const url =
        operation === 'backtest'
          ? '/api/advice/performance/backtest'
          : operation === 'refresh'
            ? '/api/advice/performance/refresh'
            : '/api/advice/performance';
      const init =
        operation === 'load'
          ? { signal: c.signal }
          : {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: '{}',
              signal: c.signal,
            };
      if (operation === 'backtest') {
        const x = await requestJson(url, validBacktest, init, 150000);
        if (!c.signal.aborted) setBacktest(x);
      } else {
        const x = await requestJson(url, validPerformance, init, 100000);
        if (!c.signal.aborted) setReport(x);
      }
    } catch {
      if (!c.signal.aborted)
        setError(
          'This check could not finish. Your saved forecasts are retained. Try again later.',
        );
    } finally {
      if (!c.signal.aborted) setBusy('');
    }
  }
  async function clear() {
    if (
      !window.confirm(
        'Clear the local prediction track record? Export it first to keep a copy. Saved advice is kept.',
      )
    )
      return;
    setBusy('clear');
    setError('');
    try {
      await requestResponse('/api/advice/performance', { method: 'DELETE' });
      const next = await requestJson('/api/advice/performance', validPerformance);
      setReport(next);
    } catch {
      setError('The track record could not be cleared.');
    } finally {
      setBusy('');
    }
  }
  return (
    <details
      className="advice-performance"
      onToggle={(e) => {
        if (e.currentTarget.open && !busy) void run('load');
      }}
    >
      <summary>Prediction accuracy and paper results</summary>
      <p>
        New analyses record forecasts before kickoff. After games finish, check their results here.
        Paper returns use hypothetical one-unit stakes at fetched prices; this does not place a bet.
      </p>
      <div className="report-sharing-actions">
        <button
          type="button"
          className="small-button"
          disabled={!!busy || disabled}
          onClick={() => void run('load')}
        >
          Refresh track record
        </button>
        <button
          type="button"
          className="small-button"
          disabled={!!busy || disabled}
          onClick={() => void run('refresh')}
        >
          Check finished games
        </button>
        <button
          type="button"
          className="small-button"
          disabled={!!busy || disabled}
          onClick={() => void run('backtest')}
        >
          Test historical market prices
        </button>
        {report && report.total > 0 && (
          <>
            <a className="small-button" href="/api/advice/performance/export" download>
              Export track record
            </a>
            <button
              type="button"
              className="text-button"
              disabled={!!busy || disabled}
              onClick={() => void clear()}
            >
              Clear track record
            </button>
          </>
        )}
      </div>
      {busy && (
        <p role="status">
          {busy === 'backtest'
            ? 'Testing two completed seasons at archived prices. This can take a couple of minutes.'
            : 'Checking the saved track record…'}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {report && (
        <>
          <p>
            {report.total} recorded forecasts · {report.pending} pending · {report.missing} missing
            complete outcome evidence. Limit: {report.capacity} entries.
          </p>
          {!report.total && (
            <p>
              Your forward track record starts with your next analysis. Past advice is not backdated
              into this ledger.
            </p>
          )}
          {report.groups.map((g, i) => (
            <section key={`${g.kind}:${g.method}:${g.scope}:${i}`}>
              <h4>
                {methods[g.method] ??
                  (g.method.startsWith('ai:') ? g.method.slice(3) + ' AI forecast' : g.method)}
                {g.league ? ` · ${g.league}` : ''}
                {g.position ? ` · ${g.position}` : ''}
                {g.scope
                  ? ` · ${g.scope === 'week' ? 'Weekly points' : g.scope === 'season' ? 'Future season points' : 'Remaining points'}`
                  : ''}
                {g.gamesPerForecast ? ` · ${g.gamesPerForecast} scheduled games` : ''}
              </h4>
              <p>
                {g.samples} settled comparisons.
                {g.mae !== undefined && ` Average absolute error: ${number(g.mae)} fantasy points.`}
                {g.bias !== undefined && ` Average overestimate: ${number(g.bias)} points.`}
                {g.brier !== undefined &&
                  ` Probability error: ${number(g.brier)} (lower is better).`}
                {g.baselineBrier !== undefined && ` Odds baseline: ${number(g.baselineBrier)}.`}
              </p>
              {g.calibration.length > 0 && (
                <details>
                  <summary>Probability calibration</summary>
                  <ul>
                    {g.calibration.map((b) => (
                      <li key={b.range}>
                        {b.range}: {b.samples} predictions, average estimate{' '}
                        {number(b.predicted * 100)}%, observed wins {number(b.observed * 100)}%.
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          ))}
          <h4>Forward paper selections</h4>
          <p>
            {report.paper.selections} qualifying selections · {report.paper.wins} wins ·{' '}
            {report.paper.losses} losses · {report.paper.pushes} pushes.
          </p>
          <p>
            Settled net return: {number(report.paper.netUnits)} units.
            {report.paper.roi !== undefined &&
              ` Return on staked units: ${number(report.paper.roi * 100)}%.`}
            {report.paper.roiInterval &&
              ` Weekly-cluster interval: ${number(report.paper.roiInterval[0] * 100)}% to ${number(report.paper.roiInterval[1] * 100)}%.`}
          </p>
          <PaperTracking paper={report.paper} />
          {report.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </>
      )}
      {backtest && (
        <section aria-label="Historical market-price test">
          <h3>Historical market-price test</h3>
          <p>
            Earlier and later seasons are shown separately.{' '}
            {backtest.method !== 'rolling-residual-v1' &&
              'The improved model uses sportsbook probabilities as an input. The old model and book are separate comparisons. '}
            These are historical simulations; they do not establish forward prediction accuracy or
            real betting profit.
          </p>
          {backtest.seasons.map((s) => (
            <section key={s.season}>
              <h4>
                {s.season} ·{' '}
                {s.role === 'current'
                  ? 'This season so far (untouched holdout)'
                  : s.role === 'later'
                    ? 'Later test season'
                    : 'Earlier test season'}
              </h4>
              <div className="advice-table-scroll">
                <table className="advice-metrics advice-market-table">
                  <thead>
                    <tr>
                      <th>Market</th>
                      <th>Games with prices</th>
                      <th>Forecasts</th>
                      <th>Probability error</th>
                      <th>Odds baseline error</th>
                      <th>Previous model error</th>
                      <th>Paper selections</th>
                      <th>Wins / losses / pushes</th>
                      <th>Settled weeks</th>
                      <th>Net units</th>
                      <th>Return</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.markets.map((m) => (
                      <tr key={m.kind}>
                        <th>{m.kind}</th>
                        <MarketCell label="Games with prices">{m.games}</MarketCell>
                        <MarketCell label="Forecasts">{m.forecasts}</MarketCell>
                        <MarketCell label="Probability error">
                          {m.brier === undefined ? 'Not enough data' : scoreNumber(m.brier)}
                        </MarketCell>
                        <MarketCell label="Odds baseline error">
                          {m.marketBrier === undefined
                            ? 'Not enough data'
                            : scoreNumber(m.marketBrier)}
                        </MarketCell>
                        <MarketCell label="Previous model error">
                          {m.previousBrier === undefined
                            ? 'Not enough data'
                            : scoreNumber(m.previousBrier)}
                          {m.comparisonGames !== undefined &&
                            m.comparisonGames !== m.scoredGames && (
                              <small>{m.comparisonGames} matched comparisons</small>
                            )}
                          {m.comparisonBrier !== undefined &&
                            m.comparisonGames !== m.scoredGames && (
                              <small>
                                New model on the same subset: {scoreNumber(m.comparisonBrier)}
                              </small>
                            )}
                        </MarketCell>
                        <MarketCell label="Paper selections">{m.selections}</MarketCell>
                        <MarketCell label="Wins / losses / pushes">
                          {m.wins} / {m.losses} / {m.pushes}
                        </MarketCell>
                        <MarketCell label="Settled weeks">{m.weeks}</MarketCell>
                        <MarketCell label="Net units">{number(m.netUnits)}</MarketCell>
                        <MarketCell label="Return">
                          {m.roi === undefined ? 'No selections' : `${number(m.roi * 100)}%`}
                          {m.roiInterval && (
                            <small>
                              Weekly-cluster interval: {number(m.roiInterval[0] * 100)}% to{' '}
                              {number(m.roiInterval[1] * 100)}%
                            </small>
                          )}
                        </MarketCell>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <details>
                <summary>Accuracy comparison and uncertainty</summary>
                <p>
                  Lower probability error is better. Prior-model comparisons use matching non-push
                  outcomes; if coverage differs, the new model’s error on that subset is also shown.
                  Improvements are sportsbook error minus model error; a positive value favors the
                  model. These approximate intervals group correlated games by NFL week.
                </p>
                {s.markets.map((m) => (
                  <p key={m.kind}>
                    {m.kind}: {m.marketAwareForecasts ?? 0} forecasts used the improved model.
                    {m.priorMarketBrier !== undefined &&
                      ` Previous market-aware v2 error: ${scoreNumber(m.priorMarketBrier)} on ${m.priorMarketGames} matched outcomes.`}
                    {m.priorContextBrier !== undefined &&
                      ` Previous v3 error: ${scoreNumber(m.priorContextBrier)} on ${m.priorContextGames} matched outcomes.`}
                    {m.availabilityAwareForecasts !== undefined &&
                      ` Extra injury/chart/weather inputs used in ${m.availabilityAwareForecasts} forecasts. Context coverage: ${m.injuryContextGames} dated injury cases, ${m.weatherContextGames} regional weather cases, ${m.quarterbackChangeGames} captured quarterback changes.`}
                    {m.marketImprovementInterval &&
                      ` Paired improvement interval: ${scoreNumber(m.marketImprovementInterval[0])} to ${scoreNumber(m.marketImprovementInterval[1])}.`}
                    {m.marketImprovementInterval &&
                      m.marketImprovementInterval[0] <= 0 &&
                      m.marketImprovementInterval[1] >= 0 &&
                      ' The interval includes zero; an accuracy advantage over the sportsbook is not established.'}
                  </p>
                ))}
              </details>
            </section>
          ))}
          {backtest.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </section>
      )}
    </details>
  );
}

/**
 * Closing line value and a running week-by-week paper result. Beating the closing price is the
 * earliest dependable sign of an edge; wins and losses take far longer to mean anything.
 */
function PaperTracking({ paper }: { paper: PredictionPerformance['paper'] }) {
  const clv = paper.closingLineValue;
  const weeks = Array.isArray(paper.byWeek) ? paper.byWeek.slice(-18) : [];
  let running = 0;
  return (
    <section className="paper-tracking" aria-label="Closing line value and running results">
      <h4>Closing line value</h4>
      {clv ? (
        <p>
          Across {clv.samples} selections with a comparable closing price, the price taken was{' '}
          <strong>
            {clv.average >= 0 ? 'better' : 'worse'} than the close by{' '}
            {number(Math.abs(clv.average) * 100)} percentage points
          </strong>{' '}
          on average. {clv.beatClose} of {clv.samples} beat the closing price.
        </p>
      ) : (
        <p>
          The app records each selection’s closing price shortly before kickoff while it’s running.
          Results appear here once a game with a saved price has started.
        </p>
      )}
      {weeks.length > 0 && (
        <>
          <h4>Running paper result</h4>
          <table className="paper-weeks">
            <thead>
              <tr>
                <th scope="col">Week</th>
                <th scope="col">Net units</th>
                <th scope="col">Running total</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((w) => {
                running += w.netUnits;
                return (
                  <tr key={`${w.season}-${w.week}`}>
                    <th scope="row">
                      {w.season} week {w.week}
                    </th>
                    <td>{number(w.netUnits)}</td>
                    <td className={running >= 0 ? 'positive' : 'negative'}>{number(running)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
