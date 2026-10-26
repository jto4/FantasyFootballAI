import type { WeeklyBriefing } from './weekly-briefing';

/** What Home remembers about this team's week, to say what changed on the next visit. */
export type VisitDigest = {
  at: string;
  week: number;
  projections: Record<string, { name: string; points: number }>;
  statuses: Record<string, { name: string; status: string }>;
  waivers: { id: string; name: string }[];
};

export function visitDigest(briefing: WeeklyBriefing, at: string): VisitDigest {
  const projections: VisitDigest['projections'] = {};
  for (const starter of briefing.matchup?.you.starters ?? [])
    if (starter.estimate !== undefined)
      projections[starter.id] = { name: starter.name, points: starter.estimate };
  const statuses: VisitDigest['statuses'] = {};
  for (const item of briefing.availability)
    statuses[item.id] = { name: item.name, status: item.status };
  return {
    at,
    week: briefing.week,
    projections,
    statuses,
    waivers: briefing.waivers.map((w) => ({ id: w.id, name: w.name })),
  };
}

/**
 * Changes worth a line since the last visit in the same week: starter projections that moved
 * two points or more, new or changed injury designations, and waiver targets someone has since
 * picked up. A new week starts fresh.
 */
export function visitChanges(
  previous: VisitDigest | undefined,
  current: VisitDigest,
  rostered: ReadonlySet<string>,
): string[] {
  if (!previous || previous.week !== current.week) return [];
  const lines: string[] = [];
  for (const [id, now] of Object.entries(current.projections)) {
    const before = previous.projections[id];
    if (before && Math.abs(now.points - before.points) >= 2)
      lines.push(
        `${now.name}: projection ${now.points > before.points ? 'up' : 'down'} ${Math.abs(now.points - before.points).toFixed(1)} to ${now.points.toFixed(1)}`,
      );
  }
  for (const [id, now] of Object.entries(current.statuses)) {
    const before = previous.statuses[id]?.status;
    if (before !== now.status && now.status !== 'No game designation')
      lines.push(`${now.name}: ${before ? `${before} → ` : 'now '}${now.status}`);
  }
  for (const target of previous.waivers)
    if (rostered.has(target.id)) lines.push(`${target.name} was picked up`);
  return lines.slice(0, 8);
}

const key = (leagueId: string, teamId: string) => `sidekick.lastVisit.v1:${leagueId}:${teamId}`;
export function readVisit(leagueId: string, teamId: string): VisitDigest | undefined {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key(leagueId, teamId)) ?? 'null');
    return value && typeof value === 'object' && 'week' in value && 'projections' in value
      ? (value as VisitDigest)
      : undefined;
  } catch {
    return undefined;
  }
}
export function saveVisit(leagueId: string, teamId: string, digest: VisitDigest) {
  try {
    localStorage.setItem(key(leagueId, teamId), JSON.stringify(digest));
  } catch {
    // A convenience only; Home works without it.
  }
}
