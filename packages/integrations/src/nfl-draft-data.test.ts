import { expect, it } from 'vitest';
import { parseNFLDraftPicks } from './nfl-draft-data.js';

const header =
  'season,round,pick,team,gsis_id,pfr_player_id,pfr_player_name,position,college,car_av';
const line = '2026,1,20,BUF,00-0040999,FictRo00,Fictional Rookie,WR,Fictional College,999';
const csv = `${header}\n${line}\n`;
it('retains current and historical draft identity/facts without leaking hindsight career production', () => {
  const profile = parseNFLDraftPicks(csv, 2026)[0]!;
  expect(profile).toEqual({
    season: 2026,
    round: 1,
    pick: 20,
    draftTeam: 'BUF',
    gsisId: '00-0040999',
    pfrId: 'FictRo00',
    name: 'Fictional Rookie',
    position: 'WR',
    college: 'Fictional College',
  });
  expect(profile).not.toHaveProperty('car_av');
  expect(parseNFLDraftPicks(csv.replace('FictRo00', "O'ShJa00"), 2026)[0]!.pfrId).toBe("O'ShJa00");
  expect(parseNFLDraftPicks(csv.replace('FictRo00', 'McDuO.00'), 2026)[0]!.pfrId).toBe('McDuO.00');
  const unlinked = parseNFLDraftPicks(
    csv.replace('00-0040999', '').replace('FictRo00', ''),
    2026,
  )[0]!;
  expect(unlinked).not.toHaveProperty('gsisId');
  expect(unlinked).not.toHaveProperty('pfrId');
  expect(
    parseNFLDraftPicks(
      csv.replace('2026,1,20', '1980,1,20').replace('00-0040999', 'SIM659150'),
      2026,
    )[0]!.gsisId,
  ).toBe('SIM659150');
  expect(parseNFLDraftPicks(csv, 2025)).toEqual([]);
  expect(
    parseNFLDraftPicks(csv.replace('00-0040999', 'NA').replace('Fictional College', 'NA'), 2026)[0],
  ).not.toHaveProperty('gsisId');
});
it('rejects malformed or duplicated identities, pick numbers, rounds, text, columns and injected IDs', () => {
  for (const text of [
    csv.replace('00-0040999', 'https://example.test'),
    csv.replace('2026,1,20', '2026,8,20'),
    csv.replace('2026,1,20', '2026,1,-20'),
    csv.replace('2026,1,20', '2026,1,20.5'),
    csv + line + '\n',
    `${header}\n${line}\n${line.replace(',20,', ',21,')}\n`,
    csv.replace('Fictional College', 'Bad\u0000College'),
    csv.replace('gsis_id', 'unknown'),
  ])
    expect(() => parseNFLDraftPicks(text, 2026)).toThrow();
  expect(() => parseNFLDraftPicks(csv, 2100)).toThrow();
  expect(() => parseNFLDraftPicks(csv + Array(20001).fill(line).join('\n'), 2026)).toThrow();
});
