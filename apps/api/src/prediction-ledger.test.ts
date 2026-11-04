import { expect, it } from 'vitest';
import { maximumPredictionRecords, type PredictionRecord } from '@sidekick/core';
import { appendPredictionRecords } from './prediction-ledger.js';

const record = (id: string, status: PredictionRecord['status']) =>
  ({ id, status }) as PredictionRecord;

it('lets the oldest graded record make room so the track record stays current', () => {
  const state = {
    predictionRecords: [
      record('waiting', 'pending'),
      ...Array.from({ length: maximumPredictionRecords - 1 }, (_, i) =>
        record(`old-${i}`, 'settled'),
      ),
    ],
  };
  expect(appendPredictionRecords(state, [record('new', 'pending')])).toBe(0);
  const ids = state.predictionRecords.map((r) => r.id);
  expect(ids).toHaveLength(maximumPredictionRecords);
  expect(ids).toContain('new');
  expect(ids).toContain('waiting');
  expect(ids).not.toContain('old-0');
});

it('never gives up a forecast still waiting on its game', () => {
  const state = {
    predictionRecords: Array.from({ length: maximumPredictionRecords }, (_, i) =>
      record(`waiting-${i}`, 'pending'),
    ),
  };
  expect(appendPredictionRecords(state, [record('new', 'pending')])).toBe(1);
  expect(state.predictionRecords).toHaveLength(maximumPredictionRecords);
  expect(state.predictionRecords.some((r) => r.id === 'new')).toBe(false);
});
