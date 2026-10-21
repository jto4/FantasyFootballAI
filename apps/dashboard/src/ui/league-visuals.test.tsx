import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { LeagueVisuals } from './LeagueVisuals.js';

it('uses comparable bar lengths across matchups, including negative scores', () => {
  for (const [points, expected] of [
    [
      [1, 0, 10, 0],
      [30, 0, 300, 0],
    ],
    [
      [-5, 0, 5, 10],
      [100, 0, 100, 200],
    ],
  ]) {
    const markup = renderToStaticMarkup(
      createElement(LeagueVisuals, {
        data: {
          teamCount: 4,
          currentWeek: 6,
          teams: [],
          matchups: [
            {
              week: 6,
              teams: [
                { teamId: 'a', points: points![0]! },
                { teamId: 'b', points: points![1]! },
              ],
            },
            {
              week: 6,
              teams: [
                { teamId: 'c', points: points![2]! },
                { teamId: 'd', points: points![3]! },
              ],
            },
          ],
        },
      }),
    );
    const widths = [...markup.matchAll(/width="([\d.]+)" height="22"/g)].map((m) => Number(m[1]));
    expect(widths).toEqual(expected);
  }
});
