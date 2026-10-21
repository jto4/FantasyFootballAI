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
  injuryReports: { playerId: string; updatedAt?: string; coverage: string }[];
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
        ['current', 'undated', 'stale', 'unmatched', 'ambiguous', 'unavailable'].includes(
          String(r.coverage),
        ) &&
        (r.coverage !== 'current' || timestamp(r.updatedAt)) &&
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
        ? `Snapshot ${league.lastSyncedAt}. Refresh after roster moves; a recent snapshot is not live ownership.`
        : 'No verified roster sync timestamp. Refresh your league.',
    });
  if (request.mode !== 'betting')
    items.push({
      name: 'Projection coverage',
      state: known === considered.length && known > 0 ? 'current' : 'missing',
      detail: `${known} of ${considered.length} considered active players have a scoring-matched ${scope} estimate.${alreadyPlayed ? ` ${alreadyPlayed} ${alreadyPlayed === 1 ? 'player’s game has' : 'players’ games have'} already started or finished this week, so no pregame estimate applies.` : ''} Missing estimates remain unknown.`,
    });
  const current = injuries.filter((r) => r.coverage === 'current').length;
  if (injuries.length)
    items.push({
      name: 'Dated injury coverage',
      state: current === injuries.length ? 'current' : 'unknown',
      detail: `${current} of ${injuries.length} players have a uniquely matched recent report. Missing, undated or conflicting reports do not establish health. Practice participation is not a playing guarantee.`,
    });
  for (const source of sources.slice(0, 30)) {
    const retrieved = source.retrievedAt ? Date.parse(source.retrievedAt) : NaN;
    const state =
      source.status !== 'available'
        ? 'missing'
        : !Number.isFinite(retrieved) || retrieved > Date.parse(asOf)
          ? 'unknown'
          : Date.parse(asOf) - retrieved > 36 * 3600000
            ? 'stale'
            : 'current';
    items.push({
      name: source.name.slice(0, 180),
      state,
      detail: `${source.retrievedAt ? `Retrieved ${source.retrievedAt}.` : 'Retrieval timestamp is unknown.'} Retrieval is not the source’s publication or injury-report update time.`,
    });
  }
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
