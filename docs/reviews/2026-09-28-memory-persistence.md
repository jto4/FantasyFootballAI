# Imported memory persistence review

## Scope

Reviewed the local SQLite persistence path for unrelated state changes while profiles contain
large imported conversation histories. The change skips memory-row serialization when profile
IDs and order remain stable and each profile's source text and metadata are unchanged. Changed
profiles continue to be serialized and upserted; additions, removals, or reordering use the
existing full replacement path to preserve row order. App-state clones now copy mutable profile
metadata but share immutable source-text strings. The store update API no longer makes a second
full-state return clone, and report delivery reads settings without cloning profiles or history.

## Findings

- No correctness issue found in the reviewed change.
- Source history remains in the local database and is still included when the profile itself
  changes; only unrelated writes avoid re-encoding it.
- The dashboard and report snapshots continue to omit conversation source text from their
  clones, while conversation-sync paths retain full snapshots where needed.
- The synthetic report path previously grew the API working set about 16 MiB per saved report;
  after the clone changes, the same run stayed between 129.5 and 131.1 MiB through ten report
  saves. Repeated and cross-platform profiling remains necessary.
- Added a SQLite trigger regression test proving unrelated updates produce no memory-table
  writes and profile-note edits still update the row.
- No automated security scans were run, per repository policy.

## Validation

- Full `npm test` passed.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, and `git diff --check` passed.
- The synthetic 80-profile, 4.53 MiB imported-history performance smoke is recorded in
  `docs/performance.md`. State endpoint latency remained low; API RSS was variable at 396–432 MiB
  and remains an open profiling item.
