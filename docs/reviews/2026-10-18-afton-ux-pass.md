# Afton walkthrough and polish — October 18, 2026

A walkthrough of the dashboard with the owner's real Afton ESPN league (12 teams), followed
by fixes. Measured on local macOS ARM with Node.js 22.23.3.

## Data handling

Only the Afton league row and its 198 weekly ESPN forecasts were copied, read-only, from the
desktop app database into a scratch profile with explicit `SIDEKICK_DATABASE_FILE`,
`SIDEKICK_USER_DATA_DIR` and `SIDEKICK_VERIFICATION_ROOT`. Settings, delivery channels,
credentials and AI logins were not copied, so no model call or message was possible.

An earlier "isolated" preview set only `SIDEKICK_VERIFICATION_ROOT` and opened the owner's
source-run database at `~/.sidekick/state.sqlite`. That database held 0 leagues, 0 reports and
0 delivery claims; startup applied the schema migration after writing its `before-upgrade`
safety copy, which is retained in `~/.sidekick/backups/`. The cause is fixed below.

## Fixes

- **Store isolation:** with a data directory but no explicit database file, the API now keeps
  the database in that directory instead of `~/.sidekick`.
- **First-launch crash (PR #13):** `MarketResearchStore` opened SQLite before the data
  directory existed, crashing a fresh source install and the Windows Task Scheduler CI job.
  It now creates the directory (mode 0700) first; regression test added.
- **Readiness on game day:** "4 of 15 players have a week estimate" was correct (estimates
  are withheld once a game kicks off) but read as broken. The coverage line now states how
  many players' games already started or finished.
- **Copy:** ESPN/Yahoo/Sleeper names, plain snapshot/import wording, short availability and
  waiver notes, one snapshot notice on Reports, "AI connection" and "Model" in Advice, and
  shorter Settings privacy notes that keep each fact. The header date no longer wraps.
- **Default model:** new installs use `gpt-6-luna` with a 4,000-token output budget instead
  of `gpt-4o-mini` with 1,200. Saved settings are unchanged.
- **Structure:** Settings (1,292 → 1,110 lines) and Members (1,069 → 980) moved webhook,
  sync-status, diagnostics, credential-test and projection-import logic into hooks.

## Checks

Typecheck, lint, format check, all unit/integration suites and 254 Playwright desktop/mobile
cases pass. `npm run perf:smoke`: API startup 175 ms, full state p50 2.18 ms, report pipeline
p50 38 ms, startup dashboard assets 457 KiB (was 634 KiB before lazy loading), working set
137 MiB.

Manual code and security review of this diff: no dependency, subprocess, outbound network or
credential-handling changes. Lazy page chunks and idle prefetch are same-origin under the
existing CSP. The database path change only reads owner-set environment variables.

## Not done

- The macOS installer was not rebuilt: `npm run desktop:make` writes to `apps/desktop/out/`,
  which the owner's running desktop app uses. Rebuild with the app closed.
- `gpt-6-luna` was not exercised with a live API key; owner verification is needed.
- Signing, notarization, Windows/Linux/Intel interactive checks and live provider gates are
  unchanged.
