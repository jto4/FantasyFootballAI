import type { LeagueConnection, PlayerProjection } from '@sidekick/core';
import { asRecord, boundedInteger, numberOrUndefined } from './platforms/shared.js';

/** Keep publisher-applied estimates separate from historical scoring/model forecasts.
 * A weekly total is usable only when both its applied components and the exact
 * league's position-specific scoring independently reproduce the published total. */
export function espnSnapshotWeeklyProjections(
  raw: unknown,
  league: LeagueConnection,
  importedAt: string,
): PlayerProjection[] {
  const data = asRecord(raw),
    settings = asRecord(data?.settings),
    scoring = asRecord(settings?.scoringSettings),
    status = asRecord(data?.status);
  const week = boundedInteger(status?.currentScoringPeriod ?? status?.currentMatchupPeriod, 1, 18);
  if (
    !data ||
    String(data.id) !== league.id ||
    data.seasonId !== league.season ||
    !week ||
    !Array.isArray(data.teams) ||
    !Array.isArray(scoring?.scoringItems) ||
    !Number.isFinite(Date.parse(importedAt))
  )
    return [];
  const rules = new Map<string, Record<string, unknown>>();
  for (const value of scoring.scoringItems) {
    const r = asRecord(value);
    if (!r || typeof r.statId !== 'number' || rules.has(String(r.statId)) || rules.size >= 500)
      return [];
    rules.set(String(r.statId), r);
  }
  const projections: PlayerProjection[] = [];
  for (const teamValue of data.teams) {
    const team = asRecord(teamValue),
      roster = asRecord(team?.roster);
    if (!Array.isArray(roster?.entries)) continue;
    for (const entryValue of roster.entries) {
      const entry = asRecord(entryValue),
        pool = asRecord(entry?.playerPoolEntry),
        player = asRecord(pool?.player);
      const canonical = league.teams
        .find((t) => t.id === String(team?.id))
        ?.roster?.find((p) => p.id === String(entry?.playerId));
      if (
        !canonical ||
        !player ||
        String(player.id ?? entry?.playerId) !== canonical.id ||
        player.fullName !== canonical.name ||
        !Array.isArray(player.stats)
      )
        continue;
      const rows = player.stats
        .map(asRecord)
        .filter(
          (r): r is Record<string, unknown> =>
            !!r &&
            r.seasonId === league.season &&
            r.scoringPeriodId === week &&
            r.statSourceId === 1 &&
            r.statSplitTypeId === 1,
        );
      if (rows.length !== 1) continue;
      const row = rows[0]!,
        stats = asRecord(row.stats),
        applied = asRecord(row.appliedStats),
        total = numberOrUndefined(row.appliedTotal);
      if (
        !stats ||
        !applied ||
        total === undefined ||
        total < 0 ||
        total > 200 ||
        Object.keys(stats).length > 500 ||
        Object.keys(applied).length > 500
      )
        continue;
      let expected = 0,
        appliedSum = 0,
        valid = true;
      for (const [key, value] of Object.entries(stats)) {
        const rule = rules.get(key);
        if (!rule) continue;
        if (typeof value !== 'number' || !Number.isFinite(value) || rule.isReverseItem === true) {
          valid = false;
          break;
        }
        const overrides = asRecord(rule.pointsOverrides),
          weight = numberOrUndefined(overrides?.[String(player.defaultPositionId)] ?? rule.points);
        if (weight === undefined) {
          valid = false;
          break;
        }
        expected += value * weight;
        const component = numberOrUndefined(applied[key] ?? 0);
        if (component === undefined || Math.abs(component - value * weight) > 0.0001) {
          valid = false;
          break;
        }
      }
      for (const [key, value] of Object.entries(applied)) {
        if (
          !rules.has(key) ||
          !Object.hasOwn(stats, key) ||
          typeof value !== 'number' ||
          !Number.isFinite(value)
        ) {
          valid = false;
          break;
        }
        appliedSum += value;
      }
      if (!valid || Math.abs(expected - total) > 0.0001 || Math.abs(appliedSum - total) > 0.0001)
        continue;
      projections.push({
        id: `espn-browser-${league.id}-${league.season}-${week}-${canonical.id}`,
        leagueId: league.id,
        sourceId: `espn-browser:${league.season}:${week}`,
        scoringMatched: true,
        playerId: canonical.id,
        playerName: canonical.name,
        ...(canonical.position ? { position: canonical.position } : {}),
        ...(canonical.nflTeam ? { nflTeam: canonical.nflTeam } : {}),
        projectedPoints: total,
        week,
        period: { season: league.season!, fromWeek: week, throughWeek: week },
        sourceName: 'ESPN league-applied weekly forecast (browser snapshot)',
        sourceUrl: 'https://fantasy.espn.com/football/',
        importedAt,
      });
    }
  }
  const counts = new Map<string, number>();
  for (const p of projections) counts.set(p.playerId!, 1 + (counts.get(p.playerId!) ?? 0));
  return projections.filter((p) => counts.get(p.playerId!) === 1);
}
