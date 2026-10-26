/**
 * Drafts superseded by a newer draft of the same report for the same league: never sent, not
 * mid-delivery. The Reports library hides them by default and can delete them in one step.
 */
export function olderDraftIds(
  reports: {
    id: string;
    leagueId: string;
    kind: string;
    status: string;
    createdAt: string;
    deliveryState?: string | undefined;
  }[],
): Set<string> {
  const newest = new Map<string, string>();
  const older = new Set<string>();
  const drafts = reports
    .filter((r) => r.status === 'draft' && !r.deliveryState && r.kind !== 'chat-reply')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  for (const report of drafts) {
    const key = `${report.leagueId}\u0000${report.kind}`;
    if (newest.has(key)) older.add(report.id);
    else newest.set(key, report.id);
  }
  return older;
}
