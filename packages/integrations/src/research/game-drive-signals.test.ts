import { it, expect } from 'vitest';
import { gzipSync } from 'node:zlib';
import {
  parseGameDriveSignals,
  decodeDriveCsv,
  loadGameDriveSignals,
} from './game-drive-signals.js';
const header =
  'play_id,game_id,season,week,season_type,home_team,away_team,posteam,defteam,qtr,quarter_seconds_remaining,score_differential,play_type,qb_kneel,qb_spike,no_huddle,epa,success,yards_gained,qb_dropback,sack,drive,fixed_drive,fixed_drive_result,yardline_100,drive_time_of_possession,drive_play_count';
const row = (id: number, drive: number, yardline = 10) =>
  `${id},2025_01_BUF_KC,2025,1,REG,KC,BUF,KC,BUF,1,850,0,pass,0,0,1,0.5,1,22,1,0,${drive},1,Touchdown,${yardline},2:00,4`;
it('deduplicates repaired drives, original drive clocks, and red zone scoring', () => {
  const csv = [header, row(1, 1), row(2, 1), row(3, 2, 30)].join('\n'),
    out = parseGameDriveSignals(csv, 2025),
    s = out.rows[0]!;
  expect(out.drives).toBe(1);
  expect(s.offensivePoints).toBe(7);
  expect(s.redZoneDrives).toBe(1);
  expect(s.redZoneTouchdowns).toBe(1);
  expect(s.possessionSeconds).toBe(240);
  expect(s.possessionPlays).toBe(8);
  expect(s.neutralNoHuddle).toBe(3);
  expect(decodeDriveCsv(gzipSync(csv))).toBe(csv);
});
it('excludes garbage time and rejects duplicates, wrong source seasons, conflicting clocks and malformed CSV', () => {
  const out = parseGameDriveSignals(
    [header, row(1, 1).replace(',850,0,', ',100,21,')].join('\n'),
    2025,
  );
  expect(out.rows[0]!.neutralPlays).toBe(0);
  expect(() => parseGameDriveSignals([header, row(1, 1), row(1, 1)].join('\n'), 2025)).toThrow(
    /Duplicate/,
  );
  expect(() => parseGameDriveSignals([header, row(1, 1)].join('\n'), 2026)).toThrow(/season/);
  expect(() =>
    parseGameDriveSignals([header, row(1, 1), row(2, 1).replace('2:00', '3:00')].join('\n'), 2025),
  ).toThrow(/clock/);
  expect(() => parseGameDriveSignals(header + '\n"unclosed', 2025)).toThrow();
});
it('bounds provider errors before parsing and validates the season before networking', async () => {
  await expect(
    loadGameDriveSignals(2025, async () => new Response('', { status: 503 })),
  ).rejects.toThrow(/503/);
  await expect(
    loadGameDriveSignals(
      2025,
      async () => new Response('x', { headers: { 'content-length': '45000001' } }),
    ),
  ).rejects.toThrow(/large/);
  await expect(
    loadGameDriveSignals(1900, async () => {
      throw Error('Should not fetch');
    }),
  ).rejects.toThrow(/season/);
});
