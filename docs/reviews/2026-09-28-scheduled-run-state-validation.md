# Scheduled-run state validation review — 2026-09-28

## Scope

Manually reviewed restored and persisted scheduled-run history at the local-state trust
boundary, including dashboard-visible fields and recurring occurrence keys.

## Finding and change

Scheduled-run history previously accepted arbitrary array entries. Malformed rows could reach
the schedule dashboard, while unknown fields from a restored backup could be returned by the
state API. State validation now bounds history and result counts, validates IDs, timestamps,
statuses, details, and occurrence keys, rejects duplicate IDs, and projects accepted records
onto the known schema before returning them.

## Validation

- Focused store tests cover valid occurrence keys, malformed fields, duplicate IDs, oversized
  histories, invalid league results, and removal of unknown fields.
- API typecheck passed.
- No automated security scans were run, per repository policy.
