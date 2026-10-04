import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { defaultActionSettings } from '@sidekick/core';
import { SchedulePage } from './SchedulePage';

describe('SchedulePage', () => {
  it('offers draft-only retry for an interrupted calendar event', () => {
    const markup = renderToStaticMarkup(
      <SchedulePage
        actions={defaultActionSettings}
        scheduledRuns={[
          {
            id: 'run-calendar',
            kind: 'draft-hype',
            startedAt: '2026-09-25T12:10:00.000Z',
            status: 'failed',
            calendarEventId: 'event-1',
            calendarEventTitle: 'League draft',
            detail:
              'Calendar event was interrupted before completion; retry failed leagues as drafts after review.',
            leagueResults: [
              {
                leagueId: 'league-1',
                displayName: 'Sunday Crew',
                status: 'failed',
              },
            ],
          },
        ]}
        retryingRunId=""
        onGenerate={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(markup).toContain('Calendar event was interrupted before completion');
    expect(markup).toContain('Retry failed as drafts');
  });

  it('keeps generation review-only and disables duplicate generation', () => {
    const markup = renderToStaticMarkup(
      <SchedulePage
        actions={defaultActionSettings}
        scheduledRuns={[]}
        retryingRunId=""
        generatingKind="power-rankings"
        onGenerate={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(markup).toContain('Generating…');
    expect(markup).toContain('disabled=""');
    expect(markup).not.toContain('Send now');
  });
});
