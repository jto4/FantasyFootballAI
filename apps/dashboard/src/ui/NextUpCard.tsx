import { record, type AdviceMode } from '@sidekick/core';
import { useApi } from './hooks/useApi';
import { formatDateTime } from './date-format';
import { describeError } from './error-text';
import type { WeeklyBriefing } from './weekly-briefing';

type Alerts = {
  alerts: {
    playerId: string;
    name: string;
    reason: 'out' | 'inactive' | 'doubtful' | 'bye';
    replacement?: { name: string; estimate: number };
  }[];
  nextKickoffAt?: string;
  snapshot?: { stale: boolean };
};
const isAlerts = (x: unknown): x is Alerts =>
  record(x) &&
  Array.isArray(x.alerts) &&
  x.alerts.every((a) => record(a) && typeof a.name === 'string') &&
  (x.nextKickoffAt === undefined || typeof x.nextKickoffAt === 'string');
const reasons = {
  out: 'is out',
  inactive: 'is inactive today',
  doubtful: 'is doubtful',
  bye: 'is on bye',
};
const swap = (r: { name: string; estimate: number } | undefined) =>
  r && typeof r.name === 'string' && Number.isFinite(r.estimate)
    ? ` Start ${r.name} instead (${r.estimate.toFixed(1)} projected).`
    : '';
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
  briefingError,
  onRetryBriefing,
  stale,
  onAdvice,
  onRefresh,
  onLive,
}: {
  leagueId: string;
  teamId: string;
  briefing: WeeklyBriefing | undefined;
  /** Set when the weekly briefing failed; undefined while it loads or once it has loaded. */
  briefingError?: unknown;
  onRetryBriefing?: () => void;
  stale: boolean;
  onAdvice: (mode: AdviceMode) => void;
  onRefresh: () => void;
  onLive: () => void;
}) {
  const {
    data: alerts,
    error: alertsError,
    reload: reloadAlerts,
  } = useApi(`/api/alerts?${new URLSearchParams({ league: leagueId, team: teamId })}`, isAlerts, {
    timeoutMs: 60_000,
  });
  const problem = alerts?.alerts[0];
  const change = briefing?.lineup.changes[0];
  // A claim costs a roster spot and waiver priority, so tiny gains don't make the top card.
  const pickup = briefing?.waivers.find((w) => w.gain >= 2);
  const next = alerts?.nextKickoffAt;
  const item = problem
    ? {
        tone: 'urgent',
        title: `${problem.name} ${reasons[problem.reason] ?? 'needs a look'}`,
        body:
          (alerts!.alerts.length > 1
            ? `${alerts!.alerts.length - 1} more starter${alerts!.alerts.length > 2 ? 's need' : ' needs'} a look too.`
            : 'They’re in your starting lineup.') + swap(problem.replacement),
        action: 'Fix my lineup',
        run: () => onAdvice('lineup'),
      }
    : stale || alerts?.snapshot?.stale
      ? {
          tone: 'warning',
          title: 'Your league data is out of date',
          body: 'Advice built on last week’s rosters is how dynasties end. Update it first.',
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
          : // Never claim all is well until both checks have actually come back.
            alertsError || briefingError
            ? {
                tone: 'warning',
                title: 'Couldn’t finish checking your lineup',
                body: alertsError
                  ? 'Injury and bye alerts for your starters didn’t load, so problems may be hidden.'
                  : 'This week’s lineup check didn’t load, so suggestions may be missing.',
                error: alertsError || briefingError,
                action: 'Check again',
                run: () => {
                  if (alertsError) reloadAlerts();
                  if (briefingError) onRetryBriefing?.();
                },
              }
            : !alerts || !briefing
              ? {
                  tone: 'pending',
                  title: 'Checking your starters…',
                  body: 'Looking at injuries, byes and your best lineup. This can take a moment after the app starts.',
                }
              : {
                  tone: 'calm',
                  title: 'You’re set for this week. Go touch grass until kickoff.',
                  body: next ? `Next kickoff ${formatDateTime(next)}.` : 'Nothing needs attention.',
                  action: 'Follow live',
                  run: onLive,
                };
  const card: {
    tone: string;
    title: string;
    body: string;
    action?: string;
    run?: () => void;
    error?: unknown;
  } = item;
  const detail = card.error ? describeError(card.error).detail : undefined;
  return (
    <section
      className={`next-up ${card.tone}`}
      aria-label="Do this next"
      aria-busy={card.tone === 'pending' || undefined}
    >
      <div>
        <p className="section-overline">DO THIS NEXT</p>
        <h3 role={card.tone === 'pending' ? 'status' : undefined}>{card.title}</h3>
        <p>{card.body}</p>
        {detail && (
          <details className="next-up-detail">
            <summary>Details for support</summary>
            <p>{detail}</p>
          </details>
        )}
      </div>
      {card.action && card.run && (
        <button type="button" className="primary-button" onClick={card.run}>
          {card.action}
        </button>
      )}
    </section>
  );
}
