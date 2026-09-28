# Database recovery intermediate-file review — 2026-09-28

## Scope

Manually reviewed raw-page SQLite recovery in `scripts/recover-database.mjs` and its salvage
caller, focusing on the temporary database created by the external SQLite CLI.

## Finding and change

The SQLite CLI created the intermediate recovered database using the process umask. On systems
with a permissive umask, that could leave private league data readable by other local accounts
while row validation and backup creation ran. Recovery now removes a stale destination and
pre-creates the new file with owner-only mode before starting SQLite. The recovery flow still
validates the resulting database and removes the temporary database and journals after salvage.

## Validation

- The focused recovery test checks owner-only mode on POSIX and exercises page recovery when a
  local SQLite CLI with `.recover` is available.
- No automated security scans were run, per repository policy.
