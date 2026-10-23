import { expect, it } from 'vitest';
import type { FootballGame } from '@sidekick/core';
import { PublicGameWeather } from './game-weather.js';

const game = (id: string, kickoffAt: string): FootballGame => ({
  id,
  season: 2026,
  week: 8,
  seasonType: 'REG',
  date: kickoffAt.slice(0, 10),
  kickoffAt,
  home: 'PHI',
  away: 'NYG',
  stadiumId: 'PHI00',
  stadiumName: 'Lincoln Financial Field',
});
const forecast = (hour: string, wind: number) => ({
  latitude: 39.9,
  longitude: -75.17,
  utc_offset_seconds: 0,
  hourly_units: {
    temperature_2m_previous_day2: '°C',
    wind_speed_10m_previous_day2: 'km/h',
    precipitation_previous_day2: 'mm',
  },
  hourly: {
    time: [hour],
    temperature_2m_previous_day2: [12],
    wind_speed_10m_previous_day2: [wind],
    precipitation_previous_day2: [0],
  },
});

it('returns forecast wind only for outdoor games inside 36 hours, cached per venue and day', async () => {
  const now = Date.parse('2026-10-24T12:00:00Z');
  let calls = 0;
  const weather = new PublicGameWeather(
    (async () => {
      calls++;
      return new Response(JSON.stringify(forecast('2026-10-25T17:00', 31)), { status: 200 });
    }) as typeof fetch,
    () => now,
  );
  const soon = game('soon', '2026-10-25T17:00:00Z');
  const later = game('later', '2026-10-27T00:15:00Z');
  const dome = {
    ...game('dome', '2026-10-25T17:00:00Z'),
    stadiumId: 'DET00',
    stadiumName: 'Ford Field',
  };
  const wind = await weather.windFor([soon, later, dome]);
  expect([...wind]).toEqual([['soon', 31]]);
  await weather.windFor([soon]);
  expect(calls).toBe(1);
});

it('leaves games without a forecast when the archive fails', async () => {
  const weather = new PublicGameWeather(
    (async () => new Response('', { status: 503 })) as typeof fetch,
    () => Date.parse('2026-10-24T12:00:00Z'),
  );
  expect((await weather.windFor([game('soon', '2026-10-25T17:00:00Z')])).size).toBe(0);
});
