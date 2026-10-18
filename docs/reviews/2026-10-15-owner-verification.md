# Owner Afton verification — October 15, 2026

Status: available-access implementation and verification completed; external setup dependencies remain explicit below. Private
owner exports, messages, model evidence and screenshots remain outside Git.

## Confirmed findings and fixes

The owner-authorized Safari session can read the actual private ESPN league; the
app's unauthenticated connector receives HTTP 401. A browser login does not grant
the app provider credentials. The import alternative accepts an explicitly saved
JSON source (6 MiB maximum), validates league/season, team/roster/draft bounds and
unique ownership, and keeps normalized football data only. It discards member
contacts, notification configuration and account fields. No cookie extraction,
credential copying or OS permission changes are involved.

Imported leagues retain snapshot provenance and an import time, with no invented
provider update/sync time. Manual refresh opens reimport; automatic refresh and
scheduled refresh/report paths require an actual provider connection. Existing
provider-backed leagues retain their behavior.

The actual file has 12 teams, 199 roster entries and 192 draft picks. Nine current
owner starters are preserved. 198 weekly publisher forecasts reproduce both the
publisher's applied-component sum and raw expected stats multiplied by the exact
league/position scoring rules. Actual stats, duplicate forecast periods, mismatched
identities, unsupported arithmetic and negative estimates outside the existing
projection contract are withheld. Forecasts cover the current scoring week only;
they do not establish remaining-season value or a validated model edge.

A restart test caught source URLs containing a query string, which existing
projection storage validation forbids. Source metadata now uses ESPN's clean HTTPS
football page; the league remains identified in its typed record. An API test and
an opt-in real-data browser test now reopen SQLite before accepting the import as
verified. No owner database received the invalid intermediate implementation.

Mobile rendered testing caught a taller-than-viewport import dialog whose submit
button could not be reached by normal scrolling. Connection/setup dialogs now
have a viewport bound and their own scroll area. Existing focus trapping/background
scroll restoration is preserved. Home opens the connection form in one click,
shows snapshot freshness explicitly, and omits neutral Normal/Active/Healthy tags
from availability alerts. ESPN reserve/uncertain statuses use readable labels.

Installed imsg 0.15.10 returns `any;` stable chat GUIDs alongside an explicit
service. Sending now permits these only after uniquely matching current metadata
with service iMessage; SMS/unknown/duplicate matches fail closed. The existing
forced iMessage/no-SMS-fallback and uncertain-send/no-auto-retry policy remains.
One authorized owner test was accepted and matched in scoped outgoing history.
The CLI supplies no delivery-status field, so this is not confirmed phone delivery.
The packaged owner app's explicit selected-chat read test returns 503: Full Disk Access is not granted in that app context. No messages were imported/sent by the probe and no OS permission was changed. Email has no configured
Resend credential; no email was sent and no unrelated mailbox was used as a substitute.

The rendered Afton charts exposed separate per-matchup bar scaling: 1 and 10 points
looked equal. All matchup bars now share the full week's score domain, including
negative scores, and expansion keeps the scale stable. A rendered regression
checks proportional bar lengths. Snapshot report libraries also explain the
provider-access requirement and disable new automatic plans instead of inviting a
schedule that is known to fail; existing schedules can still be reviewed/edited.

## Verification so far

- Source suites total 1,049 passes and two platform skips: 342 API, 89 dashboard,
  272 core, 235 integrations and 111 repository checks. The full run preceded
  the last UI/text changes; affected complete dashboard/core suites and relevant
  browser journeys were rerun after those changes.
- Production-router browser tests: 12 desktop/mobile import, restart, keyboard,
  background-scroll, stale-result and narrow-dialog cases pass.
- Native GPT-6.1-Sol uses the existing isolated signed-in adapter with real Afton
  and public football evidence. The first lineup run lacked supported ESPN scoring
  and yielded insufficient evidence. Verified publisher forecasts now permit a
  legal conditional lineup; confidence remains low because freshness/availability
  and prospective forecast quality are unverified. All six workflows return valid results against real inputs; waivers/trade/draft
  comparisons retain insufficient-evidence outcomes when required weekly/seasonal
  forecasts are absent. Betting holds without a supported independent edge; no platform transaction or bet is authorized.

All five real Afton report types generated (157–178 words each), retained numeric
chart snapshots and survived restart with zero delivery calls. Ranking order,
points lead/difference, defense count and six exact draft-pick claims passed nine
separate arithmetic/source checks. Reports correctly withhold draft grades and
explain in-season context when selecting seasonal templates. A final wording
correction distinguishes recorded scoring compatibility from forecast accuracy.

The complete browser suite passes 250 cases with two optional skips. The 272 core
checks pass again after wording changes. First packaged real-data import/charts/
restart checks succeeded but its harness counted connection-refused polling during
intentional teardown as active errors; the harness now tracks teardown separately
and retains active errors as failures. Final UI additions require the rebuilt
artifact and owner verification; that closeout remains pending. No automated security scan has run. No source result implies profitability,
consistent sportsbook superiority or complete provider support.

## Startup race and current owner setup

The actual owner launch exposed a saved-runtime readiness race. The report-writer
probe started after state load, then credential-list arrival canceled it. Its
already-checked signature prevented a replacement check, leaving Home in setup
while real report generation worked. A controlled delayed-response browser test
reproduced this in both viewports. Native runtime checks now ignore unrelated API
credential-list changes, canceled probes release their in-flight signature, and
aborted responses cannot set readiness. Both regression cases and 18 additional
Codex/compact/import journeys pass (two opt-in real-file cases skipped in this
particular replay; earlier real-file runs passed).

The normal owner profile was backed up locally before importing Afton. It now has
its 12-team manual snapshot and validated weekly forecasts, selected owner team,
short report length, configured owner iMessage target/local provider and supplied
email recipient. Polling/automatic replies remain off. The saved Codex 6.1 Sol
runtime is preserved. A genuine packaged-app matchup preview completed through the
durable generation queue and was saved as a short draft, with no delivery. All
six pairwise forecast sums, leading season points and record context match the
captured source. The exact final owner-window launch now shows ‘Report writer is ready.’ without manual setup. The selected team and saved draft survived the restart.

## Manual review

Reviewer: Codex, October 15, 2026; base main `fdaf98b`, uncommitted working tree on
`codex/saved-codex-connection`. This is a local unsigned preview, not a publication.
The new import input was traced through binary-size bounds, exact identity checks,
allowlisted normalization, projection arithmetic, SQLite restart, prompt-data
blocks and escaped rendering. Account/member data is discarded before persistence;
raw owner evidence stays outside source/artifacts. Loopback/host/origin/CSP rules,
OS credential storage, native AI isolation and draft/send policies are retained.
No new runtime dependency, authentication bypass, OS grants or automated security
scan was introduced. imsg retains bounded output/timeouts, no shell, fixed service
flags and no ambiguous-send retry; unified GUIDs now require current exact service
verification. Scheduler guards fail before credentials/provider work for manual
snapshots. UI loading/error/recovery, focus/background scroll, mobile bar geometry
and saved-runtime cancellation have regression evidence. API storage/projection
source validation agrees with generated metadata. No unrelated refactor is needed
for these fixes; broad legacy storage-validation unification remains separate work.

Interim final package checks matched 193 compiled files and found no owner database,
logs, credentials or raw captures in the payload. ZIP and DMG integrity passed;
quiet native verification and real Afton import/charts/restart passed with zero
active renderer errors/dialogs. Intentional teardown polling failures are retained
separately. The startup fix's superseding package is undergoing the same closeout.
Signing/notarization, other-platform native checks and prospective predictive value
remain unverified. Owner iMessage Full Disk Access and an email provider are external
setup dependencies; version checks or fixture sends do not establish those grants.

## Superseding installer receipts

The final startup-fix package passes API/dashboard, MCP and headless lifecycle
checks. Final compiled-payload comparison: 193 files, zero mismatches or unexpected
owner-data files. Packaged actual-file import, charts, 390px layout, selected-team
persistence and SQLite restart pass again with zero active errors or dialogs.
Final ZIP extraction integrity and DMG checksums pass. Native runtime receipts match the final payload digest and are kept outside Git. The ordinary owner-window readiness check also passes; the genuine short report was reopened for review, left unsent, and the app was left on Afton Home.

- DMG SHA-256: `64f33d9047c954d7278bd253638908cc5b08ad8755834dcd1ef3df26ed621b0f`.
- ZIP SHA-256: `5baafe652700de3c219ee69e9c4765c5946f4e7b21792494b997e5f68814c0bc`.
- Application payload SHA-256: `89b3ef6b18784920f65f0193405ad9469d98902fc374771518f5d1290c344e21`.
- Artifact: `apps/desktop/out/make/Sunday Sidekick-0.1.0-arm64.dmg`.
- Pre-Afton package preserved at `/tmp/sidekick-before-afton-20261015/out`.

These receipts supersede intermediate packages created while investigating
rendered chart scale and the startup probe race. This remains unsigned local
verification; device delivery, provider authorization and forecasting superiority
are not inferred from the build or regression passes.

Owner closeout: the final normal app at loopback port 49957 retains Afton, team 10,
short-report preference, the original saved Codex model and one review draft.
Home explicitly shows the report writer ready; Reports shows the manual-snapshot
provider requirement and the saved forecast-backed preview. No user login, native
permissions, external provider credentials, automatic sends or league transactions
were changed. iMessage remains configured but its packaged read check needs owner
Full Disk Access; email sending needs a configured provider. Automatic ESPN/report
refresh needs an authorized provider connection. The broader owner verification
goal remains active with those limits and any subsequent owner feedback tracked;
this local implementation/build batch is verified.

## Saved-data scheduling and final full-audit closeout

The superseding [saved-data report review](2026-10-15-saved-data-reports.md) records
the final verified installer, real packaged clock execution and ordinary owner
restart. It resolves the manual-snapshot report limitation through explicit
scoped draft-only saved-data schedules, with current/planned age checks and no
provider refresh or delivery. Full final source checks: 1,058 passes, two platform
skips; all 258 desktop/mobile browser cases pass with both real-data opt-ins.
Final package import/charts/198 forecasts/restart, navigation and saved schedules
pass without active renderer errors or dialogs. The owner app is running the
newest build with the selected team, saved Codex writer and genuine unsent draft
intact. Earlier package hashes/ports above are historical and superseded by that
review. Packaged Messages permissions, email credentials and authorized ESPN
refresh remain owner setup dependencies; no bypass or forecast edge is claimed.
