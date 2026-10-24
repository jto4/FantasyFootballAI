import React, { type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '../ui/app.css';
import '../ui/workflow.css';
import '../ui/appearance.css';
import '../ui/reports.css';
import '../ui/chat.css';
import { ApiError } from '../ui/api-client';
import { ConfirmHost, confirmAction, discardOptions } from '../ui/ConfirmDialog';
import { ErrorNotice } from '../ui/ErrorNotice';
import { FriendlyError } from '../ui/FriendlyError';
import { EmptyStatus, LoadError, LoadingStatus } from '../ui/LoadFeedback';
import { MatchupCard } from '../ui/MatchupCard';
import { NextUpCard } from '../ui/NextUpCard';
import { WaitStatus } from '../ui/WaitStatus';
import { WatchlistCard } from '../ui/WatchlistCard';
import { initializeTheme } from '../ui/theme';
import type { WeeklyBriefing } from '../ui/weekly-briefing';
import { alertsFixture, briefingFixture, stubApi } from './fixtures';

/*
 * Development-only gallery of UI states that are hard to reach in the live app: errors, slow
 * loads, long waits, confirmations and Home's top card in each state. Served by `npm run dev` at
 * /states.html and screenshot-tested by `npm run test:ui-states`; never part of the app build.
 */
initializeTheme();
stubApi();

const reference = '3f2a9c1e-1111-4222-8333-944455556666';
const noop = () => undefined;

function State({ name, title, children }: { name: string; title: string; children: ReactNode }) {
  return (
    <section className="states-item" data-state={name}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Gallery() {
  const home = (leagueId: string, briefing?: WeeklyBriefing, briefingError?: unknown) => (
    <NextUpCard
      leagueId={leagueId}
      teamId="team"
      briefing={briefing}
      briefingError={briefingError}
      onRetryBriefing={noop}
      stale={false}
      onAdvice={noop}
      onRefresh={noop}
      onLive={noop}
    />
  );
  return (
    <main className="states-gallery">
      <h1>UI states</h1>
      <h2>Errors</h2>
      <State name="error-plain" title="Plain error">
        <ErrorNotice error="Saved decisions could not be loaded. Open Advice to review them." />
      </State>
      <State name="error-retry-detail" title="Error with retry and support details">
        <ErrorNotice
          error={
            new ApiError(
              'The NFL data source did not respond.',
              502,
              'upstream_unavailable',
              reference,
            )
          }
          onRetry={noop}
        />
      </State>
      <State name="error-network" title="Local service unreachable">
        <ErrorNotice error={new TypeError('Failed to fetch')} onRetry={noop} />
      </State>
      <State name="error-load" title="LoadError (wraps ErrorNotice)">
        <LoadError message="Could not load profiles." onRetry={noop} />
      </State>
      <State name="error-friendly" title="FriendlyError with an action">
        <FriendlyError
          message="Report creation needs attention. Open Reports to check the saved request."
          detail="The provider timed out after 120 seconds."
          action="Open Reports"
          onAction={noop}
        />
      </State>
      <h2>Loading and empty</h2>
      <State name="loading-lines" title="Loading (lines)">
        <LoadingStatus message="Loading member profiles…" />
      </State>
      <State name="loading-cards" title="Loading (cards)">
        <LoadingStatus message="Pulling every prop for the week…" shape="cards" showElapsed />
      </State>
      <State name="empty" title="Empty">
        <EmptyStatus message="No reports yet. Create one from Home or Schedule." />
      </State>
      <h2>Long waits</h2>
      <State name="wait-normal" title="Analysis in progress">
        <WaitStatus
          label="Analyzing supported evidence, then reviewing the recommendation…"
          since={Date.now() - 23_000}
          typical="usually under a minute (two AI calls)"
          slowAfterSeconds={120}
          onCancel={noop}
          cancelLabel="Cancel analysis"
        />
      </State>
      <State name="wait-slow" title="Slower than usual">
        <WaitStatus
          label="Writing the report"
          since={Date.now() - 361_000}
          typical="usually 1–3 minutes"
          slowAfterSeconds={300}
          onCancel={noop}
        />
      </State>
      <State name="wait-canceling" title="Canceling">
        <WaitStatus label="Analyzing…" since={Date.now() - 41_000} onCancel={noop} canceling />
      </State>
      <h2>Home: Do this next</h2>
      <State name="home-checking" title="Still checking (never a false all-clear)">
        {home('pending')}
      </State>
      <State name="home-failed" title="Checks failed">
        {home(
          'failed',
          undefined,
          new ApiError(
            'The local service could not complete this request.',
            502,
            'upstream_unavailable',
            reference,
          ),
        )}
      </State>
      <State name="home-alert" title="Starter ruled out, with a replacement">
        {home('alert', briefingFixture)}
      </State>
      <State name="home-clear" title="All clear (only after both checks loaded)">
        {home('clear', {
          ...briefingFixture,
          lineup: { ...briefingFixture.lineup, changes: [] },
          waivers: [],
        })}
      </State>
      <h2>Watchlist</h2>
      <State name="watchlist" title="Watched players with projections and status">
        <WatchlistCard leagueId="league" teamId="team" count={3} onManage={noop} />
      </State>
      <State name="watchlist-empty" title="Empty watchlist">
        <WatchlistCard leagueId="league" teamId="team" count={0} onManage={noop} />
      </State>
      <h2>Matchup</h2>
      <State name="matchup" title="Win chance and likely ranges">
        <MatchupCard briefing={briefingFixture} />
      </State>
      <h2>Confirmations</h2>
      <State name="confirm-buttons" title="Open a confirmation">
        <div className="button-row">
          <button
            type="button"
            className="small-button"
            onClick={() =>
              void confirmAction('Your edits on this page haven’t been saved.', discardOptions)
            }
          >
            Discard changes
          </button>
          <button
            type="button"
            className="small-button"
            onClick={() =>
              void confirmAction('Export it first to keep a copy. Saved advice is kept.', {
                title: 'Clear the prediction track record?',
                confirmLabel: 'Clear track record',
                tone: 'danger',
              })
            }
          >
            Danger confirmation
          </button>
          <button
            type="button"
            className="small-button"
            onClick={() =>
              void confirmAction(
                'This creates 2 report drafts for review and will not send messages.',
                {
                  title: 'Retry 2 failed league results?',
                  confirmLabel: 'Retry as drafts',
                },
              )
            }
          >
            Plain confirmation
          </button>
          <button
            type="button"
            className="small-button"
            onClick={() => {
              const status = document.getElementById('confirm-results')!;
              status.textContent = '';
              for (const name of ['first', 'second'])
                void confirmAction(`The ${name} queued question.`, discardOptions).then(
                  (ok) => (status.textContent += `${name}:${ok} `),
                );
            }}
          >
            Queue two confirmations
          </button>
          <output id="confirm-results" />
        </div>
      </State>
      <ConfirmHost />
      <p hidden data-fixture-alerts={alertsFixture.alerts.length} />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Gallery />
  </React.StrictMode>,
);
