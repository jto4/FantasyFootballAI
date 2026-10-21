import { afterEach, expect, it } from 'vitest';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { LocalStore } from './store.js';

const saved = {
  database: process.env.SIDEKICK_DATABASE_FILE,
  data: process.env.SIDEKICK_USER_DATA_DIR,
};
afterEach(() => {
  for (const [key, value] of [
    ['SIDEKICK_DATABASE_FILE', saved.database],
    ['SIDEKICK_USER_DATA_DIR', saved.data],
  ] as const)
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
});

it('keeps the database inside a configured data directory', () => {
  delete process.env.SIDEKICK_DATABASE_FILE;
  process.env.SIDEKICK_USER_DATA_DIR = '/private/profile/data';
  expect(new LocalStore().path).toBe(join('/private/profile/data', 'state.sqlite'));
});

it('prefers an explicit database file and falls back to the home folder', () => {
  process.env.SIDEKICK_DATABASE_FILE = '/explicit/state.sqlite';
  process.env.SIDEKICK_USER_DATA_DIR = '/private/profile/data';
  expect(new LocalStore().path).toBe('/explicit/state.sqlite');
  delete process.env.SIDEKICK_DATABASE_FILE;
  delete process.env.SIDEKICK_USER_DATA_DIR;
  expect(new LocalStore().path).toBe(join(homedir(), '.sidekick', 'state.sqlite'));
});
