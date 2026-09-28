import { describe, expect, it } from 'vitest';
import type { PlayerProjection } from '@sidekick/core';
import {
  isValidProjectionSourceUrl,
  parseProjectionCsv,
  summarizeProjectionSources,
} from './projections.js';

describe('owner projection imports', () => {
  it('parses quoted names and supported column aliases', () => {
    expect(
      parseProjectionCsv(
        '\uFEFFPlayer Name,Pos,Team,Fantasy Points,Player ID\r\n"Brown, Jr.",WR,SEA,218.5,player-1\r\nA. Runner,RB,NYG,190,player-2\r\n',
      ),
    ).toEqual([
      {
        playerId: 'player-1',
        playerName: 'Brown, Jr.',
        position: 'WR',
        nflTeam: 'SEA',
        projectedPoints: 218.5,
      },
      {
        playerId: 'player-2',
        playerName: 'A. Runner',
        position: 'RB',
        nflTeam: 'NYG',
        projectedPoints: 190,
      },
    ]);
  });

  it('keeps season and different weekly estimates for the same player distinct', () => {
    expect(
      parseProjectionCsv(
        'player,playerId,points,week\nPlayer One,p1,240,\nPlayer One,p1,18.5,4\nPlayer One,p1,21,5',
      ),
    ).toEqual([
      { playerId: 'p1', playerName: 'Player One', projectedPoints: 240 },
      { playerId: 'p1', playerName: 'Player One', projectedPoints: 18.5, week: 4 },
      { playerId: 'p1', playerName: 'Player One', projectedPoints: 21, week: 5 },
    ]);
    expect(() => parseProjectionCsv('player,points,week\nPlayer One,12,31')).toThrow(/week must/);
    expect(() =>
      parseProjectionCsv('player,points,week\nPlayer One,12,4\nPlayer One,13,4'),
    ).toThrow(/duplicate player/);
  });

  it('imports optional average draft position alongside season projections', () => {
    expect(parseProjectionCsv('player,points,ADP\nPlayer One,240,12.5\nPlayer Two,180,')).toEqual([
      { playerName: 'Player One', projectedPoints: 240, averageDraftPosition: 12.5 },
      { playerName: 'Player Two', projectedPoints: 180 },
    ]);
    expect(() => parseProjectionCsv('player,points,adp\nPlayer One,240,0')).toThrow(
      /average draft position/,
    );
    expect(() => parseProjectionCsv('player,points,adp\nPlayer One,240,601')).toThrow(
      /average draft position/,
    );
  });

  it('rejects missing columns, invalid values, duplicate players, and malformed quotes', () => {
    expect(() => parseProjectionCsv('player,team\nPlayer One,SEA')).toThrow(/needs a player/);
    expect(() => parseProjectionCsv('player,points\nPlayer One,NaN')).toThrow(/projected points/);
    expect(() => parseProjectionCsv('player,points\nPlayer One,10\nplayer one,12')).toThrow(
      /duplicate player/,
    );
    expect(() => parseProjectionCsv('player,points\n"Player One,12')).toThrow(/unclosed quoted/);
    expect(() => parseProjectionCsv('player,points\nPlayer" One,12')).toThrow(/malformed quoting/);
    expect(() => parseProjectionCsv('player,points\nPlayer One,12,extra')).toThrow(/column count/);
  });

  it('accepts only public HTTPS source URLs without query credentials', () => {
    expect(isValidProjectionSourceUrl(undefined)).toBe(true);
    expect(isValidProjectionSourceUrl('https://example.com/projections')).toBe(true);
    expect(isValidProjectionSourceUrl('http://example.com/projections')).toBe(false);
    expect(isValidProjectionSourceUrl('https://user:password@example.com/data')).toBe(false);
    expect(isValidProjectionSourceUrl('https://example.com/data?token=secret')).toBe(false);
  });

  it('confirms a source only when every projection row explicitly confirms scoring', () => {
    const row = (
      id: string,
      scoringMatched: boolean | undefined,
      sourceId = 'confirmed-source',
    ): PlayerProjection => ({
      id,
      leagueId: 'league-1',
      sourceId,
      ...(scoringMatched === undefined ? {} : { scoringMatched }),
      playerName: `Player ${id}`,
      projectedPoints: 100,
      sourceName: sourceId,
      importedAt: '2026-09-27T12:00:00.000Z',
    });

    const summaries = summarizeProjectionSources([
      row('one', true),
      row('two', false),
      row('three', true, 'other-source'),
      row('legacy', undefined, 'legacy-source'),
    ]);

    expect(summaries.find((source) => source.sourceId === 'confirmed-source')?.scoringMatched).toBe(
      false,
    );
    expect(summaries.find((source) => source.sourceId === 'other-source')?.scoringMatched).toBe(
      true,
    );
    expect(summaries.find((source) => source.sourceId === 'legacy-source')?.scoringMatched).toBe(
      false,
    );
  });
});
