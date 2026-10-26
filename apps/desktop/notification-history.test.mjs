import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNotificationHistory } from './notification-history.mjs';

test('keeps shown notifications newest first, bounded, and ignores malformed saved rows', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sidekick-history-'));
  const path = join(dir, 'history.json');
  await writeFile(
    path,
    JSON.stringify([
      { at: 'x', title: 7 },
      { at: '2026-10-25T12:00:00Z', title: 'Old', body: 'b' },
    ]),
  );
  let time = Date.parse('2026-10-26T12:00:00Z');
  const history = createNotificationHistory(path, () => time);
  await history.add({ title: 'Egbuka is out', body: 'Start Watson', hash: '#/live' });
  time += 1000;
  await history.add({ title: 'Second', body: 'b', hash: 'https://not-a-hash' });
  const list = await history.list();
  assert.deepEqual(
    list.map((e) => e.title),
    ['Second', 'Egbuka is out', 'Old'],
  );
  assert.equal('hash' in list[0], false);
  assert.equal(list[1].hash, '#/live');
  assert.equal(JSON.parse(await readFile(path, 'utf8')).length, 3);
  for (let i = 0; i < 250; i++) await history.add({ title: `n${i}`, body: 'b' });
  assert.equal((await history.list()).length, 200);
});
