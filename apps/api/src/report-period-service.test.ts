import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it, vi } from 'vitest';
import { NFLInjuryReportCache } from '@sidekick/integrations';
import { LocalStore } from './store.js';
import { createReportService } from './report-service.js';
import { createDeliveryService } from './delivery-service.js';
import { DeliveryGuard } from './delivery-guard.js';
import type { AIRequest, LeagueConnection } from '@sidekick/core';

it('keeps modern headlines, undated projections and catalog status out of an archived report request', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sidekick-report-period-'));
  const store = new LocalStore(join(root, 'state.sqlite'));
  await store.load();
  try {
    const league: LeagueConnection = {
      id: 'archive',
      platform: 'sleeper',
      name: '2018 archive',
      displayName: '2018 archive',
      season: 2018,
      connectedAt: '2026-10-14T01:00:00Z',
      lastSyncedAt: '2026-10-14T01:00:00Z',
      teamCount: 1,
      settings: { currentWeek: 6 },
      scoring: {},
      teams: [
        {
          id: '1',
          name: 'One',
          roster: [
            { id: 'p', name: 'Player', status: 'Active', injuryStatus: 'Out', nflTeam: 'BUF' },
          ],
        },
      ],
      matchups: [{ week: 6, teams: [{ teamId: '1', starters: ['p'] }] }],
    };
    await store.update((s) => {
      s.leagues = [league];
      s.playerProjections = [
        {
          id: 'p',
          leagueId: league.id,
          playerId: 'p',
          playerName: 'Player',
          week: 6,
          projectedPoints: 12345,
          sourceName: 'Undated modern projection',
          scoringMatched: true,
          importedAt: '2026-10-14T01:00:00Z',
        },
      ];
    });
    const generate = vi.fn(async (_request: AIRequest) => 'Plain-text archived report.');
    const credential = vi.fn(async () => null),
      guard = new DeliveryGuard();
    const service = createReportService({
      store,
      deliveryGuard: guard,
      delivery: createDeliveryService({ store, deliveryGuard: guard, readCredential: credential }),
      configuredAI: async () => ({ id: 'test', generate }),
      nflInjuryReportCache: new NFLInjuryReportCache(),
      footballNewsCache: {
        get: async () => ({
          stale: false,
          items: [
            {
              title: 'Modern headline',
              source: 'ESPN',
              url: 'https://example.com/current',
              publishedAt: '2026-10-13T12:00:00Z',
            },
          ],
          refreshedAt: '2026-10-14T01:00:00Z',
        }),
      },
    });
    const saved = await service.generateAndSaveReport(
      league,
      store.reportSnapshot(),
      'matchup-preview',
      false,
    );
    const request = generate.mock.calls[0]![0];
    const data = JSON.parse(
      request.prompt.match(/<untrusted_report_data>\n([\s\S]+?)\n<\/untrusted_report_data>/)![1]!,
    );
    expect(data.league.season).toBe(2018);
    expect(data.league.lastSyncedAt).toBe(league.lastSyncedAt);
    expect(data.news).toEqual([]);
    expect(data.league.teams[0].roster[0]).toEqual({ id: 'p', name: 'Player' });
    expect(data.evidenceLimits).not.toContain('12345');
    expect(data.evidenceLimits).toContain('No owner-imported week-specific projections');
    expect(request.prompt).toContain('Do not use Markdown headings, bold, or tables');
    expect(saved.report.evidence?.visuals?.season).toBe(2018);
    expect(credential).not.toHaveBeenCalled();
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
