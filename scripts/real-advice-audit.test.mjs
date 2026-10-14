import assert from 'node:assert/strict';
import { test } from 'node:test';
import { exhaustiveLineup } from './real-advice-audit.mjs';

test('independent oracle preserves overlapping slot eligibility and never reuses players', () => {
  const players = [
    { id: 'rb', position: 'RB', projectedPoints: 20 },
    { id: 'wr', position: 'WR', projectedPoints: 15 },
    { id: 'bench', position: 'RB', projectedPoints: 5 },
  ];
  assert.equal(exhaustiveLineup(players, ['FLEX', 'RB', 'BN']), 35);
  assert.equal(exhaustiveLineup(players, ['RB', 'FLEX']), 35);
  assert.equal(exhaustiveLineup([players[0]], ['RB', 'FLEX']), undefined);
});
test('independent oracle does not invent missing points or unsupported lineup rules', () => {
  assert.equal(exhaustiveLineup([{ id: 'qb', position: 'QB' }], ['QB']), undefined);
  assert.throws(() => exhaustiveLineup([], ['IDP']), /Unsupported/);
});
