import { useEffect, useState } from 'react';
import {
  isAdviceJournalReport,
  type AdviceJournalReport,
  type PredictionPerformance,
} from '@sidekick/core';
import { requestJson } from './api-client';
import { validPerformance } from './AdvicePerformance';

const sourceNames: Record<string, string> = {
  'public-projection-v1': 'ESPN projections',
  imported: 'Your imported projections',
  'historical-baseline': 'Recent-games average',
  'rolling-form-v1': 'App’s own model',
  'rolling-baseline-v1': 'App’s own model (baseline)',
};
const sourceName = (method: string) =>
  sourceNames[method] ?? (method.startsWith('import') ? 'Your imported projections' : method);
const points = (n: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(n);

async function load(signal: AbortSignal) {
  const [performance, journal] = await Promise.all([
    requestJson('/api/advice/performance', validPerformance, { signal }),
    requestJson('/api/advice/journal', isAdviceJournalReport, { signal }),
  ]);
  return { performance, journal };
}

/**
 * How the advice has held up: projection error by source and how graded decisions turned out.
 * Results settle automatically after games; this only reads the stored records.
 */
export function AdviceScorecard({ onOpen }: { onOpen: () => void }) {
  const [data, setData] = useState<{
    performance: PredictionPerformance;
    journal: AdviceJournalReport;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  if (!data) return null;
  // Weighted by sample count so a large league and a small one count in proportion.
  const bySource = new Map<string, { samples: number; error: number }>();
  for (const group of data.performance.groups)
    if (group.kind === 'fantasy' && group.mae !== undefined && group.samples > 0) {
      const name = sourceName(group.method),
        row = bySource.get(name) ?? { samples: 0, error: 0 };
      row.samples += group.samples;
      row.error += group.mae * group.samples;
      bySource.set(name, row);
    }
  const sources = [...bySource.entries()]
    .map(([name, row]) => ({ name, samples: row.samples, mae: row.error / row.samples }))
    .sort((a, b) => a.mae - b.mae);
  const graded = data.journal.decisions.filter(
    (d) => d.status === 'settled' && d.actualChange !== undefined,
  );
  const helped = graded.filter((d) => d.actualChange! > 0).length;
  const net = graded.reduce((sum, d) => sum + d.actualChange!, 0);
  return (
    <section className="advice-scorecard" aria-labelledby="advice-scorecard-title">
      <div className="advice-scorecard-head">
        <h3 id="advice-scorecard-title">How the advice is holding up</h3>
        <button type="button" className="text-button" onClick={onOpen}>
          Full results →
        </button>
      </div>
      {!sources.length && !graded.length ? (
        <p>
          After games finish, this compares projections with actual points and checks how saved
          decisions turned out. Save some lineup or waiver advice to start the record.
        </p>
      ) : (
        <div className="advice-scorecard-grid">
          <div>
            <h4>Projection accuracy</h4>
            {sources.length ? (
              <ul>
                {sources.map((source, index) => (
                  <li key={source.name}>
                    <strong>{source.name}</strong>: off by {points(source.mae)} points on average ·{' '}
                    {source.samples} player-weeks
                    {index === 0 && sources.length > 1 && (
                      <span className="scorecard-best"> Most accurate so far</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No projections have been graded yet.</p>
            )}
          </div>
          <div>
            <h4>Saved decisions</h4>
            {graded.length ? (
              <p>
                {helped} of {graded.length} graded decisions beat the alternative ·{' '}
                <strong>
                  {net >= 0 ? '+' : ''}
                  {points(net)} points
                </strong>{' '}
                in total versus not making the change.
              </p>
            ) : (
              <p>No saved decisions have been graded yet.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
