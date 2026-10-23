import type { ActionSetting, LeagueConnection } from '@sidekick/core';
import { scheduleRecommendations } from '@sidekick/core';
import { scheduleSummary } from './beginner-flow';
import { timezoneLabel } from './timezone-label';
import { useState } from 'react';
import { confirmAction } from './ConfirmDialog';

const actionNames: Record<string, string> = {
  'offseason-update': 'Offseason updates',
  'draft-hype': 'Draft day hype',
  'draft-review': 'Post-draft review',
  'power-rankings': 'Weekly power rankings',
  'matchup-preview': 'Matchup previews',
};

type Props = {
  actions: ActionSetting[];
  maximumSavedAgeHours?: number;
  confirmAutomatic?: boolean;
  showSummary?: boolean;
  leagues: LeagueConnection[];
  onApplySuggestions: () => void;
  onActionChange: (kind: ActionSetting['kind'], patch: Partial<ActionSetting>) => void;
  onScheduleChange: (
    kind: ActionSetting['kind'],
    patch: Partial<ActionSetting['schedule']>,
  ) => void;
  onActionLeague: (kind: ActionSetting['kind'], leagueId: string, included: boolean) => void;
};

export function AutomaticActionsSection({
  actions,
  maximumSavedAgeHours = 24,
  confirmAutomatic = true,
  showSummary = true,
  leagues,
  onApplySuggestions,
  onActionChange,
  onScheduleChange,
  onActionLeague,
}: Props) {
  // Keep configured custom zones available when a user tries another choice before saving.
  const [configuredTimezones] = useState(() => actions.map((action) => action.schedule.timezone));
  return (
    <>
      {actions.length > 1 && (
        <>
          <div className="settings-card-title">
            <div>
              <h2 data-search-target="automatic-actions" tabIndex={-1}>
                Automatic actions
              </h2>
              <p>Choose when each update runs, where it goes, and whether it needs review first.</p>
            </div>
            <button
              type="button"
              className="small-button"
              onClick={onApplySuggestions}
              aria-label="Apply suggested report schedules"
            >
              Use suggested times
            </button>
          </div>
          <small className="schedule-explainer">
            Suggested cadence: offseason updates on the{' '}
            {scheduleRecommendations['offseason-update']!.label} at 9:00 AM, power rankings on{' '}
            {scheduleRecommendations['power-rankings']!.label} at 9:00 AM, and matchup previews on{' '}
            {scheduleRecommendations['matchup-preview']!.label} at 9:00 AM. Each action keeps its
            current timezone, league scope, channel, and review or send policy.
          </small>
        </>
      )}
      <div className="action-settings">
        {actions.map((action) => {
          const schedule = action.schedule;
          const recommendation = scheduleRecommendations[action.kind];
          const timezones = [
            ...new Set([
              schedule.timezone,
              ...configuredTimezones,
              'America/New_York',
              'America/Chicago',
              'America/Denver',
              'America/Los_Angeles',
              'UTC',
            ]),
          ];
          return (
            <div className="action-block" key={action.kind}>
              {recommendation && (
                <button
                  type="button"
                  className="small-button schedule-preset"
                  onClick={() => {
                    onActionChange(action.kind, {
                      enabled: true,
                      mode: 'draft',
                      schedule: {
                        enabled: true,
                        frequency: recommendation.frequency,
                        weekday: recommendation.weekday ?? schedule.weekday,
                        dayOfMonth: recommendation.dayOfMonth ?? schedule.dayOfMonth ?? 1,
                        time: '09:00',
                        timezone: schedule.timezone,
                      },
                    });
                  }}
                >
                  Create {actionNames[action.kind]?.toLowerCase()}{' '}
                  {recommendation.frequency === 'monthly'
                    ? `on day ${recommendation.dayOfMonth} each month`
                    : `every ${recommendation.label}`}{' '}
                  at 9 AM
                </button>
              )}
              {showSummary && (
                <p className="schedule-summary">
                  {scheduleSummary(
                    action,
                    leagues
                      .filter((league) => action.leagueIds?.includes(league.id))
                      .map((league) => league.displayName),
                  )}
                </p>
              )}
              <div className="action-row">
                <strong>{actionNames[action.kind] ?? action.kind}</strong>
                <label className="switch-label">
                  <input
                    type="checkbox"
                    checked={action.enabled}
                    onChange={(event) =>
                      onActionChange(action.kind, { enabled: event.target.checked })
                    }
                  />
                  <span>Enabled</span>
                </label>
                <label className="action-delivery-field">
                  <span>Delivery channel</span>
                  <select
                    aria-label={`${actionNames[action.kind]} delivery channel`}
                    disabled={action.dataMode === 'saved'}
                    value={action.channel}
                    onChange={(event) =>
                      onActionChange(action.kind, {
                        channel: event.target.value as ActionSetting['channel'],
                      })
                    }
                  >
                    <option value="dashboard">Dashboard draft</option>
                    <option value="email">Email</option>
                    <option value="sms">SMS</option>
                    <option value="imessage">iMessage</option>
                  </select>
                </label>
                <label className="action-delivery-field">
                  <span>Delivery policy</span>
                  <select
                    aria-label={`${actionNames[action.kind]} delivery policy`}
                    disabled={action.dataMode === 'saved'}
                    value={action.mode}
                    onChange={async (event) => {
                      const mode = event.target.value as 'draft' | 'automatic';
                      if (
                        mode === 'automatic' &&
                        confirmAutomatic &&
                        !(await confirmAction(
                          `When this report is scheduled, it can send through the configured ${action.channel === 'sms' ? 'text message' : action.channel} destination without your review. Check the recipient in Delivery & access before saving.`,
                          {
                            title: `Enable automatic delivery for ${actionNames[action.kind]}?`,
                            confirmLabel: 'Enable automatic delivery',
                          },
                        ))
                      )
                        return;
                      onActionChange(action.kind, { mode });
                    }}
                  >
                    <option value="draft">Review before send</option>
                    <option value="automatic">Send automatically</option>
                  </select>
                </label>
              </div>
              <label className="action-delivery-field">
                <span>Report data</span>
                <select
                  aria-label={`${actionNames[action.kind]} report data`}
                  value={action.dataMode ?? 'refresh'}
                  onChange={(e) =>
                    onActionChange(
                      action.kind,
                      e.target.value === 'saved'
                        ? {
                            dataMode: 'saved',
                            mode: 'draft',
                            channel: 'dashboard',
                            leagueIds: action.leagueIds ?? leagues.map((l) => l.id),
                          }
                        : { dataMode: undefined },
                    )
                  }
                >
                  <option value="refresh">Refresh from platform</option>
                  <option value="saved" disabled={!leagues.length}>
                    Use saved data · drafts only
                  </option>
                </select>
              </label>
              {action.dataMode === 'saved' && (
                <p className="saved-data-guidance">
                  Uses data imported or synced within {maximumSavedAgeHours} hours. No live refresh
                  or automatic delivery. Import time does not verify the provider’s update time.
                </p>
              )}
              <div className="action-schedule">
                <label className="schedule-toggle">
                  <input
                    type="checkbox"
                    checked={schedule.enabled}
                    onChange={(event) =>
                      onScheduleChange(action.kind, { enabled: event.target.checked })
                    }
                  />
                  <span>Run on a schedule</span>
                </label>
                {schedule.enabled && (
                  <>
                    <div className="schedule-fields">
                      <label>
                        FREQUENCY
                        <select
                          value={schedule.frequency}
                          onChange={(event) =>
                            onScheduleChange(action.kind, {
                              frequency: event.target.value as
                                'daily' | 'weekly' | 'monthly' | 'once',
                            })
                          }
                        >
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                          <option value="daily">Daily</option>
                          <option value="once">One time</option>
                        </select>
                      </label>
                      {schedule.frequency === 'once' && (
                        <label>
                          EVENT DATE
                          <input
                            type="date"
                            required
                            min={todayLocalDate(schedule.timezone)}
                            value={schedule.date ?? ''}
                            onChange={(event) =>
                              onScheduleChange(action.kind, { date: event.target.value })
                            }
                          />
                        </label>
                      )}
                      {schedule.frequency === 'weekly' && (
                        <label>
                          DAY
                          <select
                            value={schedule.weekday}
                            onChange={(event) =>
                              onScheduleChange(action.kind, { weekday: Number(event.target.value) })
                            }
                          >
                            {[
                              'Sunday',
                              'Monday',
                              'Tuesday',
                              'Wednesday',
                              'Thursday',
                              'Friday',
                              'Saturday',
                            ].map((day, index) => (
                              <option key={day} value={index}>
                                {day}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {schedule.frequency === 'monthly' && (
                        <label>
                          DAY OF MONTH
                          <select
                            value={schedule.dayOfMonth}
                            onChange={(event) =>
                              onScheduleChange(action.kind, {
                                dayOfMonth: Number(event.target.value),
                              })
                            }
                          >
                            {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
                              <option key={day} value={day}>
                                {day}
                                {day % 100 >= 11 && day % 100 <= 13
                                  ? 'th'
                                  : day % 10 === 1
                                    ? 'st'
                                    : day % 10 === 2
                                      ? 'nd'
                                      : day % 10 === 3
                                        ? 'rd'
                                        : 'th'}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <label>
                        TIME
                        <input
                          type="time"
                          value={schedule.time}
                          onChange={(event) =>
                            onScheduleChange(action.kind, { time: event.target.value })
                          }
                        />
                      </label>
                      <label className="schedule-timezone">
                        <span>TIMEZONE</span>
                        <select
                          aria-label="TIMEZONE"
                          aria-describedby={`schedule-timezone-${action.kind}`}
                          value={schedule.timezone}
                          onChange={(event) =>
                            onScheduleChange(action.kind, { timezone: event.target.value })
                          }
                        >
                          {timezones.map((timezone) => (
                            <option key={timezone} value={timezone}>
                              {timezoneLabel(timezone)}
                            </option>
                          ))}
                        </select>
                        <small className="timezone-id" id={`schedule-timezone-${action.kind}`}>
                          Timezone ID: {schedule.timezone}
                        </small>
                      </label>
                    </div>
                    <div className="news-source-settings">
                      <h3>RUN FOR CONNECTED LEAGUES</h3>
                      {leagues.length ? (
                        leagues.map((league) => (
                          <label className="switch-label news-source-option" key={league.id}>
                            <input
                              type="checkbox"
                              aria-label={`Include ${league.displayName} in ${actionNames[action.kind]} schedule`}
                              checked={
                                action.leagueIds === undefined ||
                                action.leagueIds.includes(league.id)
                              }
                              onChange={(event) =>
                                onActionLeague(action.kind, league.id, event.target.checked)
                              }
                            />
                            {league.displayName}
                          </label>
                        ))
                      ) : (
                        <small>
                          Connect a league to choose which leagues receive this schedule.
                        </small>
                      )}
                      <small className="schedule-explainer">
                        Existing actions with no league selection continue to include every
                        connected league.
                      </small>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function todayLocalDate(timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
