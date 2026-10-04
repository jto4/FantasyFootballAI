# League route refactor review

Date: 2026-09-28

## Scope

Moved league connect, refresh, and disconnect handlers from API startup into
`apps/api/src/league-routes.ts`. Provider access remains supplied by the API bootstrap;
this refactor does not add a new authentication path.

## Manual review

- Connection input checks require a supported platform, a bounded/control-free league ID,
  a bounded custom display name, and an in-range ESPN season when supplied.
- The bootstrap resolves ESPN credentials from the OS credential store and obtains Yahoo
  access through the existing OAuth refresh path before invoking the injected fetcher.
- Provider errors pass through the existing sanitized sync-error formatter before being
  returned or persisted.
- Refresh retains the owner's display name and original connection timestamp, then clears
  a prior sync error when the provider fetch succeeds.
- Disconnect removes the league snapshot, projections, calendar events, and selected chat
  reply league; chat replies are disabled when the final league is removed, and calendar jobs
  are reconciled from the remaining events.
- Tests exercise invalid input, provider failure/recovery, display-name retention, data
  cleanup, and calendar reconciliation.

No automated security scan was run. This focused review does not verify live provider
accounts or replace the complete release review checklist.

## Verification

- `npm test`: passed on macOS ARM; host-specific Windows and macOS service lifecycle tests
  were skipped as expected.
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm run format:check`, and
  `git diff --check`: passed.
