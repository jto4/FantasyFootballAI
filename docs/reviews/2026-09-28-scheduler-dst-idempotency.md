# Scheduled report DST idempotency review — 2026-09-28

## Scope

Manually reviewed recurring and one-time report claims in `apps/api/src/scheduler.ts` and
`apps/api/src/index.ts`, focusing on timezone fall-back and interruption boundaries.

## Finding and change

Recurring cron callbacks previously had no occurrence identity. In a timezone that repeats a
wall-clock hour at daylight-saving fall-back, a scheduled local time could therefore generate
two reports. The scheduler now derives a key from the action, schedule fields, and local date;
it suppresses a second callback in the same process and persists the key in scheduled-run
history. Run creation checks persisted keys before starting report work. The one-time completion
marker and its running-history record are now written in the same local state transaction, so a
crash cannot commit one without the other.

## Validation

- Scheduler tests simulate both 1:30 AM instances on the 2026 New York fall-back date, with a
  settings reconciliation between them, and verify only one run starts.
- SQLite store tests verify the occurrence key survives reopening the database.
- API typecheck, formatting, scheduler/store tests, and the service integration suite passed.
- No automated security scans were run, per repository policy.
