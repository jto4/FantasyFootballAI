import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureQuarterlyReviewIssue, quarterlyIssueTitle } from './quarterly-maintenance.mjs';

test('quarterly title uses the UTC year and quarter', () => {
  assert.equal(
    quarterlyIssueTitle(new Date('2026-01-07T14:00:00Z')),
    'Quarterly maintenance review (2026-Q1)',
  );
  assert.equal(
    quarterlyIssueTitle(new Date('2026-04-07T14:00:00Z')),
    'Quarterly maintenance review (2026-Q2)',
  );
  assert.equal(
    quarterlyIssueTitle(new Date('2026-07-07T14:00:00Z')),
    'Quarterly maintenance review (2026-Q3)',
  );
  assert.equal(
    quarterlyIssueTitle(new Date('2026-10-07T14:00:00Z')),
    'Quarterly maintenance review (2026-Q4)',
  );
});

test('an already-open quarterly issue is not duplicated', () => {
  const calls = [];
  const result = ensureQuarterlyReviewIssue({
    date: new Date('2026-10-07T14:00:00Z'),
    repository: 'owner/repo',
    runGh: (args) => {
      calls.push(args);
      return JSON.stringify([{ title: 'Quarterly maintenance review (2026-Q4)' }]);
    },
  });

  assert.deepEqual(result, { title: 'Quarterly maintenance review (2026-Q4)', created: false });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].slice(0, 2), ['issue', 'list']);
});

test('a missing quarterly issue is created with the documented checklist', () => {
  const calls = [];
  const result = ensureQuarterlyReviewIssue({
    date: new Date('2026-07-07T14:00:00Z'),
    repository: 'owner/repo',
    runGh: (args) => {
      calls.push(args);
      return args[1] === 'list' ? '[]' : '';
    },
  });

  assert.deepEqual(result, { title: 'Quarterly maintenance review (2026-Q3)', created: true });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].slice(0, 2), ['issue', 'create']);
  assert.ok(calls[1].at(-1).endsWith('/docs/maintenance-review.md'));
});

test('invalid repository identifiers fail before calling GitHub CLI', () => {
  let called = false;
  assert.throws(
    () =>
      ensureQuarterlyReviewIssue({
        repository: '../repo',
        runGh: () => {
          called = true;
          return '[]';
        },
      }),
    /GITHUB_REPOSITORY/,
  );
  assert.equal(called, false);
});
