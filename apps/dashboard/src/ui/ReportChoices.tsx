import type { ReportKind } from '@sidekick/core';
import { reportChoices } from './beginner-flow';

export const reportExamples: Record<ReportKind, string> = {
  'power-rankings':
    '1. Sunday Superstars — a winning streak puts them on top. 2. Bench Believers — plenty of points, one close loss.',
  'matchup-preview':
    'Sunday Superstars vs. Bench Believers: the week’s closest matchup could come down to Monday night.',
  'offseason-update':
    'The season may be over, but the league debate is not. Who is keeping their breakout star?',
  'draft-hype':
    'Draft day is almost here. Bring your rankings, your snacks, and a backup plan for round two.',
  'draft-review':
    'Sunday Superstars built around reliable starters. Bench Believers swung for upside in the later rounds.',
};
export function ReportChoices({
  kind,
  onChange,
}: {
  kind: ReportKind;
  onChange: (kind: ReportKind) => void;
}) {
  return (
    <fieldset className="report-choices">
      <legend>Report type</legend>
      {reportChoices.map((choice) => (
        <label
          className={`report-choice ${kind === choice.kind ? 'selected' : ''}`}
          key={choice.kind}
        >
          <input
            type="radio"
            name="report-kind"
            value={choice.kind}
            checked={kind === choice.kind}
            onChange={() => onChange(choice.kind)}
          />
          <span>
            <strong>{choice.title}</strong>
            <span>{choice.description}</span>
            {kind === choice.kind && (
              <small>Fictional example: {reportExamples[choice.kind]}</small>
            )}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
