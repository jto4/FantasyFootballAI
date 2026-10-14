import { expect, it } from 'vitest';
import { replacementBaselines } from './draft-replacement.js';
import { starterSlots } from './advice-math.js';
import type { LeagueConnection } from './domain-types.js';
import type { PlayerAdviceEvidence } from './advice-types.js';
const player = (position: string, index: number, points: number): PlayerAdviceEvidence => ({
  id: `${position}-${index}`,
  name: `${position}-${index}`,
  position,
  projectionScope: 'season',
  projectedPoints: points,
  projectionSourceIds: ['test'],
  metrics: [],
  historicalPoints: [],
  warnings: [],
});
const league = (slots: string[], teamCount = 2): LeagueConnection => ({
  id: 'test',
  name: 'test',
  displayName: 'test',
  platform: 'sleeper',
  season: 2026,
  teamCount,
  teams: [],
  settings: { roster_positions: slots },
  scoring: {},
  connectedAt: '2026-10-13T12:00:00Z',
});

it('jointly assigns overlapping FLEX slots independent of slot and player ordering', () => {
  const rows = [
    ...[100, 90, 1, 0].map((p, i) => player('RB', i, p)),
    ...[95, 85, 10, 5].map((p, i) => player('WR', i, p)),
    ...[80, 70, 2, 0].map((p, i) => player('TE', i, p)),
  ];
  // Greedy WR/RB FLEX first consumes both RBs and then WR/TE uses both WRs.
  // The optimum can reassign WRs to the former and TEs to the latter as supply changes.
  const a = replacementBaselines(rows, league(['WRRBFLEX', 'RECFLEX']));
  const b = replacementBaselines([...rows].reverse(), league(['RECFLEX', 'WRRBFLEX']));
  expect(a).toEqual(b);
  const scarce = [
    player('RB', 0, 200),
    player('RB', 1, 190),
    player('RB', 2, 1),
    player('WR', 0, 180),
    player('WR', 1, 170),
    player('WR', 2, 0),
    player('TE', 0, 160),
    player('TE', 1, 150),
    player('TE', 2, -5),
  ];
  expect(replacementBaselines(scarce, league(['RECFLEX', 'WRRBFLEX']))).toEqual(
    new Map([
      ['RB', 1],
      ['TE', 160],
      ['WR', 0],
    ]),
  );
});

it('matches exhaustive legal allocation on deterministic small pools including overlapping Superflex', () => {
  let seed = 134;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const formations = [
    ['SUPERFLEX', 'FLEX'],
    ['RECFLEX', 'WRRBFLEX'],
    ['TE', 'FLEX'],
    ['QB', 'SUPERFLEX'],
  ];
  for (let trial = 0; trial < 40; trial++) {
    const connected = league(formations[trial % formations.length]!);
    const rows = ['QB', 'RB', 'WR', 'TE'].flatMap((position) =>
      Array.from({ length: 5 }, (_, i) => player(position, i, Math.round(random() * 10000) / 100)),
    );
    const slots = starterSlots(connected.settings.roster_positions).slots.flatMap((slot) => [
      slot,
      slot,
    ]);
    let best = -Infinity;
    let used: PlayerAdviceEvidence[] = [];
    const visit = (index: number, selected: PlayerAdviceEvidence[], sum: number) => {
      if (index === slots.length) {
        if (sum > best) {
          best = sum;
          used = [...selected];
        }
        return;
      }
      for (const row of rows)
        if (slots[index]!.positions.includes(row.position) && !selected.includes(row))
          visit(index + 1, [...selected, row], sum + row.projectedPoints!);
    };
    visit(0, [], 0);
    const result = replacementBaselines(rows, connected);
    for (const position of new Set(slots.flatMap((s) => s.positions))) {
      const pool = rows
        .filter((p) => p.position === position)
        .sort((a, b) => b.projectedPoints! - a.projectedPoints!);
      const count = used.filter((p) => p.position === position).length;
      expect(result.get(position)).toBe(pool[count]?.projectedPoints);
    }
    expect(replacementBaselines([...rows].reverse(), connected)).toEqual(result);
  }
});

it('keeps missing supply unknown, normalizes defense aliases and bounds work', () => {
  const rows = [player('QB', 0, 20), player('QB', 1, 15), player('QB', 2, 10)];
  expect(replacementBaselines(rows, league(['SUPERFLEX']))).toEqual(new Map());
  expect(replacementBaselines(rows, league(['QB', 'QB']))).toEqual(new Map());
  expect(replacementBaselines([...rows, rows[0]!], league(['QB']))).toEqual(new Map());
  expect(replacementBaselines(rows, league(['QB'], 33))).toEqual(new Map());
  const defenses = [player('DEF', 0, 100), player('DST', 1, 90), player('DEF', 2, 80)];
  expect(replacementBaselines(defenses, league(['DEF']))).toEqual(new Map([['DST', 80]]));
  const deep = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'].flatMap((position) =>
    Array.from({ length: 100 }, (_, i) => player(position, i, 1000 - i)),
  );
  expect(
    replacementBaselines(
      deep,
      league(['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'K', 'DST', 'FLEX', 'SUPERFLEX'], 32),
    ).size,
  ).toBe(6);
});
