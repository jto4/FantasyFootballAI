import { useEffect, useState } from 'react';
import { record, type AdviceMode } from '@sidekick/core';
import { requestJson } from './api-client';
import { formatDateTime } from './date-format';
import type { WeeklyBriefing } from './weekly-briefing';

type Alerts = {
  alerts: { playerId: string; name: string; reason: 'out' | 'doubtful' | 'bye' }[];
  nextKickoffAt?: string;
  snapshot?: { stale: boolean };
};
const isAlerts = (x: unknown): x is Alerts =>
  record(x) &&
  Array.isArray(x.alerts) &&
  x.alerts.every((a) => record(a) && typeof a.name === 'string') &&
  (x.nextKickoffAt === undefined || typeof x.nextKickoffAt === 'string');
const reasons = { out: 'is out', doubtful: 'is doubtful', bye: 'is on bye' };
const points = (n: number) =>
  `+${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(n)}`;

/**
 * The single most important thing to do this week, chosen in order: a starter problem, stale
 * league data, a better lineup, a waiver pickup, then "you're set" with the next kickoff.
 */
export function NextUpCard({
  leagueId,
  teamId,
  briefing,
  stale,
  onAdvice,
  onRefresh,
  onLive,
}: {
  leagueId: string;
  teamId: string;
  briefing: WeeklyBriefing | undefined;
  stale: boolean;
  onAdvice: (mode: AdviceMode) => void;
  onRefresh: () => void;
  onLive: () => void;
}) {
  const [alerts, setAlerts] = useState<Alerts>();
  useEffect(() => {
    const controller = new AbortController();
    requestJson(
      `/api/alerts?${new URLSearchParams({ league: leagueId, team: teamId })}`,
      isAlerts,
      {
        signal: controller.signal,
      },
      60_000,
    )
      .then((value) => !controller.signal.aborted && setAlerts(value))
      .catch(() => undefined);
    return () => controller.abort();
  }, [leagueId, teamId]);
  const problem = alerts?.alerts[0];
  const change = briefing?.lineup.changes[0];
  const pickup = briefing?.waivers[0];
  const next = alerts?.nextKickoffAt;
  const item = problem
    ? {
        tone: 'urgent',
        title: `${problem.name} ${reasons[problem.reason]}`,
        body:
          alerts!.alerts.length > 1
            ? `${alerts!.alerts.length - 1} more starter${alerts!.alerts.length > 2 ? 's need' : ' needs'} a look too.`
            : 'They’re in your starting lineup.',
        action: 'Fix my lineup',
        run: () => onAdvice('lineup'),
      }
    : stale || alerts?.snapshot?.stale
      ? {
          tone: 'warning',
          title: 'Your league data is out of date',
          body: 'Update it before trusting this week’s advice.',
          action: 'Update league',
          run: onRefresh,
        }
      : change
        ? {
            tone: 'action',
            title: `Start ${change.start.name}${change.bench ? ` over ${change.bench.name}` : ''}`,
            body: `${change.slot} · estimated ${points(change.start.points - (change.bench?.points ?? 0))} points this week.`,
            action: 'Review lineup',
            run: () => onAdvice('lineup'),
          }
        : pickup
          ? {
              tone: 'action',
              title: `Add ${pickup.name}`,
              body: `${pickup.position} · would raise your best lineup by ${points(pickup.gain)}.`,
              action: 'See waiver pickups',
              run: () => onAdvice('waivers'),
            }
          : {
              tone: 'calm',
              title: 'You’re set for this week',
              body: next ? `Next kickoff ${formatDateTime(next)}.` : 'Nothing needs attention.',
              action: 'Follow live',
              run: onLive,
            };
  return (
    <section className={`next-up ${item.tone}`} aria-label="Do this next">
      <div>
        <p className="section-overline">DO THIS NEXT</p>
        <h3>{item.title}</h3>
        <p>{item.body}</p>
      </div>
      <button type="button" className="primary-button" onClick={item.run}>
        {item.action}
      </button>
    </section>
  );
}
