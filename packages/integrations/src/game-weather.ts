import type { FootballGame, PregameGameContext } from '@sidekick/core';
import { readBoundedJson } from './http.js';
import { gameWeatherVenues } from './game-weather-venues.js';
export const gameWeatherUrl = 'https://previous-runs-api.open-meteo.com/v1/forecast';
export function weatherVenue(game: FootballGame) {
  return gameWeatherVenues.find(
    (v) => v.id === game.stadiumId && v.names.some((n) => n === game.stadiumName),
  );
}
export function gameWeatherRequest(game: FootballGame, start: string, end: string) {
  const venue = weatherVenue(game);
  if (!venue) return;
  const url = new URL(gameWeatherUrl);
  for (const [k, v] of Object.entries({
    latitude: String(venue.latitude),
    longitude: String(venue.longitude),
    start_date: start,
    end_date: end,
    hourly: 'temperature_2m_previous_day2,wind_speed_10m_previous_day2,precipitation_previous_day2',
    models: 'jma_gsm',
    timezone: 'UTC',
  }))
    url.searchParams.set(k, v);
  return url.toString();
}
export function parseGameWeather(
  value: unknown,
  game: FootballGame,
  asOf: string,
): PregameGameContext['weather'] | undefined {
  const venue = weatherVenue(game);
  if (!venue || !value || typeof value !== 'object' || Array.isArray(value) || !game.kickoffAt)
    return;
  const r = value as Record<string, unknown>,
    h = r.hourly as Record<string, unknown>,
    u = r.hourly_units as Record<string, unknown>,
    validAt = new Date(Math.floor(Date.parse(game.kickoffAt) / 3600000) * 3600000).toISOString(),
    availableBy = new Date(Date.parse(validAt) - 36 * 3600000).toISOString();
  if (
    !h ||
    !u ||
    r.utc_offset_seconds !== 0 ||
    typeof r.latitude !== 'number' ||
    typeof r.longitude !== 'number' ||
    Math.abs(r.latitude - venue.latitude) > 1 ||
    Math.abs(r.longitude - venue.longitude) > 1 ||
    u.temperature_2m_previous_day2 !== '°C' ||
    u.wind_speed_10m_previous_day2 !== 'km/h' ||
    u.precipitation_previous_day2 !== 'mm' ||
    !Array.isArray(h.time) ||
    h.time.length > 75000 ||
    Date.parse(availableBy) > Date.parse(asOf)
  )
    return;
  const times = h.time as unknown[],
    matches = times.flatMap((t, i) => (t === validAt.slice(0, 16) ? [i] : []));
  if (matches.length !== 1) return;
  const fields = [
      'temperature_2m_previous_day2',
      'wind_speed_10m_previous_day2',
      'precipitation_previous_day2',
    ],
    bounds = [
      [-60, 60],
      [0, 250],
      [0, 100],
    ];
  const values = fields.map((key, i) => {
    const arr = h[key];
    if (!Array.isArray(arr) || arr.length !== times.length) return;
    const v = arr[matches[0]!];
    return typeof v === 'number' && Number.isFinite(v) && v >= bounds[i]![0]! && v <= bounds[i]![1]!
      ? v
      : undefined;
  });
  if (values.some((v) => v === undefined)) return;
  return {
    venueId: venue.id,
    model: 'jma_gsm',
    leadHours: 48,
    validAt,
    availableBy,
    temperatureC: values[0]!,
    windKph: values[1]!,
    precipitationMm: values[2]!,
  };
}
export async function fetchGameWeather(
  game: FootballGame,
  start: string,
  end: string,
  fetcher: typeof fetch = fetch,
): Promise<unknown> {
  const url = gameWeatherRequest(game, start, end);
  if (!url) return;
  const r = await fetcher(url, { signal: AbortSignal.timeout(20000), redirect: 'error' });
  if (!r.ok) {
    await r.body?.cancel();
    throw new Error('Weather forecast archive unavailable.');
  }
  return readBoundedJson(r, 8_000_000);
}

/**
 * Forecast wind for upcoming outdoor games, from the same 48-hour-lead forecast the projections
 * were fitted on, so it is available only inside the 36 hours before kickoff. Cached per venue
 * and day for three hours; failures leave the game without a forecast.
 */
export class PublicGameWeather {
  private cache = new Map<string, { until: number; value: Promise<unknown> }>();
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}
  async windFor(games: FootballGame[]): Promise<Map<string, number>> {
    const now = this.now();
    const asOf = new Date(now).toISOString();
    const wind = new Map<string, number>();
    const due = games.filter((game) => {
      const kickoff = Date.parse(game.kickoffAt ?? '');
      return (
        Number.isFinite(kickoff) &&
        kickoff > now &&
        kickoff - now <= 36 * 3_600_000 &&
        weatherVenue(game) !== undefined
      );
    });
    await Promise.all(
      due.slice(0, 20).map(async (game) => {
        const day = game.kickoffAt!.slice(0, 10);
        const key = `${weatherVenue(game)!.id}:${day}`;
        let hit = this.cache.get(key);
        if (!hit || hit.until <= now) {
          const value = fetchGameWeather(game, day, day, this.fetcher);
          hit = { until: now + 3 * 3_600_000, value };
          this.cache.set(key, hit);
          value.catch(() => this.cache.delete(key));
        }
        const parsed = parseGameWeather(await hit.value.catch(() => undefined), game, asOf);
        if (parsed) wind.set(game.id, parsed.windKph);
      }),
    );
    while (this.cache.size > 100) this.cache.delete(this.cache.keys().next().value!);
    return wind;
  }
}
