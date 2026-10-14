import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  getTeamSelectionPreference,
  setTeamSelectionPreference,
  validateTeamSelections,
} from './team-selection-preference.mjs';
test('team choices survive renderer storage/origin changes and invalid files never become choices', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sidekick-team-preference-'));
  const path = join(root, 'teams.json');
  try {
    assert.deepEqual(await getTeamSelectionPreference(path), {});
    await setTeamSelectionPreference(path, { 'fictional-league': 'team' });
    assert.deepEqual(await getTeamSelectionPreference(path), { 'fictional-league': 'team' });
    await assert.rejects(setTeamSelectionPreference(path, { league: 42 }));
    assert.deepEqual(await getTeamSelectionPreference(path), { 'fictional-league': 'team' });
    assert.equal(JSON.parse(await readFile(path, 'utf8')).version, 1);
    await writeFile(path, 'invalid');
    assert.deepEqual(await getTeamSelectionPreference(path), {});
    assert.throws(() =>
      validateTeamSelections(
        Object.fromEntries(Array.from({ length: 101 }, (_, i) => [String(i), 't'])),
      ),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
