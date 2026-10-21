# Saved-data report scheduling — October 15, 2026

Status: local source, real-clock, packaged and owner restart verification passed. External setup dependencies remain below. Reviewer:
Codex, base main `fdaf98b`, uncommitted `codex/saved-codex-connection` working tree.
No automated security scans or provider/OS permission changes.

## Problem and resulting behavior

Afton can be imported from the owner's authorized Safari session, but scheduled
reports previously always attempted a provider refresh. Those jobs could never
work without separate ESPN credentials. Home still advertised their next planned
run, leaving the owner to discover that limitation after a failure.

A schedule now has an explicit **Use saved data · drafts only** option. The default
remains provider refresh; refresh failure never silently selects saved data. The
saved option requires explicit league IDs, dashboard output and draft mode at the
settings, response-contract and stored-state boundaries. Import/sync age must be
within the existing owner-selected stale threshold (24 hours by default). Missing,
future or expired timestamps stop before provider or model work. Import age does
not establish the publisher's update time. No credentials are read to refresh a
saved-data job, no sync date is fabricated, and automatic delivery is disabled even
if delivery settings change while generation runs.

Report bodies and evidence carry deterministic saved-source provenance, and the
model receives import/source context. This label survives copying/export and is
separate from the model's prose. Restoring a backup pauses saved-data schedules
for owner review. Occurrence claims/restart behavior are retained. A manual retry
uses the current scoped data policy and still creates drafts only. Calendar events
retain their provider-refresh behavior; saved imports use report schedules.

Reports offers a reviewable weekly plan with an explicit saved-data checkbox.
Manual imports cannot enable that plan until the checkbox is selected. The schedule
editor and Settings expose the same data option and disable sending controls in
saved mode. Home, its next-action inbox and Schedule use the server's shared
readiness policy, explaining expired/unsupported data rather than implying a
report is ready to run. Search aliases include saved/offline/imported report data.
A source change during awaited refresh no longer overwrites a newly imported
manual snapshot. Readiness checks both current age and the planned run time: a
copy that will expire before Tuesday is flagged today while keeping the planned
date visible. Currently future-dated imports never look valid.

## Verification

Browser plugin not available; the repository's production-router Playwright
workflow was used. The flow under test is Reports → review saved-data plan → save
scoped draft policy → Home expiry warning → Schedule editor with sending disabled.
Desktop 1440×1000 and mobile 390×844 journeys pass, including the authorized actual
Afton file import. Screenshot review found the new opt-in notice too small; it now
uses a readable 14px control/13px guidance and an 18px checkbox. Existing provider
refresh workflows retain their default behavior.

Core tests cover policy/bounds and age/future/missing timestamps. API tests cover
no provider reads, no fabricated sync, one occurrence, expired/default-refresh
rejection, source changes across awaits, deterministic report provenance,
settings/storage validation and restore pause. The wider source run found one
legacy ESPN fixture still expecting raw ACTIVE instead of the now-readable Active;
its expected normalized value was corrected without changing assertions or math.

A real-clock run using the existing isolated signed-in GPT-6.1-Sol adapter fired at
`2026-10-16T00:59:00.014Z` and saved an actual Afton report at
`2026-10-16T00:59:19.263Z`. It used the owner's existing authorized import time,
not a fabricated new import date. Receipt: one model call, zero league provider
reads, zero sends; restart retains one draft. Duplicate completion and an expired
import stop without another model call. The short rankings report preserves source
provenance, ranks wins then points, identifies the 630.74-point leader and the
10.38/0.90 differences correctly. Private report/receipt/database remain outside Git.

The complete source run passed 1,056 checks with two platform skips (347 API,
89 dashboard, 274 core, 235 integrations, 111 repository); the additional planned-age
core regression passes separately. Typecheck, lint, formatting and build pass.
All 254 browser cases pass with two optional skips; the final changed flows pass
again in 24 desktop/mobile replays.

Exact package receipts and owner configuration are recorded at closeout below. No results establish predictive superiority, live
refresh authorization, Messages permissions, email credentials or signed release
readiness.

## Manual code/security and React review

New settings flow through typed action/domain interfaces and shared validation;
invalid send policies and implicit-all-league scopes fail closed. Unknown/expired
data is bounded before model/provider calls. Saved execution explicitly passes
no delivery regardless of subsequent action changes. Raw imports, names, news and
model text remain prompt-data/escaped display content. Existing loopback, origin,
CSP, credential-store and CLI isolation boundaries remain unchanged. No dependency
or native privilege was added. Source changes are checked across awaited refresh;
existing duplicate claims and occurrence identities remain in use. Backup restore
requires reapproval. Payload/owner-data inspection and platform limitations remain
part of the final package checks.

React review: stable derived readiness, functional plan updates, no new effect or
fetch waterfall, bounded five-action collections, labels/disabled send controls,
existing dialog focus/scroll handling, mobile screenshots and error recovery were
reviewed. No broad refactor is required for this feature.

## Packaged clock and final usability review

The isolated packaged application fired the actual scheduled Afton run at
`2026-10-16T01:07:00Z` and saved its draft at `01:07:18.897Z`. Restart retained
the draft and completed occurrence. Zero active renderer errors or dialogs occurred;
intentional shutdown polling is recorded separately. The normal owner profile now
has explicit Afton-only saved-data draft schedules: rankings Tuesday 09:00 and
matchup preview Wednesday 09:00, America/New_York. Other actions/preferences were
preserved. Home flags that the current imported copy will expire before those
runs; the owner must reimport within the configured age window.

Native review found repeated source/delivery/timing notices and warnings on
on-scheduled cards. Schedule now orders active cards by next run, collapses season
rules, and keeps on-demand cards compact. A friendly-timezone regression caught
during this change was restored before acceptance. Mobile screenshot review also
found inherited Home scroll hiding the next page title. Primary page navigation
now starts at the top, while Back/Forward and search targets retain their own
behavior. Home disclosure choices survive page navigation, allowing native Back
scroll restoration to work on both viewports. No new fetch, listener per card,
module-global state or dependency was added; disclosure state uses functional
updates and skips unchanged values. Browser regressions check the actual scroll
position, title visibility, pending work and expanded Home context.

## Final source and artifact checks

The final full source run passes 1,058 tests (347 API, 90 dashboard, 275 core,
235 integrations, 111 repository checks) with two platform skips. The complete
browser suite passes **258/258** with both opt-in actual Afton and public-market
captures enabled: 1440×1000 and 390×844, all six advice workflows, source
provenance, prop arithmetic, private import/restart, review/send fixtures, unsaved
work/search and Back navigation. No owner delivery occurs in those browser tests.
The first final run caught two legacy commissioner tests toggling an already-open
Home section closed; they now assert the persisted expanded state and retain all
send/destination checks. No production assertion was weakened.

Typecheck, lint, complete formatting, build and whitespace checks pass. Formatting
now excludes generated dist/coverage/installer output; an intermediate checker
was stalled enumerating local build-output directories. The exact sealed research
record exclusions remain unchanged.

Final package API/dashboard, MCP and headless lifecycle smokes pass. The 194
compiled payload files exactly match source output; no owner DB, raw import,
credentials or logs were found in archived paths. All 279 backend/native-entry
files (including runtime node_modules package copies) exactly match the package
that completed the real-clock scheduled report, so the renderer polish does not
change its tested scheduling or model behavior. ZIP and DMG integrity checks pass.

- DMG SHA-256: `c5258526f6512a2d23923cc99f8b1df48ad116c8f56467298758f72acb4afb7c`.
- ZIP SHA-256: `6594592d7802aa92afe28a3258848333392d3e1bdc285665528d7abf548ea68f`.
- Application payload SHA-256: `7f839c9013c76e8513a9b852a05f211aa67e3606488259878a5e380736a4bb9f`.
- Previous exact-clock package preserved at `/tmp/sidekick-before-compact-schedule-20261015/out`.

The release remains an unsigned local macOS ARM preview. Other native platforms,
licensed automatic prop quotes, genuine social sentiment, unique whale identity
and independent prospective forecasting value remain outside these verification
claims. Numerical betting models and the model-promotion gate remain unchanged.

## Final native and owner closeout

The final packaged runtime verifier passes isolated preferences/credentials,
nonpersistent test sessions, both themes, team persistence, diagnostics, stop/
restart and clean shutdown. The exact final Afton package test imports the actual
source, reopens SQLite with 198 forecasts, retains team 10, renders compact saved
schedules on desktop/mobile, verifies navigation to the top and preserves expanded
Home context. Zero active errors or dialogs occur; connection-refused polling
during deliberate teardown is listed separately in its receipt.

A fresh public packaged capture for HOU at JAX 42.5 has one relevant headline but
no verified exact-line Kalshi price/trade tape. The charts show unavailable data
and prospective freezing stays disabled. No production prediction is written.
This complements the earlier genuine eligible SEA–DEN freeze and the final
real-capture browser replays; it is not a second eligible prospective observation.
Both archives embed the exact verified application payload, confirmed by streaming
the ZIP entry and mounting the DMG read-only, then detaching it.

The final ordinary owner app was reopened at loopback port 62425 with Afton, team
10, saved GPT-6.1-Sol, the original one unsent report and both scoped weekly saved
draft schedules intact. Native Home shows the writer ready and correctly warns
that the current copy expires before the next run. Automatic sends/replies remain
off. No additional owner message or email was sent during this closeout.

External setup remains explicit: packaged Messages needs owner-granted Full Disk
Access; email needs a configured provider; automatic provider refresh needs ESPN
authorization. Saved-data jobs instead require a recent owner import. These were
tested as unavailable rather than bypassed or claimed to work. No forecast
superiority, signing/notarization or other-platform native validation is claimed.

QA environment: localhost production routers and private SQLite, Chromium
1440×1000/390×844, Electron 44.4.5 macOS ARM64. Browser plugin not available;
repository Playwright used. Page identity, meaningful rendering, no framework
overlay, console health, screenshots, keyboard/scroll/history and target-flow
interactions pass. Commands: Node 22 `npm test`, `npm run typecheck`, `npm run lint`,
`npm run format:check`, `npm run build`, opt-in full `playwright test`, desktop
`make`, native runtime/Afton/market scripts, artifact comparison and archive
integrity checks. For future interactive frontend QA, the Browser plugin is an
optional improvement to in-app inspection.
