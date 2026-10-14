import type { ActionSetting, ReportKind } from '@sidekick/core';
import { timezoneLabel } from './timezone-label';

export const reportChoices: { kind: ReportKind; title: string; description: string }[] = [
  {
    kind: 'power-rankings',
    title: 'Power rankings',
    description: 'Who is on top, with commentary on the standings.',
  },
  {
    kind: 'matchup-preview',
    title: 'Matchup preview',
    description: 'Set the stage for this week’s matchups.',
  },
  {
    kind: 'offseason-update',
    title: 'Offseason update',
    description: 'Keep the league talking between seasons.',
  },
  {
    kind: 'draft-hype',
    title: 'Draft day hype',
    description: 'Build excitement before the fantasy draft.',
  },
  {
    kind: 'draft-review',
    title: 'Draft review',
    description: 'Look back at the draft and the new rosters.',
  },
];
export function reportName(kind: string) {
  return reportChoices.find((choice) => choice.kind === kind)?.title ?? kind.replaceAll('-', ' ');
}
export function scheduleSummary(action: ActionSetting, leagueNames: string[]) {
  if (!action.enabled || !action.schedule.enabled)
    return 'No scheduled reports. You can create a draft whenever you like.';
  const schedule = action.schedule;
  const cadence =
    schedule.frequency === 'once'
      ? `on ${schedule.date || 'your chosen date'}`
      : schedule.frequency === 'daily'
        ? 'every day'
        : schedule.frequency === 'monthly'
          ? `on day ${schedule.dayOfMonth} of each month`
          : `every ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][schedule.weekday]}`;
  const scope =
    action.leagueIds === undefined
      ? 'all connected leagues'
      : leagueNames.length
        ? leagueNames.join(', ')
        : 'no leagues (choose a league below)';
  return `${reportName(action.kind)} ${cadence} at ${schedule.time} (${timezoneLabel(schedule.timezone)}) for ${scope}. ${action.mode === 'automatic' && action.channel !== 'dashboard' ? `Sends automatically by ${action.channel === 'sms' ? 'text message' : action.channel}.` : 'Saves a draft for you to review; nothing is sent.'}${schedule.completedAt ? ' This one-time schedule has finished.' : ''} The app must be running at the scheduled time.`;
}
