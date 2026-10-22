import { nextSchedule, type AppSettings } from '@sidekick/core';
import { reportName } from './beginner-flow';
import { useMediaQuery } from './hooks/useMediaQuery';

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
export function ScheduleWeek({
  actions,
  now = new Date(),
  onSetUp,
}: {
  actions: Action[];
  now?: Date;
  onSetUp?: (() => void) | undefined;
}) {
  const runs = upcomingRuns(actions, now);
  const dayKey = (time: number) => new Date(time).toDateString();
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + index);
    return date;
  });
  // Desktop shows the week as seven columns; narrow windows collapse consecutive quiet days
  // into one line ("Thu–Mon · Nothing scheduled").
  const wide = useMediaQuery('(min-width: 1000px)');
  const segments: { days: { date: Date; index: number }[]; runs: typeof runs }[] = [];
  days.forEach((date, index) => {
    const dayRuns = runs.filter((run) => dayKey(run.at) === date.toDateString());
    const previous = segments[segments.length - 1];
    if (!wide && !dayRuns.length && previous && !previous.runs.length)
      previous.days.push({ date, index });
    else segments.push({ days: [{ date, index }], runs: dayRuns });
  });
  const dayLabel = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
  const dateLabel = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  const timeLabel = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  return (
    <section
      className={`schedule-week${wide ? ' wide' : ''}`}
      aria-labelledby="schedule-week-title"
    >
      <h2 id="schedule-week-title">Next 7 days</h2>
      {runs.length === 0 ? (
        <p className="schedule-week-empty">
          Nothing is scheduled this week. Reports you create yourself still save as drafts.{' '}
          {onSetUp && (
            <button type="button" className="text-button" onClick={onSetUp}>
              Schedule weekly reports →
            </button>
          )}
        </p>
      ) : (
        <ol>
          {segments.map((segment) => {
            const first = segment.days[0]!;
            const last = segment.days[segment.days.length - 1]!;
            const label = (day: { date: Date; index: number }) =>
              day.index === 0 ? 'Today' : dayLabel.format(day.date);
            return (
              <li
                key={first.date.toISOString()}
                className={segment.runs.length ? 'has-runs' : 'quiet'}
              >
                <span className="schedule-week-day">
                  <strong>
                    {label(first)}
                    {segment.days.length > 1 ? `–${label(last)}` : ''}
                  </strong>
                  <small>
                    {dateLabel.format(first.date)}
                    {segment.days.length > 1 ? `–${dateLabel.format(last.date)}` : ''}
                  </small>
                </span>
                {segment.runs.length ? (
                  <ul>
                    {segment.runs.map((run) => (
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
                  <small className="schedule-week-none">Nothing scheduled</small>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
