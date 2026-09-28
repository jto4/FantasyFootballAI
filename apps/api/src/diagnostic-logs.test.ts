import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readApiLogTail } from './diagnostic-logs.js';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('readApiLogTail', () => {
  it('returns only structured allowlisted metadata and excludes raw messages', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sidekick-api-logs-'));
    directories.push(directory);
    await mkdir(join(directory, 'logs'));
    await writeFile(
      join(directory, 'logs', 'api.log'),
      [
        JSON.stringify({
          timestamp: '2026-09-27T12:00:00.000Z',
          level: 'warn',
          event: 'provider.request.failed',
          status: 503,
          errorName: 'Error',
          message: 'private email body',
          secret: 'token-value',
        }),
        'unstructured secret output',
      ].join('\n'),
    );

    const result = await readApiLogTail(directory);
    expect(result.available).toBe(true);
    expect(result.entries).toEqual([
      {
        timestamp: '2026-09-27T12:00:00.000Z',
        level: 'warn',
        event: 'provider.request.failed',
        fields: { status: 503, errorName: 'Error' },
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('private email body');
    expect(JSON.stringify(result)).not.toContain('token-value');
  });

  it('handles a missing log and an unset desktop data directory', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sidekick-api-logs-empty-'));
    directories.push(directory);
    await expect(readApiLogTail(directory)).resolves.toEqual({ available: true, entries: [] });
    await expect(readApiLogTail(undefined)).resolves.toEqual({ available: false, entries: [] });
  });

  it('reads the captured source-service stream from its designated log file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sidekick-service-logs-'));
    directories.push(directory);
    await mkdir(join(directory, 'logs'));
    await writeFile(
      join(directory, 'logs', 'service.log'),
      `${JSON.stringify({
        timestamp: '2026-09-27T12:01:00.000Z',
        level: 'info',
        event: 'api.started',
        component: 'api',
      })}\n`,
    );

    await expect(readApiLogTail(directory, 'service.log')).resolves.toMatchObject({
      available: true,
      entries: [
        {
          event: 'api.started',
          fields: { component: 'api' },
        },
      ],
    });
  });
});
