import { describe, expect, it } from 'vitest';
import { espnFormat } from './platforms/espn.js';
import { sleeperFormat } from './platforms/sleeper.js';
import { parsePlayerBios } from './player-bios.js';

const header =
  'gsis_id,display_name,position,birth_date,rookie_season,last_season,draft_year,draft_pick,espn_id';

describe('player bios', () => {
  it('keeps recent skill players with validated age and draft facts', () => {
    const bios = parsePlayerBios(
      [
        header,
        '00-0012345,Fictional Receiver,WR,2001-05-02,2023,2026,2023,12,4567',
        '00-0012346,Fictional Rookie,RB,2004-01-01,NA,NA,2027,3,',
        '00-0012347,Old Kicker,K,1985-01-01,2008,2026,2008,100,',
        '00-0012348,Long Retired,WR,1980-01-01,2002,2012,2002,5,',
        'bad-id,Bad Id,WR,2001-01-01,2023,2026,2023,1,',
        '00-0012349,Odd Values,TE,not-a-date,2024,2026,2024,999,abc',
      ].join('\n'),
      2026,
    );
    expect(bios.map((b) => b.gsisId)).toEqual(['00-0012345', '00-0012346', '00-0012349']);
    expect(bios[0]).toEqual({
      gsisId: '00-0012345',
      name: 'Fictional Receiver',
      position: 'WR',
      espnId: '4567',
      birthDate: '2001-05-02',
      rookieSeason: 2023,
      draftPick: 12,
    });
    // A draftee who has not played takes his draft year as his first season.
    expect(bios[1]!.rookieSeason).toBe(2027);
    expect(bios[2]).toEqual({
      gsisId: '00-0012349',
      name: 'Odd Values',
      position: 'TE',
      rookieSeason: 2024,
    });
  });
});

describe('league format detection', () => {
  it('reads Sleeper league type, keepers and taxi settings', () => {
    expect(sleeperFormat({ type: 2, max_keepers: 1, taxi_slots: 3, taxi_years: 2 })).toEqual({
      leagueFormat: 'dynasty',
      maxKeepers: 1,
      taxiSlots: 3,
      taxiYears: 2,
    });
    expect(sleeperFormat({ type: 1, max_keepers: 3 })).toEqual({
      leagueFormat: 'keeper',
      maxKeepers: 3,
    });
    expect(sleeperFormat({ type: 0, max_keepers: 1 })).toEqual({ leagueFormat: 'redraft' });
    expect(sleeperFormat({ type: 'dynasty' })).toEqual({ leagueFormat: 'redraft' });
  });
  it('reads ESPN keeper counts', () => {
    const slots = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'BENCH', 'BENCH', 'BENCH', 'IR'];
    expect(espnFormat({ keeperCount: 0 }, slots)).toEqual({ leagueFormat: 'redraft' });
    expect(espnFormat({ keeperCount: 2 }, slots)).toEqual({
      leagueFormat: 'keeper',
      maxKeepers: 2,
    });
    expect(espnFormat({ keeperCount: 10 }, slots)).toEqual({
      leagueFormat: 'dynasty',
      maxKeepers: 10,
    });
    expect(espnFormat(undefined, undefined)).toEqual({ leagueFormat: 'redraft' });
  });
});
