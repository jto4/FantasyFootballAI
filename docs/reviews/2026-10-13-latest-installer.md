# Latest installer rebuild and packaged advice verification — October 13, 2026

Reviewer: Codex. Source base commit: `890ffcb8599dc5598dd7cfc7d9082bbb64ed2938`,
with the current accumulated local changes; no release commit or tag was created.
This is an unsigned macOS ARM contributor build, not a public signed release.

Superseded at the same output filenames by the [October 14 compact-workflow
preview](2026-10-14-compact-workflows.md). This review's exact artifacts remain
preserved locally under `/tmp/sidekick-before-compact-workflows-out`; the hashes
below describe the October 13 build.

## Rebuild and isolation correction

Rebuilt version 0.1.0 with Node 22.23.3, Electron 44.4.5 and the current source,
including the real-data advice fixes. The earlier output was preserved outside
the checkout before replacement. The successful final build includes scoped
fixes found during package review: the Electron API utility process now receives
`SIDEKICK_VERIFICATION_ROOT` and a confined legacy JSON migration path. Previously
the Electron parent had private preferences/data while its child lacked the
verification credential namespace. Ordinary desktop environments are unchanged.

The native runtime verifier independently writes a random disposable credential
to the hashed verification namespace, confirms that the packaged API sees it,
and deletes it in a finally block. This tests the process boundary even when the
ordinary credential listing happens to be empty. Each native run uses private
preferences, Chromium profile, database, logs and credentials. HOME remains
unchanged so the explicitly selected signed-in Codex connection retains native
login. No owner service, settings, database, advice or messages were modified.

A native restart check also found that SQLite insertion row IDs restored advice
in oldest-first order despite the service prepending new advice in memory. The
validated read path now sorts by parsed creation time descending, protecting
weekly recents and bounded retention. The new production-router regression checks
restart, backup restore, weekly recents and replay with no additional model calls.
No schema migration or numerical-model change is involved.

## Artifact inspection

- DMG: `apps/desktop/out/make/Sunday Sidekick-0.1.0-arm64.dmg`.
  SHA-256: `3364d82e978a318b7abe3ecc729539fd94fd19777d588acfa06df079a4966195`.
- ZIP: `apps/desktop/out/make/zip/darwin/arm64/Sunday Sidekick-darwin-arm64-0.1.0.zip`.
  SHA-256: `63ced2569a554973c59bb06c452477f6e225777be069d4c12803b26e67e5628b`.
- ASAR: `0945614abdef9d0266ac15d878b344b08c0a8149127a831116c18173a471671d`.
  Identical in the built app, mounted DMG and ZIP.

`hdiutil verify` and `unzip -t` pass. All 184 compiled API, dashboard, core,
integrations and selected desktop files match the current checkout byte for byte.
Manual inventory inspected 2,688 packaged files and the packager's allowlisted
copy paths; no local state database, native login, `.env` or `.sidekick` research
capture is included. The inspected executable has an ad-hoc linker signature,
without Developer ID, bound resources, Team ID or notarization.

Native GUI verification passes for both the output app and the app launched
from the read-only mounted DMG: packaged identity; Home; localhost API; code
fingerprinting; backup/diagnostic views; independent credential probe; team
preferences surviving restart after clearing renderer storage; explicit Stop;
and flushed API shutdown. The owned DMG was detached after testing. Packaging
also passes API/dashboard, stdio MCP and headless shutdown smokes.

## Advice and source validation

Eleven successful fresh analyses span all six advice types, with **100 independent
final-result arithmetic checks**. Ten cases generated through the packaged
loopback API use real public NFL data and explicit synthetic PPR leagues; each
completes the production's analysis and review passes through existing signed-in
GPT-6.1-Sol. Those cases cover full lineup, one WR spot, draft planning, draft
review, a supported trade, ordinary and reserve waivers, and real moneyline,
spread and total quotes. The raw CLI answers are not separately captured or
graded in this package run. All saved final results validate.

| Case                         | Verdict | Independent checks |
| ---------------------------- | ------- | -----------------: |
| lineup                       | lean    |                 13 |
| start-sit                    | lean    |                  2 |
| draft-plan-complete          | lean    |                 13 |
| draft-review-complete        | hold    |                  9 |
| trade-complete               | lean    |                 15 |
| waivers                      | hold    |                 23 |
| reserve-waivers              | hold    |                 14 |
| betting-moneyline            | hold    |                  3 |
| betting-spread               | hold    |                  3 |
| betting-total                | hold    |                  3 |
| Post-history fresh start/sit | lean    |                  2 |

The capture is 2026 Week 6, with
45,108 parsed player-game rows across three seasons,
12,229 catalog players and
6,035 public weekly forecast rows.
Its SHA-256 is `90b4b2e4310399e11c13c6eb05a14ba36f78b339494fbbeaede888a505cc27f8`. The app retrieves its own live public
data through production adapters; the separate capture is an independent
reference for scoring arithmetic. Current injury-report coverage remains limited.

Lineup excludes the proven Chase bye and recorded Barkley Out, with Cook receiving
the uniquely matched public estimate. The shared WR comparison shows an estimated
8.15-point gap. Draft planning describes Hubbard as conditional depth, without
claiming immediate starter gain; draft review withholds historical grading. The
Cook/Robinson trade shows a conditional remaining-slot change of 53.79 points.
The best Olave add/drop comparison remains a 2.74-point loss; reserve waivers
exclude Charbonnet PUP and Sampson IR without invented weekly estimates. All
three SEA/DEN DraftKings markets return Hold against their matched paired prices
and sportsbook baseline. The later fresh start/sit result also validates.

The ten-case native generation run occurred on payload
`95be5dbf4a72ff0cc0391113c0f488ccdbeca37522f2e05f7b5397bf8d557eef`. After the history correction,
byte comparison proves **store.js is the only compiled application file changed**.
The final artifact replays all ten saved requests without invoking a provider,
generates a fresh start/sit answer, and preserves all eleven results in newest-first
order through native restart. A separate final-artifact pass opens all ten original
results through native hash navigation, including consecutive identical waiver
headlines, with zero renderer errors or unexpected navigation dialogs. Desktop
1280×900 and narrow 390×844 views have meaningful content and no horizontal
overflow; screenshots are retained outside source. Readiness checks, saved-result
reads and replay do not generate additional analyses.

The initial reserve result-view wait timed out; the first harness did not retain
that validated result before cleanup. Its failure is preserved. An independent
transition reproduction, fresh reserve retry and both complete view sweeps pass.
The resume harness's asynchronous fixture seeding was also corrected to match
LocalStore's synchronous mutator contract. The observed restart order defect was
a product issue and was fixed; the fixture-seeding issue was not data loss.

Machine-readable evidence: [installer verification](../research/2026-10-13-latest-installer.json).
Public snapshots/results, temporary harnesses and original failure records are
retained locally in the ignored `.sidekick/research/2026-10-13-latest-installer`
directory. Owner data, native login material and credentials are not included.

Repeat the generic native check after `npm run desktop:make` with
`npm run desktop:verify -- "<absolute packaged executable>" /tmp/sidekick-package-check`.
The retained football harness is dated to the captured Week 6 roster/availability
scenario and is not a general future-season invariant test.

`npm test` passes 907 workspace tests (328 API, 87 dashboard, 261 core, 231
integrations) plus the root runtime/service/process suites; two platform-specific
checks are skipped as expected on macOS. Typecheck, lint, build, formatting and
whitespace checks pass. All 51 v18 sealed numerical source hashes are unchanged.
The native UI was tested with Electron/Playwright because the Browser plugin was
absent. No frontend implementation was changed in this rebuild.

## Scoped ordinary code and security review

Applied the `SECURITY.md` checklists to the rebuild/isolation delta and inspected
the accumulated source's dated reviews, package assembly, runtime boundaries and
artifact contents. The changed environment values are guarded by the already
validated absolute private root. Normal credential identities are preserved;
verification legacy migration cannot import normal state. Listener binding,
host/origin validation, provider/model response validation, subprocess bounds,
non-shell execution and cancellation remain intact. No credentials enter logs,
SQLite, JSON evidence or screenshots. The only credential written is a disposable
probe in its dedicated OS-vault namespace, removed after the check. No dependency
or lockfile change was needed, no delivery or transaction adapter was invoked,
and no automated security scan ran.

## Remaining release and accuracy gates

This run does not prove future forecast accuracy or consistent sportsbook wins.
Real NFL evidence was combined with explicitly synthetic PPR leagues, not an
owner's live roster or verified platform transaction eligibility. Missing current
injury-report publication dates still limit confidence. Live K/DST/IDP, dynasty,
keeper, player props, owner messaging/TCC, interactive drag-install, login startup,
Gatekeeper/Developer ID/notarization, published upgrade, Intel Mac, Windows and
Linux interactive execution remain unverified for this rebuild. The maintainer
owns the publication/platform gates in `release-status.md`; this task creates
local DMG/ZIP artifacts only and does not publish or install over the owner app.
