import { describe, expect, it } from 'vitest';
import type { LeagueConnection, SavedReport } from '@sidekick/core';
import { summarizeLeagues, summarizeReports } from './mcp-data.js';

describe('MCP read views', () => {
  it('returns league summaries without roster or credential settings', () => {
    const league = {
      id: 'league-1',
      platform: 'sleeper',
      name: 'Sunday league',
      displayName: 'Sunday league',
      teamCount: 12,
      scoring: {},
      settings: { ownerCookie: 'must not appear in summary' },
      teams: [{ id: 'team-1', name: 'Team', roster: [{ id: 'player-1', name: 'Player' }] }],
      connectedAt: '2026-01-01T00:00:00.000Z',
    } as unknown as LeagueConnection;

    const [summary] = summarizeLeagues([league]);
    expect(summary).toMatchObject({ id: 'league-1', platform: 'sleeper', teamCount: 12 });
    expect(summary).not.toHaveProperty('settings');
    expect(summary).not.toHaveProperty('teams');
  });

  it('filters and bounds report summaries without exposing report bodies', () => {
    const reports = Array.from({ length: 60 }, (_, index) => ({
      id: `report-${index}`,
      leagueId: index % 2 ? 'league-1' : 'league-2',
      kind: 'power-rankings',
      createdAt: '2026-01-01T00:00:00.000Z',
      title: `Report ${index}`,
      body: 'Report text must be fetched separately.',
      citations: [],
      status: 'draft',
    })) as SavedReport[];

    const summaries = summarizeReports(reports, 'league-1', 100);
    expect(summaries).toHaveLength(30);
    expect(summaries[0]).toMatchObject({ leagueId: 'league-1', kind: 'power-rankings' });
    expect(summaries[0]).not.toHaveProperty('body');
    expect(summarizeReports(reports, undefined, 5)).toHaveLength(5);
    expect(summarizeReports(reports, undefined, 100)).toHaveLength(50);
  });
});
