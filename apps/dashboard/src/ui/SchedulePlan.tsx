import { nextSchedule, type ActionSetting } from '@sidekick/core';
export function schedulePlanLabel(action: ActionSetting, now = new Date()) {
  if (!action.enabled || action.leagueIds?.length === 0) return 'No upcoming run';
  const plan = nextSchedule(action.schedule, now);
  if (plan.status === 'finished') return 'This one-time schedule is complete';
  if (plan.status === 'missed') return 'Missed date — choose a new time';
  if (plan.status === 'due') return 'Due today — the running app checks for it';
  if (plan.at === undefined) return 'No upcoming run';
  return `Next planned run: ${new Intl.DateTimeFormat(undefined, { timeZone: action.schedule.timezone, weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(plan.at)}`;
}
export function SchedulePlan({ action }: { action: ActionSetting }) {
  return <p className="schedule-next">{schedulePlanLabel(action)}</p>;
}
