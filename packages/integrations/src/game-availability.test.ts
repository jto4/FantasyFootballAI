import { expect, it } from 'vitest';
import { buildPregameAvailability, parseQuarterbackObservations } from './game-availability.js';
import { parseNFLInjuryReports } from './injuries.js';
import { fetchCurrentQuarterbacks, fetchHistoricalQuarterbacks } from './game-quarterbacks.js';
import { parseGameWeather, gameWeatherRequest } from './game-weather.js';
import type { FootballGame } from '@sidekick/core';
const cutoff = '2025-10-05T16:00:00Z',
  g: FootballGame = {
    id: 'target',
    season: 2025,
    week: 5,
    seasonType: 'REG',
    date: '2025-10-05',
    kickoffAt: '2025-10-05T17:00:00Z',
    home: 'BUF',
    away: 'KC',
    stadiumId: 'BUF00',
    stadiumName: 'Highmark Stadium',
  };
const earlier: FootballGame = {
  ...g,
  id: 'earlier',
  week: 4,
  date: '2025-09-28',
  kickoffAt: '2025-09-28T17:00:00Z',
  homeScore: 24,
  awayScore: 20,
  homeQuarterbackId: '00-0000001',
  homeQuarterbackName: 'Old QB',
  awayQuarterbackId: '00-0000002',
  awayQuarterbackName: 'Away QB',
};
const injuries =
  'season,game_type,team,week,gsis_id,position,full_name,report_status,date_modified\n2025,REG,BUF,5,00-0000001,QB,Old QB,Out,2025-10-03T16:00:00Z\n2025,REG,BUF,5,00-0000003,WR,Receiver,Out,2025-10-03T16:00:00Z\n2025,REG,KC,5,00-0000004,CB,Defender,Out,2025-10-03T16:00:00Z';
it('uses dated REG report aliases, earlier starter facts and captured chart changes while excluding future updates', () => {
  const reports = parseNFLInjuryReports(injuries, 2025);
  expect(reports.every((r) => r.seasonType === 'REG')).toBe(true);
  const qbs = [
    { team: 'BUF', name: 'New QB', gsisId: '00-0000005', observedAt: '2025-10-05T07:00:00Z' },
    { team: 'KC', name: 'Away QB', gsisId: '00-0000002', observedAt: '2025-10-05T07:00:00Z' },
    { team: 'BUF', name: 'Future QB', observedAt: '2025-10-05T18:00:00Z' },
  ];
  const p = buildPregameAvailability(g, [earlier, g], reports, qbs, cutoff);
  expect(p.home).toMatchObject({
    offenseOut: 1,
    quarterbackOut: true,
    quarterbackChanged: true,
    expectedQuarterbackName: 'New QB',
  });
  expect(p.away).toMatchObject({ defenseOut: 1, quarterbackOut: false, quarterbackChanged: false });
  expect(
    buildPregameAvailability(
      { ...g, homeQuarterbackId: '00-9999999' },
      [earlier, g],
      reports,
      qbs,
      cutoff,
    ),
  ).toEqual(p);
  expect(
    buildPregameAvailability(
      g,
      [earlier, g],
      reports.map((r) => ({ ...r, updatedAt: '2025-10-05T18:00:00Z' })),
      qbs,
      cutoff,
    ).home.reportUpdatedAt,
  ).toBeUndefined();
});
it('keeps missing/undated/ambiguous coverage unknown instead of declaring healthy teams', () => {
  const reports = parseNFLInjuryReports(injuries, 2025);
  const undated = reports.map((r) => {
    const row = { ...r };
    delete row.updatedAt;
    return row;
  });
  expect(buildPregameAvailability(g, [earlier], undated, [], cutoff)).toEqual({
    asOf: cutoff,
    home: { previousQuarterbackName: 'Old QB', previousQuarterbackId: '00-0000001' },
    away: { previousQuarterbackName: 'Away QB', previousQuarterbackId: '00-0000002' },
  });
  const qbs = [
    { team: 'BUF', name: 'One', observedAt: '2025-10-05T07:00:00Z' },
    { team: 'BUF', name: 'Two', observedAt: '2025-10-05T07:00:00Z' },
  ];
  expect(
    buildPregameAvailability(g, [earlier], reports, qbs, cutoff).home.quarterbackChanged,
  ).toBeUndefined();
});
it('rejects undated depth schemas and only accepts dated rank-one quarterback identities', () => {
  expect(() => parseQuarterbackObservations('season,week,full_name\n2024,5,QB')).toThrow();
  const csv =
    'dt,team,player_name,gsis_id,pos_abb,pos_rank\n2025-10-05T07:00:00Z,BUF,New QB,00-0000005,QB,1\n2025-10-05T07:00:00Z,BUF,Backup,00-0000006,QB,2';
  expect(parseQuarterbackObservations(csv)).toHaveLength(1);
});
it('streams/filter depth records with chunk boundaries and rejects oversized transfers without following refs', async () => {
  const csv =
    'dt,team,player_name,gsis_id,pos_abb,pos_rank\n2025-10-05T07:00:00Z,BUF,"New, QB",00-0000005,QB,1\n2025-10-05T07:00:00Z,BUF,Other,00-0000006,WR,1';
  const bytes = new TextEncoder().encode(csv);
  let url = '';
  const fetcher = (async (input) => {
    url = String(input);
    return new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(bytes.slice(0, 80));
          c.enqueue(bytes.slice(80));
          c.close();
        },
      }),
    );
  }) as typeof fetch;
  expect(await fetchHistoricalQuarterbacks(2025, fetcher)).toHaveLength(1);
  expect(url).toContain('depth_charts_2025.csv');
  await expect(
    fetchHistoricalQuarterbacks(
      2025,
      async () => new Response('x', { headers: { 'content-length': '100000001' } }),
    ),
  ).rejects.toThrow('transfer');
});
it('checks live team/season/QB positions and returns capture time rather than inventing historical publication', async () => {
  const fetcher = (async (input) => {
    const id = String(input).includes('/teams/2/') ? '2' : '12',
      team = id === '2' ? 'BUF' : 'KC';
    return Response.json({
      status: 'success',
      season: { year: 2025, type: 2 },
      team: { id, abbreviation: team },
      depthchart: [
        {
          positions: {
            qb: {
              position: { abbreviation: 'QB' },
              athletes: [{ id: '123', displayName: 'Listed QB' }],
            },
            junk: { $ref: 'http://private.invalid' },
          },
        },
      ],
    });
  }) as typeof fetch;
  const rows = await fetchCurrentQuarterbacks(g, fetcher, () => Date.parse(cutoff));
  expect(rows).toHaveLength(2);
  expect(rows[0]!.observedAt).toBe(new Date(cutoff).toISOString());
  const wrong = (async () =>
    Response.json({ team: { id: '2', abbreviation: 'WRONG' } })) as typeof fetch;
  expect(await fetchCurrentQuarterbacks(g, wrong)).toEqual([]);
});
it('requires supported outdoor identity, exact units/time and non-null forecast values with conservative lead timing', () => {
  const value = {
    latitude: 43,
    longitude: -79,
    utc_offset_seconds: 0,
    hourly_units: {
      temperature_2m_previous_day2: '°C',
      wind_speed_10m_previous_day2: 'km/h',
      precipitation_previous_day2: 'mm',
    },
    hourly: {
      time: ['2025-10-05T17:00'],
      temperature_2m_previous_day2: [5],
      wind_speed_10m_previous_day2: [40],
      precipitation_previous_day2: [1],
    },
  };
  expect(parseGameWeather(value, g, cutoff)).toMatchObject({
    leadHours: 48,
    availableBy: '2025-10-04T05:00:00.000Z',
    windKph: 40,
  });
  expect(
    parseGameWeather(value, { ...g, stadiumName: 'Tottenham Stadium' }, cutoff),
  ).toBeUndefined();
  expect(
    gameWeatherRequest({ ...g, stadiumId: 'DAL00', stadiumName: 'AT&T Stadium' }, g.date, g.date),
  ).toBeUndefined();
  expect(parseGameWeather(value, g, '2025-10-03T00:00:00Z')).toBeUndefined();
  expect(
    parseGameWeather(
      { ...value, hourly: { ...value.hourly, wind_speed_10m_previous_day2: [null] } },
      g,
      cutoff,
    ),
  ).toBeUndefined();
  expect(
    parseGameWeather(
      { ...value, hourly_units: { ...value.hourly_units, wind_speed_10m_previous_day2: 'mph' } },
      g,
      cutoff,
    ),
  ).toBeUndefined();
});
