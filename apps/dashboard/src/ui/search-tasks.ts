import type { ActionSetting } from '@sidekick/core';
import { normalizeSearch } from './search';
import type { SearchItem } from './search-catalog';
import type { SchedulePrefill } from './ScheduleEditor';
import { reportName } from './beginner-flow';

export type SearchTask =
  | {
      type: 'delivery';
      automatic: boolean;
      channel?: ActionSetting['channel'];
      kind?: ActionSetting['kind'];
    }
  | { type: 'schedule'; prefill: SchedulePrefill };
const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
/** Interpret a small supported task vocabulary locally; retain negation and never execute a query. */
export function taskSearchItems(input: string): SearchItem[] {
  const query = normalizeSearch(input.slice(0, 120));
  if (
    /\b(why|failed|failure|broken|didnt|did not|hasnt|has not|wont|will not)\b/.test(query) &&
    /\b(send|sent|sending|deliver|delivery)\b/.test(query)
  )
    return [
      {
        id: 'task:delivery-help',
        title: 'Find out why a report did not send',
        description: 'Read the delivery checklist, then inspect the saved attempt.',
        location: 'Help & FAQ',
        kind: 'Help',
        aliases: '',
        destination: { section: 'Help', helpId: 'delivery' },
      },
    ];
  if (/\b(dont stop|do not stop|dont disable|do not disable|except|unless)\b/.test(query))
    return [];
  // Compound channels and non-weekly cadence need explicit choices, not a narrowed proposal.
  const channels: ActionSetting['channel'][] = [];
  if (/\b(emails?|mail)\b/.test(query)) channels.push('email');
  if (/\b(sms|texts?)\b/.test(query)) channels.push('sms');
  if (/\b(imessage|imsg)\b/.test(query)) channels.push('imessage');
  if (channels.length > 1) return [];
  const channel = channels[0];
  const negative = /\b(stop|disable|pause|off|dont|not|never)\b/.test(query);
  const positive = /\b(enable|start|on)\b/.test(query);
  if (negative && positive) return [];
  const delivery =
    /\b(email|emails|message|messages|text|texts|sms|imessage|imsg|delivery|sending|send)\b/.test(
      query,
    );
  const kinds: [RegExp, ActionSetting['kind']][] = [
    [/\b(rankings?|power rankings?)\b/, 'power-rankings'],
    [/\b(matchups?|previews?)\b/, 'matchup-preview'],
    [/\boffseason\b/, 'offseason-update'],
    [/\bdraft hype\b/, 'draft-hype'],
    [/\bdraft review\b/, 'draft-review'],
  ];
  const matches = kinds.filter(([pattern]) => pattern.test(query));
  if (matches.length > 1) return [];
  const weekdays = days
    .map((day, index) => (new RegExp(`\\b${day}s?\\b`).test(query) ? index : -1))
    .filter((day) => day >= 0);
  if (
    !negative &&
    matches.length === 1 &&
    (/\b(schedule|every|weekly|daily|monthly|yearly|annually|biweekly|fortnightly|tomorrow|today|tonight|once|alternate)\b/.test(
      query,
    ) ||
      weekdays.length > 0)
  ) {
    if (
      /\b(daily|monthly|yearly|annually|biweekly|fortnightly|tomorrow|today|tonight|once|one time|every day|every month|every year|every other|alternate)\b/.test(
        query,
      )
    )
      return [
        {
          id: 'page:schedule-timing',
          title: /\b(monthly|every month)\b/.test(query)
            ? 'Open Schedule to choose monthly'
            : /\b(daily|every day)\b/.test(query)
              ? 'Open Schedule to choose daily'
              : 'Open Schedule to choose the timing',
          description: `Search can propose weekly timing. Edit ${reportName(matches[0]![1]).toLowerCase()} in Schedule to choose daily, monthly, or one-time timing. Nothing changes until you save.`,
          location: 'Schedule',
          kind: 'Page',
          aliases: '',
          destination: { section: 'Schedule' },
        },
      ];
    const clocks = [...query.matchAll(/\b(?:at )?(1[0-2]|0?[1-9])(?: (\d{2}))? ?(am|pm)\b/g)];
    const clock = clocks.length === 1 ? clocks[0] : undefined;
    // A search may omit or ambiguously specify timing; the editor keeps a visible existing default.
    const time = clock
      ? `${String((Number(clock[1]) % 12) + (clock[3] === 'pm' ? 12 : 0)).padStart(2, '0')}:${clock[2] ?? '00'}`
      : undefined;
    return [
      {
        id: 'task:schedule',
        title: 'Set up a report schedule',
        description:
          'Review a proposed schedule. Missing or ambiguous details need your choice; nothing saves or sends yet.',
        location: 'Schedule',
        kind: 'Task',
        aliases: '',
        destination: {
          section: 'Schedule',
          task: {
            type: 'schedule',
            prefill: {
              kind: matches[0]![1],
              ...(weekdays.length === 1 ? { weekday: weekdays[0] } : {}),
              ...(time && Number(clock?.[2] ?? 0) < 60 ? { time } : {}),
              ...(channel ? { channel } : {}),
              requestedSend: /\b(send|email|text)\b/.test(query),
            },
          },
        },
      },
    ];
  }
  if (
    delivery &&
    (negative || positive) &&
    (negative || /\b(automatic|automatically)\b/.test(query))
  ) {
    return [
      {
        id: 'task:delivery',
        title: negative
          ? 'Stop automatic report delivery'
          : 'Review enabling automatic report delivery',
        description: negative
          ? 'See affected schedules and confirm review-before-send mode.'
          : 'Check schedules and recipients before allowing automatic sending.',
        location: channel ?? 'All delivery channels',
        kind: 'Task',
        aliases: '',
        destination: {
          section: 'Schedule',
          task: {
            type: 'delivery',
            automatic: !negative,
            ...(channel ? { channel } : {}),
            ...(matches.length === 1 ? { kind: matches[0]![1] } : {}),
          },
        },
      },
    ];
  }
  return [];
}
