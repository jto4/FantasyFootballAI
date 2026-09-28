import { describe, expect, it, vi } from 'vitest';
import type { LeagueConnection } from '@sidekick/core';
import { NFLInjuryReportCache, type NFLInjuryReportRow } from '@sidekick/integrations';
import { buildInjuryPromptEvidence } from './injury-evidence.js';

const league: LeagueConnection = {
  id: 'league-1',
  platform: 'sleeper',
  name: 'League',
  displayName: 'League',
  season: 2026,
  teamCount: 1,
  scoring: {},
  settings: { currentWeek: 4 },
  teams: [
    {
      id: 'roster-1',
      name: 'Team',
      roster: [{ id: '1', name: 'James Cook', position: 'RB', nflTeam: 'BUF' }],
    },
  ],
  connectedAt: '2026-01-01T00:00:00.000Z',
};

const rows: NFLInjuryReportRow[] = [
  {
    season: 2026,
    week: 4,
    team: 'BUF',
    position: 'RB',
    fullName: 'James Cook',
    reportStatus: 'Questionable',
    reportInjury: 'Toe',
    practiceStatus: 'Limited Participation in Practice',
    practiceInjury: 'Toe',
  },
];

describe('injury prompt evidence', () => {
  it('keeps the source disabled without requesting injury data', async () => {
    const load = vi.fn(async () => rows);
    const result = await buildInjuryPromptEvidence(
      false,
      'matchup-preview',
      league,
      new NFLInjuryReportCache(load),
    );

    expect(result.text).toContain('feed is disabled');
    expect(result.citationSource).toBeUndefined();
    expect(load).not.toHaveBeenCalled();
  });

  it('includes only matched current-week players and returns a licensed citation', async () => {
    const cache = new NFLInjuryReportCache(
      async () => rows,
      () => Date.UTC(2026, 8, 27),
    );
    const result = await buildInjuryPromptEvidence(true, 'matchup-preview', league, cache);

    expect(result.text).toContain('James Cook');
    expect(result.text).toContain('2026-09-27T00:00:00.000Z');
    expect(result.text).toContain('not medical advice');
    expect(result.text).toContain('CC BY 4.0');
    expect(result.citationSource).toEqual({
      title: 'nflverse NFL injury reports (CC BY 4.0 attribution)',
      url: 'https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_2026.csv',
    });
  });

  it('does not fetch the feed for reports without a matchup preview', async () => {
    const load = vi.fn(async () => rows);
    const result = await buildInjuryPromptEvidence(
      true,
      'power-rankings',
      league,
      new NFLInjuryReportCache(load),
    );

    expect(result.text).toContain('no current-week data');
    expect(result.citationSource).toBeUndefined();
    expect(load).not.toHaveBeenCalled();
  });

  it('continues report generation when the injury feed is unavailable', async () => {
    const cache = new NFLInjuryReportCache(async () => {
      throw new Error('offline');
    });
    const result = await buildInjuryPromptEvidence(true, 'matchup-preview', league, cache);

    expect(result.text).toContain('could not be refreshed');
    expect(result.citationSource).toBeUndefined();
  });
});
