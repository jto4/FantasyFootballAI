# Advice data and setup pass — October 21, 2026

Follow-ups from the Afton walkthrough, checked against the real Afton league in an isolated
profile. Local macOS ARM, Node.js 22.23.3.

## Changes

- **Advice opens quickly:** Home calls `POST /api/advice/warm` once leagues load and every five
  hours. It preloads only public stats and the Sleeper catalog for connected seasons; it never
  calls AI or probes signed-in CLIs. Afton advice options: 4.1 s cold → about 0.5 s.
- **Readiness sources grouped:** sources differing only by season, week, page or game collapse
  into one row with a file count, latest retrieval time and worst state. Afton went from 50+
  rows (silently cut at 30) to 17.
- **ESPN live refresh:** reconnecting an existing league keeps its display name and connection
  date. A snapshot league's "Import updated roster" explains that saved ESPN access lets
  Connect league switch it to automatic refresh. ESPN access steps now cover Safari.
- **Structure:** `ConnectLeagueDialog.tsx` extracted; `App.tsx` 1,574 → 1,417 lines.

## Findings left for the owner

- **Injury feed is undated (resolved with owner approval):** the 2026 nflverse
  `injuries_2026.csv` no longer includes `date_modified`, so every matched report was
  "undated". An undated report for the requested week now counts as `week-window`: current only
  after the previous week's last verified kickoff and before the player's own verified team
  kickoff, then stale. Unverified schedules and conflicting rows stay undated or ambiguous.
  Advice and readiness label it "this week's report, no update time from the source, valid until
  kickoff". Real Afton Week 7 on Wednesday: A.J. Brown (NE) valid until the Thursday-night
  kickoff; the other 16 players have no Week 7 row yet.
- **Repository is in iCloud Drive:** `~/Documents` sync created conflict copies such as
  `advice-warnings 2.ts`, `.git/index 2` and offloaded `dist/* 3.js` files. Reading an
  offloaded file blocked a test. All copies were identical or build output and were removed;
  `git fsck` is clean apart from dangling objects. Moving the checkout out of iCloud (or
  excluding it) prevents recurrence.

## Checks

Typecheck, lint, format check, all unit/integration suites and 254 Playwright desktop/mobile
cases pass. One forecast browser case timed out once under full-suite load and passed 30/30 on
repeat.
