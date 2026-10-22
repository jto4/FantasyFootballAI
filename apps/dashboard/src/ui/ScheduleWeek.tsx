import { nextSchedule, type AppSettings } from '@sidekick/core';
import { reportName } from './beginner-flow';

type Action = AppSettings['actions'][number];
const dayMs = 86_400_000;

/** Planned runs in the next seven days, earliest first. Repeats nextSchedule from each run. */
export function upcomingRuns(actions: Action[], now = new Date()) {
  const end = now.getTime() + 7 * dayMs;
  const runs: { at: number; action: Action }[] = [];
  for (const action of actions) {
    if (!action.enabled || action.leagueIds?.length === 0) continue;
    let from = now;
    // A daily schedule has at most eight runs in the window; the cap guards a bad schedule.
    for (let guard = 0; guard < 8; guard++) {
      const plan = nextSchedule(action.schedule, from);
      if (plan.status !== 'scheduled' || plan.at === undefined || plan.at > end) break;
      runs.push({ at: plan.at, action });
      if (action.schedule.frequency === 'once') break;
      from = new Date(plan.at + 1);
    }
  }
  return runs.sort((a, b) => a.at - b.at);
}

/** Seven-day strip so the week's automatic work is visible without opening each card. */
export function ScheduleWeek({ actions, now = new Date() }: { actions: Action[]; now?: Date }) {
  const runs = upcomingRuns(actions, now);
  const dayKey = (time: number) => new Date(time).toDateString();
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + index);
    return date;
  });
  const dayLabel = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
  const dateLabel = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  const timeLabel = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  return (
    <section className="schedule-week" aria-labelledby="schedule-week-title">
      <h2 id="schedule-week-title">Next 7 days</h2>
      {runs.length === 0 ? (
        <p className="schedule-week-empty">
          Nothing is scheduled this week. Reports you create yourself still save as drafts.
        </p>
      ) : (
        <ol>
          {days.map((day, index) => {
            const today = runs.filter((run) => dayKey(run.at) === day.toDateString());
            return (
              <li key={day.toISOString()} className={today.length ? 'has-runs' : undefined}>
                <span className="schedule-week-day">
                  <strong>{index === 0 ? 'Today' : dayLabel.format(day)}</strong>
                  <small>{dateLabel.format(day)}</small>
                </span>
                {today.length ? (
                  <ul>
                    {today.map((run) => (
                      <li key={`${run.action.kind}-${run.at}`}>
                        <time dateTime={new Date(run.at).toISOString()}>
                          {timeLabel.format(run.at)}
                        </time>
                        <span>{reportName(run.action.kind)}</span>
                        <small>
                          {run.action.mode === 'automatic' && run.action.channel !== 'dashboard'
                            ? `Sends by ${run.action.channel}`
                            : 'Draft for review'}
                        </small>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <small className="schedule-week-none">No runs</small>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
