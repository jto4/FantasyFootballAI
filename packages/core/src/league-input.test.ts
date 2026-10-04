import { describe, expect, it } from 'vitest';
import { parseLeagueInput } from './league-input.js';
import { localDateTimeInstants } from './calendar-time.js';
describe('league links', () => {
  it('normalizes supported provider links without fetching them', () => {
    expect(parseLeagueInput('sleeper', 'https://sleeper.com/leagues/12345')).toEqual({
      leagueId: '12345',
    });
    expect(
      parseLeagueInput(
        'espn',
        'https://fantasy.espn.com/football/league?leagueId=987&seasonId=2026',
      ),
    ).toEqual({ leagueId: '987', season: 2026 });
    expect(parseLeagueInput('yahoo', 'https://football.fantasysports.yahoo.com/f1/123')).toEqual({
      leagueId: '123',
    });
    expect(parseLeagueInput('yahoo', '461.l.123')).toEqual({ leagueId: '461.l.123' });
  });
  it('rejects mismatched hosts and credential-bearing links', () => {
    expect(() =>
      parseLeagueInput('espn', 'https://fantasy.espn.com.evil.test/football/league?leagueId=123'),
    ).toThrow();
    expect(() =>
      parseLeagueInput('sleeper', 'https://owner:secret@sleeper.com/leagues/123'),
    ).toThrow();
    expect(() => parseLeagueInput('yahoo', 'https://sleeper.com/leagues/123')).toThrow();
    expect(() =>
      parseLeagueInput('sleeper', `https://sleeper.com/leagues/${'1'.repeat(129)}`),
    ).toThrow();
  });
});
it('resolves skipped and repeated wall times for upcoming report dates', () => {
  expect(localDateTimeInstants('2026-03-08', '02:30', 'America/New_York')).toEqual([]);
  expect(localDateTimeInstants('2026-11-01', '01:30', 'America/New_York')).toHaveLength(2);
});
