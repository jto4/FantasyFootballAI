import type { ReportKind } from '@sidekick/core';

type PostDraftKind = Extract<ReportKind, 'draft-review' | 'power-rankings'>;

export function postDraftEventDraft(
  suggestion: { date: string; time: string },
  kind: PostDraftKind,
): { title: string; kind: PostDraftKind; date: string; time: string } {
  return {
    title: kind === 'draft-review' ? 'Post-draft review' : 'Post-draft power rankings',
    kind,
    date: suggestion.date,
    time: suggestion.time,
  };
}
