import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { MarketResearchStore } from './market-research-store.js';

it('creates a missing data directory on first startup', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sidekick-research-store-'));
  try {
    const directory = join(root, 'not yet created');
    const store = new MarketResearchStore(join(directory, 'market-research.sqlite'));
    expect(store.list()).toEqual([]);
    store.close();
    expect((await stat(directory)).isDirectory()).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
