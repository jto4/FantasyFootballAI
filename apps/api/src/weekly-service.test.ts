import { expect, it } from 'vitest';
import { weeklyGameWithheldWarning, type PlayerAdviceEvidence } from '@sidekick/core';
import { benchReplacement } from './weekly-service.js';

const player = (
  id: string,
  position: string,
  projectedPoints?: number,
  extra: Partial<PlayerAdviceEvidence> = {},
) =>
  ({
    id,
    name: `Player ${id}`,
    position,
    ...(projectedPoints !== undefined ? { projectedPoints } : {}),
    warnings: [],
    metrics: [],
    ...extra,
  }) as unknown as PlayerAdviceEvidence;

it('suggests the best available bench player at the same position', () => {
  const evidence = [
    player('wr1', 'WR', 14),
    player('wr2', 'WR', 11),
    player('wr3', 'WR', 9),
    player('wr4', 'WR', 12, { status: 'Out' }),
    player('wr5', 'WR', 13, { warnings: [weeklyGameWithheldWarning] }),
    player('wr6', 'WR', 10, { status: 'Doubtful' }),
    player('rb1', 'RB', 20),
    player('wr7', 'WR'),
  ];
  const byId = new Map(evidence.map((p) => [p.id, p]));
  const roster = evidence.map((p) => ({ id: p.id, name: p.name }));
  const starters = [{ id: 'wr1' }, { id: 'wr2' }, { id: 'rb1' }];
  expect(benchReplacement('wr1', starters, byId, roster)).toEqual({
    id: 'wr3',
    name: 'Player wr3',
    estimate: 9,
  });
  expect(benchReplacement('wr1', starters, byId, roster, new Set(['wr3']))).toBeUndefined();
  expect(benchReplacement('rb1', starters, byId, roster)).toBeUndefined();
});
