import { useState } from 'react';
import {
  isValidLocalDateTime,
  platformDraftCalendarSuggestions,
  type LeagueCalendarEvent,
  type LeagueConnection,
} from '@sidekick/core';
import { postDraftEventDraft } from './post-draft-event.js';
import { Trash2 } from 'lucide-react';

type LeagueCalendarSettingsProps = {
  leagues: LeagueConnection[];
  events: LeagueCalendarEvent[];
  actionNames: Record<string, string>;
  onAddEvent: (event: LeagueCalendarEvent) => void;
  onDeleteEvent: (eventId: string) => void;
  onNotice: (message: string) => void;
};

const reportKinds: LeagueCalendarEvent['kind'][] = [
  'offseason-update',
  'draft-hype',
  'draft-review',
  'power-rankings',
  'matchup-preview',
];

const timezonesForCalendar = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'UTC',
];

type CalendarDraft = Omit<LeagueCalendarEvent, 'id' | 'leagueId' | 'title'> & {
  leagueId: string;
  title: string;
};

function todayLocalDate(timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

/** Keep league event editing and platform draft-time suggestions together. */
export function LeagueCalendarSettings({
  leagues,
  events,
  actionNames,
  onAddEvent,
  onDeleteEvent,
  onNotice,
}: LeagueCalendarSettingsProps) {
  const [draft, setDraft] = useState<CalendarDraft>(() => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    return {
      leagueId: leagues[0]?.id ?? '',
      title: 'League milestone',
      kind: 'draft-hype',
      date: todayLocalDate(timezone),
      time: '09:00',
      timezone,
    };
  });
  const selectedLeague = leagues.find((league) => league.id === (draft.leagueId || leagues[0]?.id));
  const platformDraftStart = selectedLeague?.draft?.scheduledAt ?? selectedLeague?.draftScheduledAt;
  const suggestions = platformDraftStart
    ? platformDraftCalendarSuggestions(platformDraftStart, draft.timezone)
    : undefined;
  const draftHype = suggestions?.draftHype;
  const postDraftSuggestions = suggestions?.postDraftReview;
  const draftTimeSource =
    selectedLeague?.platform === 'sleeper'
      ? 'Sleeper'
      : selectedLeague?.platform === 'yahoo'
        ? 'Yahoo'
        : selectedLeague?.platform === 'espn'
          ? 'ESPN'
          : undefined;
  const hasUpcomingDraft =
    draftTimeSource !== undefined &&
    draftHype !== undefined &&
    Date.parse(platformDraftStart ?? '') > Date.now();

  function addEvent() {
    const leagueId = draft.leagueId || leagues[0]?.id;
    if (!leagueId || !draft.title.trim()) {
      onNotice('Choose a league and enter a calendar event name.');
      return;
    }
    if (!isValidLocalDateTime(draft.date, draft.time, draft.timezone)) {
      onNotice(
        'That local time does not occur on this date in the selected timezone. Choose another time.',
      );
      return;
    }
    if (events.length >= 500) {
      onNotice('The league calendar is full. Remove an event before adding another.');
      return;
    }
    onAddEvent({
      ...draft,
      id: window.crypto.randomUUID(),
      leagueId,
      title: draft.title.trim(),
    });
    onNotice('Calendar event added. Save Settings to activate it.');
  }

  function usePlatformDraftTime() {
    if (!draftHype || !draftTimeSource) return;
    setDraft((current) => ({
      ...current,
      title: 'Draft day hype',
      kind: 'draft-hype',
      date: draftHype.date,
      time: draftHype.time,
    }));
    onNotice(
      `Draft hype date and time prefilled from ${draftTimeSource}. Review them, add the event, then save Settings.`,
    );
  }

  function usePostDraftSuggestion(kind: 'draft-review' | 'power-rankings') {
    if (!postDraftSuggestions || !draftTimeSource) return;
    setDraft((current) => ({
      ...current,
      ...postDraftEventDraft(postDraftSuggestions, kind),
    }));
    const label = kind === 'draft-review' ? 'Post-draft review' : 'Post-draft power rankings';
    const suffix = kind === 'draft-review' ? ' at 9:00 AM' : '';
    onNotice(
      `${label} prefilled for the day after the ${draftTimeSource} draft${suffix}. Review the timing, add the event, then save Settings.`,
    );
  }

  return (
    <div className="news-source-settings">
      <h3>LEAGUE SEASON CALENDAR</h3>
      <p className="schedule-explainer">
        Add a draft day, season milestone, or other league date. At that time, Sidekick refreshes
        that league and saves the selected report as a draft. Calendar events never send messages.
      </p>
      {leagues.length ? (
        <>
          <div className="settings-fields two">
            <label>
              LEAGUE
              <select
                value={draft.leagueId || leagues[0]?.id || ''}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, leagueId: event.target.value }))
                }
              >
                {leagues.map((league) => (
                  <option key={league.id} value={league.id}>
                    {league.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              REPORT
              <select
                value={draft.kind}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    kind: event.target.value as LeagueCalendarEvent['kind'],
                  }))
                }
              >
                {reportKinds.map((kind) => (
                  <option key={kind} value={kind}>
                    {actionNames[kind]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              EVENT NAME
              <input
                value={draft.title}
                maxLength={120}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, title: event.target.value }))
                }
                placeholder="Draft night"
              />
            </label>
            <label>
              DATE
              <input
                type="date"
                min={todayLocalDate(draft.timezone)}
                value={draft.date}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, date: event.target.value }))
                }
              />
            </label>
            <label>
              TIME
              <input
                type="time"
                value={draft.time}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, time: event.target.value }))
                }
              />
            </label>
            <label>
              TIMEZONE
              <select
                value={draft.timezone}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, timezone: event.target.value }))
                }
              >
                {[...new Set([draft.timezone, ...timezonesForCalendar])].map((timezone) => (
                  <option key={timezone} value={timezone}>
                    {timezone}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button type="button" className="small-button" onClick={addEvent}>
            Add calendar event
          </button>
          {hasUpcomingDraft && draftHype && draftTimeSource && (
            <p className="schedule-explainer">
              {draftTimeSource} reports a draft at {draftHype.date} at {draftHype.time} (
              {draft.timezone}).{' '}
              <button type="button" className="text-button" onClick={usePlatformDraftTime}>
                Use platform draft time
              </button>
              {postDraftSuggestions && (
                <>
                  {' '}
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => usePostDraftSuggestion('draft-review')}
                  >
                    Suggest a review for the next day at 9:00 AM
                  </button>{' '}
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => usePostDraftSuggestion('power-rankings')}
                  >
                    Suggest post-draft power rankings for the next day
                  </button>
                </>
              )}
            </p>
          )}
        </>
      ) : (
        <small>Connect a league to create a season calendar.</small>
      )}
      {events.length > 0 && (
        <div className="safety-backup-list" aria-label="League calendar events">
          {events.map((event) => (
            <div className="safety-backup-row" key={event.id}>
              <div>
                <strong>{event.title}</strong>
                <small>
                  {leagues.find((league) => league.id === event.leagueId)?.displayName ??
                    'Disconnected league'}{' '}
                  · {actionNames[event.kind]} · {event.date} {event.time} {event.timezone}
                  {event.completedAt ? ' · complete' : ''}
                </small>
              </div>
              <button
                type="button"
                className="small-button danger"
                onClick={() => onDeleteEvent(event.id)}
                aria-label={`Remove ${event.title} calendar event`}
              >
                <Trash2 size={13} /> Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
