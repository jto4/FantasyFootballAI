# Report member-memory consent review — 2026-09-28

## Scope

Manually reviewed the AI report prompt and draft-save path in `apps/api/src/index.ts`, focusing
on the separate owner opt-in for member notes in reports.

## Finding and change

The report route captured member context before awaiting AI runtime setup and model inference.
If the owner changed report-memory sharing during either wait, the request could still send the
older notes to the model and retain a generated draft based on notes that were no longer shared.

Report generation now compares the captured context with current settings and profiles after AI
runtime setup, after inference, and inside the SQLite transaction that saves the draft. A
changed context stops the request or discards the generated response without saving a report.
The context comparison also detects profile-note edits and profile exclusions while generation
is in progress.

An AI provider may already have accepted the original prompt before the owner revokes consent;
the app cannot retract data already sent. The new checks stop requests that have not started
and prevent a result from being retained after a context change.

## Validation

- `scripts/report-memory-consent.integration.test.mjs` starts the API with an isolated database
  and a local fake AI CLI. The CLI changes the owner setting during generation; the API returns
  an error response and saves no report draft.
- API typecheck, the full repository test suite, lint, formatting, production build, and
  `git diff --check` pass.
- No automated security scans were run, per repository policy.
