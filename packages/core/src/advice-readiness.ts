import type { AdviceRequest, FootballDataSource, PlayerAdviceEvidence } from './advice-types.js';
import type { LeagueConnection } from './domain-types.js';
import { leagueSyncFreshness } from './league-status.js';
import { weeklyGameWithheldWarning } from './advice-warnings.js';
export interface AdviceDataReadiness {
  checkedAt: string;
  status: 'ready' | 'limited' | 'blocked';
  projectionKnown: number;
  projectionTotal: number;
  currentInjuryReports: number;
  injuryPlayers: number;
  injuryReports: { playerId: string; updatedAt?: string; validUntil?: string; coverage: string }[];
  items: { name: string; state: 'current' | 'stale' | 'unknown' | 'missing'; detail: string }[];
}
const object = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === 'object' && !Array.isArray(x);
const text = (x: unknown, max: number): x is string =>
  typeof x === 'string' && x.length <= max && !/[\u0000-\u001f]/.test(x);
const timestamp = (x: unknown): x is string =>
  text(x, 40) && /(?:Z|[+-]\d\d:\d\d)$/.test(x) && Number.isFinite(Date.parse(x));
export function isAdviceDataReadiness(x: unknown): x is AdviceDataReadiness {
  return (
    object(x) &&
    timestamp(x.checkedAt) &&
    ['ready', 'limited', 'blocked'].includes(String(x.status)) &&
    ['projectionKnown', 'projectionTotal', 'currentInjuryReports', 'injuryPlayers'].every(
      (k) => Number.isInteger(x[k]) && Number(x[k]) >= 0 && Number(x[k]) <= 500,
    ) &&
    Number(x.projectionKnown) <= Number(x.projectionTotal) &&
    Number(x.currentInjuryReports) <= Number(x.injuryPlayers) &&
    Array.isArray(x.injuryReports) &&
    x.injuryReports.length <= 500 &&
    x.injuryReports.length === x.injuryPlayers &&
    x.injuryReports.filter((r) => object(r) && r.coverage === 'current').length ===
      x.currentInjuryReports &&
    x.injuryReports.every(
      (r) =>
        object(r) &&
        text(r.playerId, 256) &&
        [
          'current',
          'week-window',
          'undated',
          'stale',
          'unmatched',
          'ambiguous',
          'unavailable',
        ].includes(String(r.coverage)) &&
        (r.coverage !== 'current' || timestamp(r.updatedAt)) &&
        // A week-window report has no publication time and is valid only until kickoff.
        (r.coverage !== 'week-window' ||
          (r.updatedAt === undefined &&
            timestamp(r.validUntil) &&
            Date.parse(r.validUntil) > Date.parse(String(x.checkedAt)))) &&
        (r.validUntil === undefined || r.coverage === 'week-window') &&
        (r.updatedAt === undefined ||
          (timestamp(r.updatedAt) && Date.parse(r.updatedAt) <= Date.parse(String(x.checkedAt)))),
    ) &&
    Array.isArray(x.items) &&
    x.items.length <= 100 &&
    x.items.every(
      (i) =>
        object(i) &&
        text(i.name, 180) &&
        text(i.detail, 1000) &&
        ['current', 'stale', 'unknown', 'missing'].includes(String(i.state)),
    )
  );
}
export function buildAdviceReadiness({
  request,
  league,
  players,
  sources,
  injuries,
  asOf,
  staleHours = 24,
}: {
  request: AdviceRequest;
  league: LeagueConnection | undefined;
  players: PlayerAdviceEvidence[];
  sources: FootballDataSource[];
  injuries: AdviceDataReadiness['injuryReports'];
  asOf: string;
  staleHours?: number;
}): AdviceDataReadiness {
  const scope =
    request.mode === 'trade'
      ? 'remaining-season'
      : ['draft-plan', 'draft-review'].includes(request.mode)
        ? 'season'
        : 'week';
  const considered = players.filter((p) => !/^(out|ir|inactive|suspended)$/i.test(p.status ?? ''));
  const known = considered.filter(
    (p) => p.projectedPoints !== undefined && p.projectionScope === scope,
  ).length;
  const alreadyPlayed =
    scope === 'week'
      ? considered.filter(
          (p) => p.projectedPoints === undefined && p.warnings.includes(weeklyGameWithheldWarning),
        ).length
      : 0;
  const freshness = league
    ? leagueSyncFreshness(league, Date.parse(asOf), staleHours * 3600000)
    : 'unknown';
  const items: AdviceDataReadiness['items'] = [];
  if (request.mode !== 'betting')
    items.push({
      name: 'Roster snapshot',
      state: freshness === 'fresh' ? 'current' : freshness,
      detail: league?.lastSyncedAt
        ? `Last updated ${league.lastSyncedAt}. Refresh after roster moves.`
        : 'No update time recorded. Refresh your league.',
    });
  if (request.mode !== 'betting')
    items.push({
      name: 'Projection coverage',
      state: known === considered.length && known > 0 ? 'current' : 'missing',
      detail: `${known} of ${considered.length} active players have a ${scope} estimate under your league’s scoring.${alreadyPlayed ? ` ${alreadyPlayed} ${alreadyPlayed === 1 ? 'player’s game has' : 'players’ games have'} already started or finished this week.` : ''} Players without one are left out of the math.`,
    });
  const current = injuries.filter((r) => r.coverage === 'current').length;
  const weekly = injuries.filter((r) => r.coverage === 'week-window').length;
  if (injuries.length)
    items.push({
      name: 'Injury report coverage',
      state: current + weekly === injuries.length ? 'current' : 'unknown',
      detail: `${current} of ${injuries.length} players have a dated injury report.${weekly ? ` ${weekly} ${weekly === 1 ? 'has' : 'have'} this week’s report without an update time from the source, treated as current until their team kicks off.` : ''} No report doesn’t mean healthy, and practicing doesn’t guarantee playing.`,
    });
  // Many sources differ only by season, week or game; group them so coverage stays readable.
  const rank = { missing: 3, stale: 2, unknown: 1, current: 0 } as const;
  const groups = new Map<
    string,
    { name: string; state: keyof typeof rank; count: number; latest?: string; unknownTime: boolean }
  >();
  for (const source of sources) {
    const retrieved = source.retrievedAt ? Date.parse(source.retrievedAt) : NaN;
    const state: keyof typeof rank =
      source.status !== 'available'
        ? 'missing'
        : !Number.isFinite(retrieved) || retrieved > Date.parse(asOf)
          ? 'unknown'
          : Date.parse(asOf) - retrieved > 36 * 3600000
            ? 'stale'
            : 'current';
    const name = sourceGroupName(source.name);
    const group = groups.get(name) ?? { name, state, count: 0, unknownTime: false };
    group.count += 1;
    if (rank[state] > rank[group.state]) group.state = state;
    if (!source.retrievedAt) group.unknownTime = true;
    else if (!group.latest || source.retrievedAt > group.latest) group.latest = source.retrievedAt;
    groups.set(name, group);
  }
  for (const group of [...groups.values()].slice(0, 30))
    items.push({
      name: `${group.name}${group.count > 1 ? ` (${group.count} files)` : ''}`.slice(0, 180),
      state: group.state,
      detail: `${group.latest ? `Downloaded ${group.latest}` : 'Download time unknown'}${group.unknownTime && group.latest ? ' (some times unknown)' : ''}. That’s when the app fetched it, not when the source last changed.`,
    });
  return {
    checkedAt: asOf,
    status: items.some((i) => i.state !== 'current') ? 'limited' : 'ready',
    projectionKnown: known,
    projectionTotal: considered.length,
    currentInjuryReports: current,
    injuryPlayers: injuries.length,
    injuryReports: injuries,
    items,
  };
}

/** Drops season, week, page and single-game qualifiers so per-file sources share one readiness row. */
function sourceGroupName(name: string): string {
  return (
    name
      .replace(/\bESPN [A-Z]{2,3} at [A-Z]{2,3}, \d{4}-\d{2}-\d{2}/g, 'ESPN game summaries')
      .replace(/\b(?:19|20)\d{2}\b/g, '')
      .replace(/\bweek \d{1,2}\b/gi, '')
      .replace(/\s*·\s*page \d+\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([),:])/g, '$1')
      .replace(/\(\s*\)/g, '')
      .trim() || name
  );
}
