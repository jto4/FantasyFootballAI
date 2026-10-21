import { expect, it, vi } from 'vitest';
import { createAdviceService, type AdviceDependencies } from './advice-service.js';

function service(seasons: Array<number | undefined>) {
  const data = { get: vi.fn(async (_season: number) => ({}) as never) };
  const catalog = vi.fn(async () => new Map());
  const injuries = { get: vi.fn(async (_season: number) => ({}) as never) };
  const configuredAI = vi.fn();
  const deps = {
    store: {
      snapshot: () => ({ leagues: seasons.map((season, index) => ({ id: `l${index}`, season })) }),
      settingsSnapshot: () => ({}),
      update: vi.fn(),
    },
    data,
    catalog,
    injuries,
    configuredAI,
  } as unknown as AdviceDependencies;
  return { warm: createAdviceService(deps).warm, data, catalog, injuries, configuredAI };
}

it('preloads each connected season once plus the catalog, without AI', async () => {
  const { warm, data, catalog, injuries, configuredAI } = service([2026, 2026, 2025, undefined]);
  await warm();
  expect(data.get.mock.calls.map(([season]) => season).sort()).toEqual([2025, 2026]);
  expect(injuries.get.mock.calls.map(([season]) => season).sort()).toEqual([2025, 2026]);
  expect(catalog).toHaveBeenCalledTimes(1);
  expect(configuredAI).not.toHaveBeenCalled();
});

it('does nothing without a connected league and tolerates provider failures', async () => {
  const empty = service([]);
  await empty.warm();
  expect(empty.data.get).not.toHaveBeenCalled();
  const failing = service([2026]);
  failing.data.get.mockRejectedValueOnce(new Error('offline'));
  await expect(failing.warm()).resolves.toBeUndefined();
});
