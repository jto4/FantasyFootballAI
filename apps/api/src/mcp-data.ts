import type { LeagueConnection, SavedReport } from '@sidekick/core';

export interface McpReportSummary {
  id: string;
  leagueId: string;
  kind: SavedReport['kind'];
  createdAt: string;
  title: string;
  citations: SavedReport['citations'];
  status: SavedReport['status'];
  deliveryState?: SavedReport['deliveryState'];
}

export function summarizeLeagues(leagues: LeagueConnection[]) {
  return leagues.map(
    ({ id, platform, name, displayName, season, teamCount, status, lastSyncedAt }) => ({
      id,
      platform,
      name,
      displayName,
      ...(season !== undefined ? { season } : {}),
      teamCount,
      ...(status ? { status } : {}),
      ...(lastSyncedAt ? { lastSyncedAt } : {}),
    }),
  );
}

export function summarizeReports(
  reports: SavedReport[],
  leagueId: string | undefined,
  requestedLimit: number,
): McpReportSummary[] {
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(50, Math.trunc(requestedLimit)))
    : 10;
  return reports
    .filter((report) => !leagueId || report.leagueId === leagueId)
    .slice(0, limit)
    .map(
      ({
        id,
        leagueId: reportLeagueId,
        kind,
        createdAt,
        title,
        citations,
        status,
        deliveryState,
      }) => ({
        id,
        leagueId: reportLeagueId,
        kind,
        createdAt,
        title,
        citations,
        status,
        ...(deliveryState ? { deliveryState } : {}),
      }),
    );
}
