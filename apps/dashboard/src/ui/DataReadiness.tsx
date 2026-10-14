import type { AdviceDataReadiness } from '@sidekick/core';
import { formatDateTime } from './date-format';
export function DataReadiness({ report }: { report: AdviceDataReadiness }) {
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
        Checked {formatDateTime(report.checkedAt)}. This describes evidence coverage, not a
        probability of success.
      </p>
      {report.projectionTotal > 0 && (
        <p>
          {report.projectionKnown} of {report.projectionTotal} considered active players have a
          supported estimate.
        </p>
      )}
      {report.injuryPlayers > 0 && (
        <p>
          {report.currentInjuryReports} of {report.injuryPlayers} players have a current dated
          injury report; the rest remain unverified.
        </p>
      )}
      <ul>
        {report.items
          .filter((i) => i.state !== 'current')
          .map((i, index) => (
            <li key={index}>
              <strong>{i.name}:</strong> {i.detail}
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
              {i.detail}
            </li>
          ))}
        </ul>
        {report.injuryReports.map((r) => (
          <p key={r.playerId}>
            {r.playerId}: {r.coverage}
            {r.updatedAt
              ? ` · report updated ${formatDateTime(r.updatedAt)}`
              : ' · no verified report timestamp'}
          </p>
        ))}
      </details>
    </section>
  );
}
