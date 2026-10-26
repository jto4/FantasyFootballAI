import { expect, it } from 'vitest';
import type { PredictionPerformance } from '@sidekick/core';
import { minimumComparisonSamples, scorecardSources } from './AdviceScorecard';

const group = (method: string, samples: number, mae: number) =>
  ({ kind: 'fantasy', method, samples, mae }) as PredictionPerformance['groups'][number];

it('names the most accurate source only with enough results, and leaves out retired sources', () => {
  const few = scorecardSources([
    group('sidekick-model-v1', 1, 0.9),
    group('imported', 13, 7.4),
    group('public-projection-v1', 11, 7.9),
  ]);
  expect(few.sources.map((s) => s.name)).toEqual([
    'Sidekick projections',
    'Your imported projections',
  ]);
  expect(few.best).toBeUndefined();

  const enough = scorecardSources([
    group('sidekick-model-v1', minimumComparisonSamples, 5.2),
    group('imported', 40, 5.6),
  ]);
  expect(enough.best).toBe('Sidekick projections');
  // A single source has nothing to beat.
  expect(scorecardSources([group('sidekick-model-v1', 200, 5)]).best).toBeUndefined();
});
