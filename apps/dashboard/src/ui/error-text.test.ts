import { expect, it } from 'vitest';
import { ApiError } from './api-client';
import { describeError, withReference } from './error-text';

it('keeps plain messages plain and moves technical parts into details', () => {
  expect(describeError('Saved advice could not be loaded.')).toEqual({
    message: 'Saved advice could not be loaded.',
  });
  const id = '3f2a9c1e-1111-4222-8333-944455556666';
  expect(
    describeError(
      new ApiError('The NFL data source did not respond.', 502, 'upstream_unavailable', id),
    ),
  ).toEqual({
    message: 'The NFL data source did not respond.',
    detail: `Reference: ${id} · Code: upstream_unavailable · HTTP 502`,
  });
  expect(
    describeError(withReference('Props could not be loaded.', new Error(`x Reference: ${id}.`))),
  ).toEqual({
    message: 'Props could not be loaded.',
    detail: `Reference: ${id}`,
  });
});

it('translates raw browser network and timeout errors', () => {
  expect(describeError('Could not refresh local league data. Failed to fetch')).toEqual({
    message:
      'Could not refresh local league data. Could not reach the local service. Check that Sunday Sidekick is still running, then try again.',
    detail: 'Could not refresh local league data. Failed to fetch',
  });
  expect(describeError(new TypeError('Failed to fetch')).message).toMatch(/^Could not reach/);
  expect(describeError(new Error('signal timed out')).message).toMatch(/longer than expected/);
  expect(describeError(new Error('The operation was aborted due to timeout')).message).toMatch(
    /longer than expected/,
  );
  // Server messages that mention a timeout keep their guidance.
  const advice = 'Advice was canceled or timed out. Check saved advice before retrying.';
  expect(describeError(advice).message).toBe(advice);
  expect(describeError(new Error('AI CLI request timed out.')).message).toBe(
    'AI CLI request timed out.',
  );
  expect(describeError(undefined).message).toBe('Something went wrong. Try again.');
});
