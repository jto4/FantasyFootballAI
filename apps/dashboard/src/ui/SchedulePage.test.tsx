import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { defaultActionSettings } from '@sidekick/core';
import { SchedulePage } from './SchedulePage';

describe('SchedulePage', () => {
  it('offers draft-only retry for an interrupted calendar event', () => {
    const markup = renderToStaticMarkup(
      <SchedulePage
        actions={defaultActionSettings}
        reports={[]}
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
        sendingReportId=""
        onGenerate={vi.fn()}
        onRetry={vi.fn()}
        onSend={vi.fn()}
      />,
    );

    expect(markup).toContain('Calendar event was interrupted before completion');
    expect(markup).toContain('Retry failed as drafts');
  });

  it('disables additional sends while one report is being delivered', () => {
    const markup = renderToStaticMarkup(
      <SchedulePage
        actions={defaultActionSettings}
        reports={[
          {
            id: 'report-1',
            leagueId: 'league-1',
            kind: 'draft-hype',
            createdAt: '2026-09-28T12:00:00.000Z',
            title: 'Draft hype',
            body: 'Draft season is here.',
            citations: [],
            status: 'draft',
          },
        ]}
        scheduledRuns={[]}
        retryingRunId=""
        sendingReportId="report-1"
        onGenerate={vi.fn()}
        onRetry={vi.fn()}
        onSend={vi.fn()}
      />,
    );

    expect(markup).toContain('Sending…');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('disabled=""');
  });
});
