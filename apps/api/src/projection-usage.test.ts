import { expect, it } from 'vitest';
import { projectionUsage } from './projection-usage.js';

it('adds the week’s Out/Doubtful list to usage data and reuses the merged object', async () => {
  const usage = { snaps: new Map([['x', 0.5]]), depth: new Map() };
  let retrievedAt = '2026-10-20T00:00:00.000Z';
  const rows = [
    { gsisId: '00-0000010', season: 2026, week: 7, reportStatus: 'Doubtful' },
    { gsisId: '00-0000011', season: 2026, week: 7, reportStatus: 'Questionable' },
  ];
  const usageFor = projectionUsage({
    usage: { get: async () => usage },
    injuries: {
      get: async () =>
        ({ rows: structuredClone(rows), retrievedAt, sourceUrl: 'https://x' }) as never,
    },
  });
  const first = await usageFor(2026);
  expect(first?.snaps).toBe(usage.snaps);
  expect([...(first?.ruledOut ?? [])]).toEqual(['2026:7:00-0000010']);
  expect(await usageFor(2026)).toBe(first);
  retrievedAt = '2026-10-21T00:00:00.000Z';
  expect(await usageFor(2026)).not.toBe(first);

  // Either source failing leaves the other usable.
  const noInjuries = projectionUsage({
    usage: { get: async () => usage },
    injuries: { get: () => Promise.reject(new Error('offline')) },
  });
  expect(await noInjuries(2026)).toBe(usage);
  const noUsage = projectionUsage({
    injuries: { get: async () => ({ rows, retrievedAt, sourceUrl: 'https://x' }) as never },
  });
  expect((await noUsage(2026))?.snaps.size).toBe(0);
});

it('adds forecast wind for the games passed in', async () => {
  const usage = { snaps: new Map(), depth: new Map() };
  const usageFor = projectionUsage({
    usage: { get: async () => usage },
    weather: { windFor: async (games) => new Map(games.map((g) => [g.id, 25])) },
  });
  const games = [{ id: 'g1' }] as never;
  const withWind = await usageFor(2026, games);
  expect([...(withWind?.windKph ?? [])]).toEqual([['g1', 25]]);
  expect(await usageFor(2026, games)).toBe(withWind);
  expect(await usageFor(2026)).toBe(usage);
});
