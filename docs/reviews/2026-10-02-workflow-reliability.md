# Workflow reliability review — 2026-10-02

Reviewer: Codex. Reviewed source: local working changes based on `0d8bd86`, including the
prior commissioner workflow slice. This is a focused source review, not approval of a signed
public release. No commits, publication, live-provider checks, or automated security scans
were performed.

## Changes and evidence

1. Delivery saves the complete credential-free rendered envelope before any outbound request.
   Retry tests change destinations/thread inputs and verify identical payload/key reuse;
   sender/account changes block retry. The Resend key itself stays in the OS vault; only its
   SHA-256 change-detection fingerprint is persisted. Legacy uncertain attempts without an
   envelope are explicitly blocked.
2. Settings PATCH requires a section revision checked under the SQLite write lock. Changes
   to other sections remain independent; derived privacy changes also advance their sections.
   Tests cover stale windows and cached store instances, preserving local pending edits.
   Restore invalidates form revisions. Legacy full-settings PUT remains for older clients.
3. Generation requests persist IDs, queue/progress/terminal state, and one atomic report/job
   completion. The queue bounds pending/running jobs at 20 and serializes provider execution
   with scheduled generation. Repeated IDs cannot repeat AI work; mismatched inputs conflict.
   Interrupted work is never replayed automatically. Legacy report responses use the same
   queue, retaining explicit automatic policy only when requested by the older API.
4. Browser fixtures use production workflow, league, provider, and loopback-boundary routers,
   temporary SQLite, and controlled external-provider/credential interfaces. Fast mocked
   journeys remain. The integration journeys cover onboarding, reload/idempotency, two-window
   Settings conflicts, uncertain retries, pagination, and preserving unsaved edits during polls.
5. Shared core contracts validate nested Settings, league, report, schedule/job, edit/send,
   thread-header, pagination, and error payloads. Legacy API messages have stable error codes.
   Model output is bounded before persistence; failure details stored with jobs are sanitized.
6. Live state omits report bodies, caps recent summaries/jobs, and reports complete per-league
   counts. History uses stable date/ID cursor pages; review fetches the saved body. Polling
   stays visible-window-only, skips news/vault reads, and preserves form/editor state.
7. Core domains, persistence/defaults/SQL/retention/validation, and Settings form/Yahoo/image
   hooks are separated behind existing imports. Canonical theme tokens and ordered base and
   workflow CSS replace three overlapping global files; shadowed exact-selector declarations
   were removed without changing selector specificity or rule order.

## Manual code review checklist

- [x] Read affected code and local changes, including the public barrel, migrations, backward
      compatibility, tests, and documentation. No production dependency was added in this slice.
- [x] Trace boundary validation, errors, persisted job/retry state, and UI loading/conflict/recovery
      behavior. Guard both optimistic revisions and immutable delivery payloads.
- [x] Review concurrency, queue bounds, idempotency collisions, atomic completion, shutdown,
      restart/restore recovery, and consent checks before/after inference and at draft commit.
- [x] Review response sizing and avoid serializing report bodies or private imports for polls;
      retain bounded provider response/timeouts and add representative summary measurements.
- [x] Verify the changed owner flows on desktop/mobile; retain native/live release gates.
- [x] Update tasks, architecture, decisions, setup, durable memory, support claims, and release
      status. Keep historical evidence in its dated record.

## Manual security review checklist

- [x] Trace new HTTP/settings/job/edit/send and imported backup rows through guards, SQLite,
      provider calls, and rendering. Preserve provider-specific adapters and bounded output.
- [x] Production and browser fixtures share loopback host/origin checks, headers, and body limits.
      No remote listener or new remote-access capability was added.
- [x] Credential-bearing configuration stays in the OS credential store. Persisted envelopes
      contain public routing, rendered text, and a Resend-key hash only. Fixtures use dummy
      credentials; screenshots contain synthetic league/provider content.
- [x] Preview and retry the saved payload; require owner review for uncertain outcomes; prevent
      sender/account drift and disable retries lacking a recoverable original envelope.
- [x] Keep subprocess execution and its existing timeouts/output bounds; serialize report AI
      calls and prevent late stopped jobs from publishing a draft. No shell policy was changed.
- [x] Preserve private SQLite/backup paths and permissions. Schema upgrade takes a safety copy;
      restore and partial-row salvage preserve validated job records and invalidate stale forms.
- [x] Keep privacy checks before/after AI and in the final save transaction; no raw imported
      conversations enter live state. Provider errors retained in jobs are allowlisted/static.
- [x] Automated security scans remain excluded, as required by the owner.

## Validation

- Full `npm test` passed on both Node 22.23.3 and the minimum supported Node 22.13.0:
  539 passing tests per run and two opt-in native service checks skipped. This includes
  generation/revision/envelope contracts and partial-row database recovery with job records.
- Typecheck, lint, formatting, and the production build passed.
- Playwright 1.58.2 / Chromium 145 passed 20 journeys: ten mocked and ten using production
  API routers with temporary SQLite, across 1440 × 1000 desktop and 390 × 844 mobile.
  Browser plugin not available; regular Playwright was used against loopback fixtures.
  Checks cover meaningful page content, no framework overlay or unexpected console errors,
  onboarding, generation/reload, two-window conflicts, review/edit, uncertain delivery,
  pagination, and preservation of unsaved edits during live polling.
- Inspected desktop/mobile report-review screenshots, including modal layout, readable text,
  and mobile scrolling. Screenshots and browser output are temporary artifacts outside the repo.
- `npm run perf:smoke` measured 172 ms API startup, summary latency p50/p95 2.00/2.55 ms,
  and 160.9 KiB summary payload versus 465.3 KiB full state (about 65% smaller). Final API
  working set was 126.8 MiB. See `../performance.md` for fixture and measurement limits.

Local logs: `/tmp/sidekick-reliability-final-tests.log`,
`/tmp/sidekick-reliability-minimum-tests.log`, `/tmp/sidekick-reliability-final-browser.log`,
and `/tmp/sidekick-reliability-perf.log`. Temporary logs/screenshots are not durable release
artifacts; the checks and scope above are the retained evidence.

## Limits

The provider idempotency window still limits Resend deduplication; SMS/iMessage outcomes can
remain uncertain. Resend credential rotation blocks retries until the original configuration
is restored or the owner separately resolves provider history. Job metadata is retained to
preserve request-ID deduplication. Queue execution is local to the owning API process, with
one background service per data directory. Legacy full-settings PUT is a compatibility path;
new dashboard section writes use revision checks.

Hosted OS/package CI, signing/notarization, native lifecycle, live fantasy/AI/delivery checks,
signed published-release upgrades, slower-hardware measurements, and the publication review
remain the release gates recorded in `release-status.md`.
