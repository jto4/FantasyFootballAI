# Portable backup entry integrity review — 2026-09-28

## Scope

Manually reviewed ZIP entry handling in `apps/api/src/backup-archive.ts`, which parses portable
and older ZIP backups before database validation and image replacement.

## Finding and change

The parser bounded archive size, expanded size, entry count, and allowed paths, but accepted
duplicate entry names. Since `unzipSync` writes entries into an object keyed by filename, the
last duplicate silently replaced earlier data. The parser now tracks names during its pre-decode
filter and rejects repeated paths, including duplicate database or manifest entries, before
decompression.

## Validation

- A ZIP built with repeated `manifest.json` entries is rejected with an explicit error; the
  existing valid, encrypted, image, legacy database, and traversal-path tests pass.
- No automated security scans were run, per repository policy.
