import assert from 'node:assert/strict';
import { SleeperPlayerCatalog } from '../packages/integrations/dist/index.js';

const catalog = await new SleeperPlayerCatalog().get();
assert.ok(catalog.size >= 1_000, 'Sleeper player catalog returned unexpectedly few records.');

const expectedPlayers = [
  { id: '4046', name: 'Patrick Mahomes', position: 'QB' },
  { id: '4984', name: 'Josh Allen', position: 'QB' },
  { id: '6794', name: 'Justin Jefferson', position: 'WR' },
];
const samples = expectedPlayers.map((expected) => {
  const player = catalog.get(expected.id);
  assert.ok(player, `Sleeper player catalog did not contain player ID ${expected.id}.`);
  assert.equal(
    player.name,
    expected.name,
    `Sleeper player ID ${expected.id} mapped to another player.`,
  );
  assert.equal(
    player.position,
    expected.position,
    `Sleeper player ID ${expected.id} had an unexpected position.`,
  );
  return {
    id: player.id,
    name: player.name,
    position: player.position,
    ...(player.nflTeam ? { nflTeam: player.nflTeam } : {}),
  };
});

console.log(
  JSON.stringify({
    checkedAt: new Date().toISOString(),
    status: 'ok',
    players: catalog.size,
    sampleRecords: samples,
    dataScope: 'public player catalog only; no league or user account data requested',
  }),
);
