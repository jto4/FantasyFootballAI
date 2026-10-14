import { describe, expect, it } from 'vitest';
import { parseLeagueInput, detectLeagueLink } from './league-input.js';
import { localDateTimeInstants } from './calendar-time.js';
describe('league links', () => {
  it('detects supported links and their season without treating IDs or untrusted hosts as links', () => {
    expect(detectLeagueLink(' https://sleeper.app/leagues/12345 ')).toEqual({
      platform: 'sleeper',
      leagueId: '12345',
    });
    expect(
      detectLeagueLink('https://fantasy.espn.com/football/league?leagueId=987&seasonId=2026'),
    ).toEqual({ platform: 'espn', leagueId: '987', season: 2026 });
    expect(detectLeagueLink('https://football.fantasysports.yahoo.com/f1/123')).toEqual({
      platform: 'yahoo',
      leagueId: '123',
    });
    for (const input of [
      '12345',
      'http://sleeper.com/leagues/123',
      'https://sleeper.com.evil.test/leagues/123',
      'https://secret@sleeper.com/leagues/123',
      'https://sleeper.com:8443/leagues/123',
      'https://sleeper.com/leagues/' + '1'.repeat(129),
      'https://sleeper.com/invite/123',
      'https://fantasy.espn.com/football/league?leagueId=987&seasonId=abcd',
    ])
      expect(detectLeagueLink(input)).toBeUndefined();
  });
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
