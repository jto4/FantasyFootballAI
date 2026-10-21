import type { AdviceDataReadiness } from '@sidekick/core';
import { formatDateTime } from './date-format';
const coverageLabels: Record<string, string> = {
  current: 'dated report',
  'week-window': 'this week’s report',
  undated: 'report without an update time',
  stale: 'out-of-date report',
  unmatched: 'no matching report',
  ambiguous: 'conflicting reports',
  unavailable: 'injury feed unavailable',
};

export function DataReadiness({ report }: { report: AdviceDataReadiness }) {
  const weekly = report.injuryReports.filter((r) => r.coverage === 'week-window').length;
  return (
    <section className="data-readiness" aria-label="Data readiness">
      <h3>
        Data readiness ·{' '}
        {report.status === 'ready'
          ? 'Ready for comparison'
          : report.status === 'blocked'
            ? 'Needs attention'
            : 'Limited evidence'}
      </h3>
      <p>
        Checked {formatDateTime(report.checkedAt)}. This shows what data is available, not the odds
        of success.
      </p>
      {report.projectionTotal > 0 && (
        <p>
          {report.projectionKnown} of {report.projectionTotal} considered active players have a
          supported estimate.
        </p>
      )}
      {report.injuryPlayers > 0 && (
        <p>
          {report.currentInjuryReports + weekly} of {report.injuryPlayers} players have a current
          injury report
          {weekly ? ` (${weekly} from this week’s report, valid until their team kicks off)` : ''};
          the rest remain unverified.
        </p>
      )}
      <ul>
        {report.items
          .filter((i) => i.state !== 'current')
          .map((i, index) => (
            <li key={index}>
              <strong>{i.name}:</strong> {readableTimes(i.detail)}
            </li>
          ))}
      </ul>
      <details>
        <summary>Source timestamps and coverage</summary>
        <ul>
          {report.items.map((i, index) => (
            <li key={index}>
              <strong>
                {i.name} · {i.state}:
              </strong>{' '}
              {readableTimes(i.detail)}
            </li>
          ))}
        </ul>
        {report.injuryReports.map((r) => (
          <p key={r.playerId}>
            {r.playerId}: {coverageLabels[r.coverage] ?? r.coverage}
            {r.coverage === 'week-window' && r.validUntil
              ? ` · no update time from the source, valid until kickoff ${formatDateTime(r.validUntil)}`
              : r.updatedAt
                ? ` · report updated ${formatDateTime(r.updatedAt)}`
                : ' · no verified report timestamp'}
          </p>
        ))}
      </details>
    </section>
  );
}

/** Readiness details carry ISO timestamps; show them as ordinary local dates. */
function readableTimes(text: string): string {
  return text.replace(
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})/g,
    (value) => formatDateTime(value),
  );
}
