import { expect, it } from 'vitest';
import { parseDepthCharts } from './usage-data.js';

it('reads dated depth charts, keeping each day’s last snapshot and skill positions only', () => {
  const csv = [
    'dt,team,player_name,espn_id,gsis_id,pos_grp_id,pos_grp,pos_id,pos_name,pos_abb,pos_slot,pos_rank',
    '2026-10-20T08:00:00Z,MIN,A,1,00-0000001,1,3WR 1TE,8,Quarterback,QB,9,2',
    '2026-10-20T20:00:00Z,MIN,A,1,00-0000001,1,3WR 1TE,8,Quarterback,QB,9,1',
    '2026-10-20T20:00:00Z,MIN,B,2,00-0000002,1,3WR 1TE,1,Left Wide Receiver,LWR,1,2',
    '2026-10-20T20:00:00Z,MIN,B,2,00-0000002,1,3WR 1TE,1,Slot Wide Receiver,SWR,3,1',
    '2026-10-20T20:00:00Z,MIN,C,3,00-0000003,1,Base 4-3 D,11,Left End,LDE,1,1',
  ].join('\n');
  const depth = parseDepthCharts(csv, 2026);
  expect(depth.get('00-0000001')).toEqual([{ pos: 'QB', rank: 1, at: '2026-10-20T20:00:00Z' }]);
  expect(depth.get('00-0000002')).toEqual([{ pos: 'WR', rank: 1, at: '2026-10-20T20:00:00Z' }]);
  expect(depth.has('00-0000003')).toBe(false);
});

it('reads older weekly depth charts', () => {
  const csv = [
    'season,club_code,week,game_type,depth_team,last_name,first_name,football_name,formation,gsis_id,jersey_number,position,elias_id,depth_position,full_name',
    '2024,ATL,3,REG,2,X,Y,Y,Offense,00-0000009,26,RB,E,RB,Y X',
  ].join('\n');
  expect(parseDepthCharts(csv, 2024).get('00-0000009')).toEqual([
    { pos: 'RB', rank: 2, season: 2024, week: 3 },
  ]);
});
