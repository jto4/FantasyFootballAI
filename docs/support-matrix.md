# Support matrix

The current macOS ARM preview supports quiet disposable verification: in-memory
credentials and browser session, mock Keychain, popup-free unsaved Stop/restart
and nonmodal expected errors. Source tests (1,020), browser cases (38), six native
saved-advice workflows and a disabled-vault-binding copy pass. Normal OS vault
access is unchanged and is not established by the simulated test backend.
[Current review and exact artifacts](reviews/2026-10-14-quiet-verification.md).

The October 14 macOS ARM preview includes the compact primary workflows and passes
160 desktop/mobile browser cases, native saved-result views across all six advice
types, output-app and mounted-DMG lifecycle/appearance/isolation checks. Its model
runtime is unchanged. See the [current artifact and limits](reviews/2026-10-14-compact-workflows.md);
owner usability and other-platform interactive checks remain pending.

The preceding unsigned macOS ARM installer included the current fixes and passed
packaged advice verification across all six workflows: eleven successful analyses,
100 independent checks, final native result views and newest-first history after
restart. Output-app and mounted-DMG checks also verify child credential isolation
and white/black appearance. See the [installer review](reviews/2026-10-13-latest-installer.md)
for artifact hashes, initial failures, generation lineage and remaining gates.

All six advice workflows have a real public-data/native model review: 20 analyses,
40 validated responses and 190 independent checks. Availability/identity and result
clarity fixes are implemented; see the [scope and limits](reviews/2026-10-13-real-advice-quality.md).

The six weekly-decision recommendations are implemented in source. Current checks
and Mac artifact evidence are recorded in the [weekly-decision review](reviews/2026-10-13-weekly-decision-workflows.md); live forecasting skill, owner messaging/TCC and signed distribution remain separate gates.

Local macOS imsg text/history integration is implemented alongside legacy BlueBubbles. Installed 0.15.10 version-only checks and fictional adapter/API/browser workflows pass. The latest macOS ARM installer includes its compiled integration; real owner chat reads/sends and packaged TCC grants remain unverified. See the [imsg review](reviews/2026-10-13-imsg-support.md).

The [October 13 advice/model review](reviews/2026-10-13-advice-model-review.md)
verifies joint draft FLEX allocation, explicit player-identity guards, optional
waiver drops with both-pass numerical validation, selected/candidate forecast
error reporting, and sportsbook-only betting qualification. Controlled tests and
118 advice browser journeys pass. That review's initial native-quality attempt
stopped before generation on the exact-version gate. The subsequent
[Codex compatibility review](reviews/2026-10-13-codex-compatibility.md) adds verified
macOS isolation for the installed 0.162.0-alpha.17.2: fixture/existing-home captures
and a signed-in probe pass. Its full fresh model-quality run passes 23/23 cases across all six workflows
with 46 validated calls and no validation/grading failures. This is fictional
decision-process evaluation, not prospective football/betting accuracy. Earlier live-provider claims below remain historical evidence for
their recorded versions. New-version Windows/Linux and installers are unverified.

Current readiness and gates live in [release status](release-status.md). This matrix retains detailed verification evidence; passing fixtures or package smokes do not prove live account behavior or interactive installation.

White default and optional dark appearance passed headed Chrome checks on macOS
at desktop and mobile widths, including saved preference, synchronized controls,
keyboard radios, cross-tab changes, storage failure, and themed dialogs. See
[appearance review](reviews/2026-10-13-appearance.md). A focused Electron 44.4.5
ARM macOS harness also verified the real preload and theme handlers, including
restart on another port. This change has not been verified in rebuilt installers.

The 2026-10-02 source workflow changes are reviewed in [the commissioner workflow record](reviews/2026-10-02-commissioner-workflows.md). Local checks use Node 22.23.3; source commands now support only Node 22 (22.13 minimum), with `.nvmrc` and CI pinned. Older Node 25 measurements below remain historical, not supported-runtime guidance. September package hashes describe September artifacts and do not include this October source slice. Fresh three-OS source and unsigned package checks passed on 2026-10-04; see [integration evidence](reviews/2026-10-04-main-integration.md). Intel Mac distribution, live accounts, signing, and owner-device lifecycle remain release gates.

## Platforms and runtimes

| Area                        | Implemented path                                                                                                                                                                                                    | Current verification and limits                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sleeper                     | Public league API; league, roster, draft, and matchup data where returned by the provider                                                                                                                           | Adapter contract tests use mocked responses; a read-only live smoke against Sleeper’s official historical 2018 sample normalized 12 teams, 81 scoring fields, and 180 draft picks. Its current player catalog could not map retired/historical roster IDs, and current-season owner league/player mapping remains unverified. See `docs/reviews/2026-09-28-sleeper-live-smoke.md`.                                                                                                       |
| Yahoo Fantasy               | Owner-configured Yahoo developer application and OAuth token                                                                                                                                                        | OAuth and adapter tests use mocked responses. Application approval and live account verification belong to the owner and remain outstanding.                                                                                                                                                                                                                                                                                                                                             |
| ESPN Fantasy                | Public leagues without a session; private leagues with owner-supplied session credentials                                                                                                                           | Adapter tests use mocked responses for offensive-player flex and non-H2H formats; unknown ESPN roster-slot formats are withheld, and player records omit unmapped numeric slot labels so incomplete lineups remain unavailable for starter projections. Settings can test the saved session against an already connected league without persisting fetched data. Private-league access uses an undocumented endpoint and remains a compatibility risk; live verification is outstanding. |
| AI API                      | OpenAI-compatible endpoint with owner-provided key; data-free model discovery and runtime test                                                                                                                      | Provider tests cover bounded requests and responses. A successful data-free test confirms connectivity, not report quality or provider billing.                                                                                                                                                                                                                                                                                                                                          |
| OS credential store         | Keytar-backed credentials using the host operating system's credential manager                                                                                                                                      | Credential manager contract tests pass; `npm run credentials:smoke` completed a random-value save/read/delete round trip on macOS at 10:41 UTC on 2026-09-28. CI now runs native round trips on macOS, Windows, and Linux (with a temporary GNOME Keyring); the hosted three-OS credential-store round trips passed in run `36373316213`.                                                                                                                                                |
| Local AI CLI                | Owner-selected executable and arguments, launched without a shell                                                                                                                                                   | Process handling is covered by tests. The CLI and its configuration remain the owner's responsibility.                                                                                                                                                                                                                                                                                                                                                                                   |
| Apple Foundation Models CLI | Apple's `fm respond` command on supported macOS 27+ systems                                                                                                                                                         | Availability is checked on the local Mac. Live runtime verification is outstanding; prompts are passed as process arguments.                                                                                                                                                                                                                                                                                                                                                             |
| News                        | ESPN NFL, PFF, FOX Sports, CBS Sports, and Pro Football Talk feeds; optional licensed nflverse injury CSV                                                                                                           | `npm run news:smoke` returned 10 parseable headlines and citation URLs from all five sources at 10:40 UTC on 2026-09-28. Transient GET retries are bounded; availability can change. FOX Sports use has attribution and noncommercial-use limits. See `docs/reviews/2026-09-28-news-feed-smoke.md` for the point-in-time results.                                                                                                                                                        |
| Email                       | Resend outbound mail and owner-triggered inbound message import                                                                                                                                                     | Provider behavior is tested with mocked requests. Live delivery is not verified.                                                                                                                                                                                                                                                                                                                                                                                                         |
| SMS and group messaging     | Twilio SMS, existing Twilio Conversations groups, BlueBubbles iMessage groups, and optional local macOS imsg text/history; opted-in agent mentions can create review drafts or explicitly enabled automatic replies | Adapter/API/browser fixtures pass; installed imsg 0.15.10 version-only probe passes. Real Twilio, BlueBubbles and imsg delivery, native owner history/TCC grants and rebuilt installers remain unverified. imsg requires a local Mac signed into Messages; BlueBubbles requires an owner-managed Mac server.                                                                                                                                                                             |
| Image generation            | OpenAI GPT Image and Stability AI Stable Image Core APIs, with private local image storage                                                                                                                          | Both API request paths and local image storage are tested. Live provider-account verification remains; API usage may incur charges.                                                                                                                                                                                                                                                                                                                                                      |
| MCP                         | Local stdio server; packaged desktop mode can use the running local API                                                                                                                                             | Source tools have tests. Packaged handshake and a `list_leagues` call passed on macOS ARM and Linux CI. The hosted Windows runner could build the executable but timed out before the packaged Electron MCP process initialized; its package job now checks the executable and skips GUI/MCP/headless runtime smokes. Protocol behavior is covered by cross-platform tests, while packaged Windows launch remains an owner-run support gate.                                             |

## Operating systems and distribution

| Path            | Current status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source checkout | Requires Node.js 22 LTS (22.13 minimum; pinned version in `.nvmrc`) and npm. Clean `npm ci`, the full test suite, typecheck, lint, formatting, and production build passed on macOS ARM with Node.js 22.13.0 after moving to `better-sqlite3` 12.11.1; the prior 13.0.3 prebuild segfaulted on this runtime. The public repo is [github.com/jto4/FantasyFootballAI](https://github.com/jto4/FantasyFootballAI). Hosted run `36423191167` passed source checks on macOS, Windows, and Ubuntu, including the minimum Node.js runtime, real Linux systemd and Windows Task Scheduler service lifecycle checks, and all three package jobs. The hosted Windows runner builds the installer and verifies its executable but does not start the packaged GUI app; interactive Windows launch and installation remain unverified. Per-user service installers exist for macOS, Windows, and Linux. Windows CI creates and removes a real per-user Task Scheduler task, launches the built API under a second isolated task, verifies its health and temporary SQLite state, and exercises graceful stop/restart/uninstall. Ubuntu CI installs a real systemd user unit and verifies the built API health, SQLite persistence, status, stop/restart, and uninstall. A real macOS LaunchAgent install/start/status/stop/restart/uninstall cycle has now been exercised on the owner Mac against a temporary home, database, and port. Actual Windows sign-in behavior remains outstanding.                                                                                                                                                                                                                                                                       |
| macOS desktop   | ARM DMG and architecture-specific updater ZIP rebuilt from current source on 2026-09-28 under Node.js 25.9.0/npm 11.12.1 with `better-sqlite3` 12.11.1, stable Electron Forge 7.11.2, and a maintained `@electron/rebuild` 4 override; packaged API/dashboard, MCP, and headless API health/clean-shutdown smokes passed, the optimized hero WebP was confirmed in app.asar, and `hdiutil verify` confirmed the DMG container checksum. DMG SHA-256: `0a4fa1155e8801eb548d36ea0fd6a926e647d7e33b422e1c2f94e404838f1e09`; updater ZIP SHA-256: `2be26a00661b1ca3a2e34570c44fb83931cb6b5a1abb2af0738b297a4d9f2c47`. League disconnect confirmation/error handling and duplicate/ambiguous report-send safeguards are included. Startup recovery attempts raw SQLite page salvage when an installed CLI exposes `.recover`, then validates rescued application rows; the CLI is not bundled and platform availability remains to be verified. The app includes encrypted portable backups, member-context controls, writing-style presets, Resend inbox, iMessage setup, group-chat consent checks, and optional CBS Sports news. The artifact is unsigned and not notarized; only local package production and smoke checks are verified. A new `macos-15-intel` release job builds a separate x64 installer; hosted verification is pending. The packaged macOS GUI was launched locally with an isolated data folder; first-run setup and cited news rendered, and quitting the app cleanly stopped its API. The app bundle was copied from a read-only-mounted DMG into a temporary Applications folder and its headless health/shutdown smoke passed; interactive install, upgrade, and tray/sign-in lifecycle still need owner-machine verification. |
| Windows desktop | Hosted run [36423191167](https://github.com/jto4/FantasyFootballAI/actions/runs/36423191167) built the Windows Squirrel package and verified the packaged executable. The hosted runner does not reach Electron initialization, so CI skips packaged runtime smoke there. A real packaged MCP handshake, GUI launch, install, upgrade, and sign-in check remain owner-run requirements. Windows CI also ran a native data-copy check and confirmed its destination ACL is limited to the current account for nested folders/files in run [36377266321](https://github.com/jto4/FantasyFootballAI/actions/runs/36377266321). Release assembly now requires and validates Squirrel `RELEASES`, full package, and installer assets; the Windows native updater is implemented but has not been exercised with a signed published release. Interactive GUI launch, full Settings move/restart, install, upgrade, and sign-in checks remain unverified.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Linux desktop   | DEB and RPM package builds and packaged API/dashboard, MCP, and headless shutdown smoke checks passed in hosted run `36423191167`. The Linux source CI checks POSIX permission modes on copied data folders and files. Native interactive install, upgrade, full Settings move/restart, and sign-in checks remain.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Public release  | Version tags assemble Linux and Windows ZIPs plus separate Apple Silicon and Intel Mac ZIPs, installation instructions, license, and checksums. Settings checks the latest published stable release and opens the official release page for manual download; there is no public stable release yet, and installer application is manual. Signed packages and a published end-user release remain outstanding.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

See the [setup guide](setup.md), [desktop installation guide](release-install.md), and
[implementation plan](implementation-plan.md) for configuration details and remaining
release gates. Use only platform access and credentials authorized by the league owner;
this project does not bypass provider authentication or access controls.

## Workflow reliability verification

Workspace search uses local catalog matching and title/type metadata lookup. Focused tests
cover everyday phrases, typos, route bookmarks, literal SQL punctuation, and old reports outside
recent summaries; browser journeys cover every available browser setting and navigation guards.
This does not establish native Mac/Windows accessibility or assistive-technology coverage.

The October 5 local operations slice extends this with cancellation, archived request lookup,
URL/Back/Forward recovery, diagnostics, routine encrypted backups, and dry-run validation through
production routers. The public Sleeper catalog check returned 12,229 normalized players; the
captured historical sample retains 12 anonymous roster records, 81 scoring fields, and 180 draft
picks. See [the operations review](reviews/2026-10-05-local-operations.md). These checks do not
establish current-season private-account semantics. A fresh macOS ARM package was attempted
but node-gyp could not detect the installed Xcode/CLT version. The reusable `desktop:verify`
command is implemented; native Windows/Intel execution, signing, and signed updates remain
unverified for this source. Earlier artifact/build evidence below is historical.

The October reliability slice adds browser coverage through production loopback/state, league, Settings, provider, generation, and delivery routes with separate temporary SQLite databases per test. Controlled AI, league, news, delivery, and credential interfaces replace external services. The journeys cover request deduplication/reload, guided setup, revision conflicts between windows, frozen uncertain-delivery retries, pagination, and background polling with unsaved edits. Fast mocked journeys remain for focused presentation behavior. See [the dated reliability review](reviews/2026-10-02-workflow-reliability.md) for exact checks and limits. These fixtures do not establish live-provider, signed-package, or native-device verification.

The October 5 beginner-experience slice adds local desktop/mobile Chromium journeys for
platform-link detection, new and existing AI setup, connection failure/retry, settings
conflict without a key write, report-type selection, exact saved-message/recipient
confirmation, illustrative voice presets, review-only schedule presets, automatic-send
consent, sticky save feedback, ordinary delivery credential fields, and recovery after a
failed startup connection test. Search continues to reach every browser setting through
Advanced disclosures. Production routers and temporary SQLite are exercised with
controlled credential/AI/league/delivery interfaces. This does not establish live Yahoo
app approval, private ESPN account setup, live provider billing/delivery, native packaged
behavior, screen-reader support, or usability with representative nontechnical users.
See [everyday use](usability.md) and the dated operations review for scope and evidence.

## Tasks and searchable help follow-up

Local source adds fictional sample exploration, saved-text copy/download, supported
native share with fallback, negation-aware task previews, inline Schedule editing,
planned next runs, safe setup progress, Home status, and in-app Help & FAQ. The
October 5 follow-up ran 64 desktop/mobile Chromium journeys with production loopback
routers/SQLite and controlled external interfaces, plus the full ordinary suite.
The focused follow-up rechecks the complete settings catalog including Yahoo access.
See [the review record](reviews/2026-10-05-task-search-help.md) for commands and limits.

Copy/download were exercised with fictional text; native share used a controlled
browser interface and does not establish actual OS target delivery. Human usability
sessions are pending participants, and a managed AI gateway is a proposed design,
not a working service. Live/private provider accounts, native packaging, other
browsers, screen readers, and enrolled billing remain unverified.

## Advice API and dashboard integration

October 7 local verification covers the production advice router, SQLite migration
7/history/backup/restore, and the lazy Advice page. Deterministic dummy AI, football,
news and injury interfaces exercise all five fantasy modes and spread, total,
moneyline and player props, source/number validation, saved bookmarks/reload,
search/Help/Home navigation, cancellation and invalid-model errors. The expanded
suite passes 128 desktop/mobile Chromium journeys, including 24 new advisor cases
and 320×568 prop entry, plus 540 workspace tests and 12 service/recovery integration
checks. Build, typecheck and lint pass. A focused contract check also passes after
bounding optional perception fields. See [advice](advice.md) and [tasks](tasks.md).

These fixtures do not establish private-platform scoring/identity coverage, live
model recommendation quality, calibrated betting forecasts, native accessibility,
other-browser behavior or owner billing. Richer opponent/role context, broader
abstention evaluation and larger-league budgeting remain active work. No owner
credential, real delivery or betting execution is used in these checks.

The subsequent model/evidence pass verifies discovered official model preferences,
request-local model/output-limit overrides, Responses payload/final-text parsing,
no generation during model listing, unavailable-model rejection, saved-price
isolation and old-history compatibility. Deterministic policy prevents incomplete
facts or uncalibrated forecasts from producing strong picks. Build, 551 workspace
tests, 130 full Chromium journeys, typecheck and lint pass with dummy providers.
No owner credential was read or written and no live paid model call was made.
GPT-6 Astra/Sol availability and football quality are unproven on the owner's account;
capability preference follows official model documentation rather than football
benchmarks. Betting still withholds actionable picks pending forecast evaluation.

A final focused pass adds unavailable-model recovery coverage and passes all 28
advisor desktop/mobile cases. The selected model remains visible after disappearance
and must be changed explicitly; no fallback generation, credential write or report
setting change occurs. Screenshots outside the repo verify the deep-model selector
and optional output budget at desktop and 320-pixel phone widths.

The matchup pass adds deterministic current-team role comparisons, recorded workload
shares, position totals and team-score context. Sources, samples, missing data and
aggregate-versus-individual limits are covered by 101 core tests. API evidence budgets
retain comparison players and primary estimates while disclosing secondary omissions;
276 API tests cover shared prompt caveats, source closure, large-roster persistence and
old-history compatibility. All 570 workspace tests pass. Public-feed samples of 25
and 40 players retain every player and baseline within the existing prompt/history
limits. These samples are drawn from public stats, not verified owner rosters.

132 full Chromium journeys and 28 final advisor cases verify saved matchup display,
workload/caveat rendering and phone evidence cards at 320 pixels; production build,
typecheck and lint pass. Real model accuracy, calibrated betting forecasts, broader
league/scoring/identity formats, other browsers and real devices remain unverified.
No owner credential, paid model call, roster transaction, real delivery or bet is used.

The media-coverage pass selects recent relevant player/team headlines, preserves
publication versus retrieval dates, deduplicates repeated coverage and forces unknown
tone without directly cited current media. Explicit Sleeper catalog IDs support
matched Yahoo/ESPN and NFL-prop activity. All 581 workspace tests and 134 Chromium
desktop/mobile journeys pass, including saved coverage, stale-feed attribution and
the previously approved Edit/shorten and friendly delivery-label flows. Build,
typecheck, lint, formatting and whitespace checks pass. Screenshots are outside the
repo. This establishes evidence handling and UI behavior with dummy providers;
representative public opinion, live recommendation quality, empirical betting
calibration, other browsers and real devices remain unverified.

The injury pass retains typed identity/season/update metadata and distinguishes
current, undated, stale, missing and conflicting reports. Only a verified recent
report can override recorded status. Practice participation is context, not proof
of playing; uncertain weekly availability limits recommendations. All 587 workspace
tests and 32 advisor desktop/mobile journeys pass, including saved report dates,
practice caveats and repeated history reads without model calls. Build, typecheck,
lint and formatting pass. The public season CSV checked October 7 lacks a report-
update column, so its retrieved rows remain undated context. Current live injury
coverage and injury-based prediction quality still require improvement/evaluation.
The bounded live check parses 1,071 identified rows (19 regular-season week 5), zero
report timestamps, and confirms that a matched undated sample cannot override status.

The rolling betting model adds chronological error/calibration evaluation and a
deterministic maximum-tentative-choice gate. Stored statistical forecasts remain
separate from AI judgments and retrospective hit rates. All 595 workspace tests,
34 advisor desktop/mobile journeys and 12 service/recovery checks pass, along with
build, typecheck, lint and formatting. Production-router fixtures verify numeric
references, optimistic-AI rejection, old/new saved history and post-refresh freshness.

An opt-in real public-data next-game sample evaluates 172 outcomes across 11 weeks.
Probability Brier scores improve against its rolling-frequency baseline in the three
illustrative scenarios, but evaluation/price criteria are not met, so no model pick
is supported. Fixed scenario prices are not actual historical sportsbook prices or
profit evidence. Broader player-prop models, current-condition adjustment, prospective
forecast evaluation and live AI decision quality remain unfinished. No owner key,
paid AI call, real delivery, roster action or wager is used in this pass.
All 138 Chromium journeys pass on the final statistical-forecast/status/Help build,
with 74 dashboard tests rechecked. Desktop and 320-pixel screenshots show the
no-bet guidance immediately beside the experimental estimate. Other browsers,
native devices and real-model judgments remain unverified.

The isolated decision-process harness now has nine fixed fictional cases. Existing
authenticated Claude CLI (`opus` alias/high effort) access is observed without a new
key or owner-settings/history writes. The initial eight-case baseline passes three
cases under its initial criteria; a later two-case retest passes waivers and fails
draft planning's numeric-text contract. The initially accepted betting confidence
of 50 exposed a defect; unsupported results are now capped at 49/Low. After fixed
numeric review feedback and a 120-second pass ceiling, renewed draft planning,
draft review and trade tests all fail provider deadlines (the latter two first
answers are valid). These are observed reliability failures, not passing quality
evidence. Actual saved app settings still use API mode without a saved OpenAI key;
the evaluation does not silently configure the running app.

Lineup analysis now allows eligible roster alternatives and independently validates
the entire selected lineup and its visible estimate tradeoffs. Saved totals belong
to the actual selection; a different highest-estimate lineup remains an explicit
comparison. Contextual departures remain tentative with capped Low confidence until
their tradeoff is quantified. This expands the reasoning choices without inventing
projection adjustments. Full-season versus remaining-season trade intervals,
richer prop/current-condition models, live perception,
six-mode model reliability and prospective betting evaluation remain outstanding.

The preceding lineup-choice verification passes 607 workspace tests (286 API, 120 core, 127
integrations, 74 dashboard), five grader checks covering all nine fixed scenarios,
40 advisor Chromium desktop/mobile journeys and 17 service/recovery/evaluation
checks. Source builds and typecheck pass; screenshots at 1440 and 320 pixels show
the actual chosen lineup, estimate comparison and plain position/duplicate-slot
labels. No new key, owner settings/history writes, real delivery or wager is used.
The live contextual-lineup call fails before an answer. A tiny tool-free CLI probe
also returns a sanitized provider-exit failure; its underlying cause remains unknown.
The nine-case fixture grader passing does not prove live contextual judgment works.
The read-only CLI status still reports authenticated; account details are not emitted.
Being authenticated does not establish generation availability. The full `npm test`
command passes; platform-specific skipped checks are not native-platform verification.

Subsequent source adds an explicit advice-only signed-in Claude/Opus connection to
the actual app. Availability/reload does not generate; the cancellable fixed test
shares no league data. Both analysis passes use the selected subscription provider,
without saved API pricing, key creation, settings mutation or failure fallback.
Shared contracts retain legacy saved results; Help is searchable. Five subprocess
tests use POSIX executables, so Windows native login/execution remains unverified.

The actual installed subscription login is detected by the new integration. Its
fixed live probe fails before an answer after about 2.2 seconds. A bounded follow-up
exit diagnostic also exits with code one without recognizing a usage-limit, option,
authentication, budget or unavailable-model message. The underlying cause remains
unknown. These checks do not establish access to working Opus generation or correct
football decisions, and do not change the owner app's saved report connection or
restart its service.

The preceding connection implementation passes 618 workspace tests (290 API, 121 core, 132 integrations,
75 dashboard), the complete `npm test` command, 152 Chromium desktop/mobile journeys,
production build, typecheck, lint, formatting and whitespace checks. Eight new
connection journeys verify selection/test/two-pass history, unavailable states,
cancellation, failure isolation and Help through production routers with temporary
SQLite and external dummy providers. Screenshots at 1440 and 320 pixels are inspected.
Other browsers/native platforms, live six-mode quality, remaining-season trade
intervals and richer forecasts/perception/prospective betting remain open.

The current interval work distinguishes full-season draft/preseason values, weekly
matchup values and explicit remaining trade values. CSV and stored period validation,
season/current-week/final-week matching and saved display prevent past production or
another interval from becoming future trade value. Legacy imports and saved results
remain readable. An earlier championship end is supported. Forecasts still require
owner imports; interval validation does not independently establish forecast accuracy
or partially played current-week timing. Searchable Help leads directly to Imports.

Native signed-in Claude JSON is checked for both subtype and error flag, with only
validated text/usage extracted. The actual bounded diagnostic reports an error with
a result containing “limit”, despite a success subtype. Which limit/reset time remains
unknown. Fixed errors preserve configuration isolation and no fallback. Seven POSIX
subprocess fixtures do not establish native Windows execution. The installed Codex CLI
is 0.162.0-alpha.2. The new typed adapter passes a fixed live probe using the existing
ChatGPT login. A captured request through that CLI and the actual adapter contains
no model tools, skill catalog or private local instructions. Production generation
uses native subscription authorization; the capture uses a local unauthenticated mock.
The version is pinned and the connection remains experimental. Football decision
quality, native Windows behavior and future-version isolation require separate proof.

Verification: 627 workspace tests (293 API, 124 core, 134 integrations, 76 dashboard)
and the complete `npm test` command pass, with two expected platform skips. The
158-case Chromium run passes 156 cases; the two new Help cases initially fail because
their locator also selects the Home league picker. After scoping to the search dialog,
all six interval desktop/mobile journeys pass, covering those two cases, missing
forecasts, imports, opposite full/future value, week 17, reload and no real delivery.
Inspect 1440-pixel comparison and 320×568 Imports screenshots. Build, typecheck, lint
and formatting pass. Real six-mode model quality, automatic future forecasts, richer
prop/current-condition models, live perception and prospective betting remain open.

Signed-in Codex integration verification (October 7): 16 desktop/mobile connection
journeys, 295 API tests and 140 integration tests pass. The local request capture
proves current-version isolation, and the actual typed adapter's live fixed probe
passes. It is selected explicitly, retains saved configuration, uses high reasoning
for both passes, omits unsupported token budgets and persists only validated final
advice/usage. This is not a packaged release or prospective prediction evaluation.

The initial live controlled sweep passes seven of nine cases: lineup, draft review,
trade, betting abstention, missing estimates, injured starter and contextual lineup.
Draft planning chooses Hold instead of the expected supplied-estimate candidate;
waiver review fails generation/verification after a valid first pass. Both remain
quality/reliability gaps pending targeted diagnosis. Each successful case has two
validated passes and an independently graded raw reviewed answer. This is not
prospective NFL or betting validation.

Follow-up: missing roster/draft context is supplied in both passes. A live draft-plan
rerun chooses the expected candidate with a complete roster-relative numerical
comparison. Offline replay of that unchanged validated reviewed answer passes an
equivalent-support rubric that still checks the original expected choice/verdict and
computed replacement value. Seven evaluator regressions and 295 API tests pass.
A targeted waiver retry passes without reproducing the initial failure; no waiver
fix or current-context full live sweep is established. Keep those gates open.

Final context-change checks: 62 affected Chromium advisor journeys, 295 API tests,
79 dashboard tests and seven evaluator regressions pass, along with typecheck,
lint, formatting and whitespace checks. Desktop/320-pixel connection screenshots
are inspected. Prior full root checks pass 638 workspace tests and 166 journeys.
The owner service/installer was not restarted or released; changes remain local.

Current-context live rerun: eight of the original nine cases pass. Draft planning and
waiver review pass; trade reasoning rejects the harmful exchange but its Lean verdict
fails unchanged direction grading. Both model passes now define rejection as Hold.
The initial seven-of-nine run and unresolved earlier waiver rejection remain recorded.
The expanded twelve-case evaluator adds opposing-current and stale-media coverage and
a favorable trade. Eight evaluator regressions and 295 API tests pass. Targeted native
verification passes five of five: harmful trade Hold, repeated waivers, opposing
current media Mixed with both citations, stale media Unknown, and favorable trade
Lean with the computed 52-point starter gain. These are separately recorded runs,
not a single fully passing twelve-case sweep or prospective NFL/betting validation.
The original intermittent waiver failure remains undiagnosed.

Current checks pass the full root command (638 workspace tests, two expected platform
skips), eight evaluator regressions across all twelve fixtures, 48 affected Chromium
journeys, build/typecheck/lint/format and whitespace checks. Dummy-adapter current
coverage and 320-pixel attribution screenshots are inspected; native processes are
terminal. No owner-service restart, release, actual delivery, transaction or wager ran.

Exploratory public injury-source check: ESPN all-team injuries exceeds the bounded
8 MB probe. Its fixed ARI roster endpoint returns 391,516 bytes, regular-season 2026,
explicit player IDs and injury status/date. No week or independently verified report
update semantics are established. It is not enabled; existing injury guards remain.

Automatic draft/trade verification (October 7): the production public-data adapter
loads 42,806 player rows, 7,548 schedule rows and six available sources with no
credentials or owner state. A public-file compatibility check prepares 411 remaining
forecasts among 474 matched offensive players; chronological adjustment gates retain
the baseline for these samples. This is not prospective season accuracy. A single
prepared snapshot retains about 98 MB after forced GC, not whole-process/multi-cache
performance. Saved forecast methods, decomposition, credited/future points, bounds,
MAE/baseline MAE and grouped test weeks are validated; matching imports take priority.

A real twenty-seven-player evidence-size failure is fixed by sharing repeated prompt
metadata and player caveats. Public-data fifteen/twenty-seven/thirty-player samples
now fit, preserving forecasts while disclosing optional omissions. The forty-player
case exceeds saved limits and remains unsupported. A thirty-player engine-generated
regression also retains twelve required candidate totals for full/remaining scopes.
These are bounded sample checks, not a claim that every thirty-player roster fits.

Initial automatic live evaluation passes two of three. Draft review is structurally
valid but initially misses a rubric citation; a targeted equivalent-support rerun
passes one of one without relaxing choice/value checks. A later replacement-metric
run fails because review treats missing draft-time evidence as invalidating current
outlook. Supplying the complete current roster and clarifying the distinct review
scopes produces a targeted one-of-one pass. Preserve all earlier failures; a fresh
fifteen-case run finishes at fourteen of fifteen: automatic draft planning chooses
the expected candidate but fails the old citation alternatives because it compares
all candidates with actual starters using future baselines. The original failed run
is retained. A strict six-future-value alternative keeps the original replacement
value, choice, verdict and confidence cap, and rejects partial/wrong values. Offline
replay of the unchanged validated reviewed answer passes; a targeted live rerun
passes one of one with the expected Lean/candidate and confidence 50. All native
processes are terminal. This is not a single fifteen-of-fifteen live run.

The preceding forecast/news workspace checks pass 661 tests (301 API, 134 core, 146 integrations,
80 dashboard), with two expected platform skips, eleven evaluator regressions, build,
typecheck and lint. The forecast/prompt build passes all 176 Chromium desktop/mobile
journeys; after the news selection changes, all 64 affected advisor journeys pass.
Screenshots show conditional estimates and supporting numbers at desktop/320 pixels.

The live public-feed relevance probe returns 99 dated stories and selects at most
eight attributed matches. Ordinary display stays ten while Advice sees the broader
pool. Padded entity decoding restores player-name matches. Direct player mentions
below the ordinary cutoff are found without extra API keys or polling. This proves
feed/matching compatibility, not current injury designations or representative public
sentiment. Non-football personal trivia and editorial-selection bias remain relevance
review concerns. No actual bet, delivery, roster transaction, owner-service restart
or release ran. The broader advisor goal remains active.

The advice news view captures items and retrieval metadata together after a refresh;
a forced concurrent-refresh regression prevents newly loaded stories receiving the
older snapshot date. The final integration suite passes 146 checks.

Focused start/sit now compares two to twenty owned players for one shared supported
spot and leaves other starters outside that comparison. Relevant missing active
estimates still withhold a choice. Both passes require one eligible selection and
visible weekly estimates for every available alternative; the service records the
actual estimate given up when context favors a lower estimate. Complete-lineup
validation remains separate. Scoped history rejects invented slots or whole-lineup
assignments, and fixed ownership/eligibility errors stop before inference.

The focused start/sit root command passes 672 workspace tests (306 API, 139 core, 146
integrations, 81 dashboard), twelve evaluator regressions across seventeen controlled
cases, and two expected platform skips. Build/typecheck/lint and all 180 local
Chromium desktop/mobile journeys pass. Browser plugin is absent; repository
Playwright uses the loopback preview and temporary fixture APIs with dummy data.
Desktop and 320-pixel screenshots show the chosen player, compared alternatives
and explicit single-spot scope without horizontal overflow or runtime errors.
No real provider delivery, roster transaction, wager or owner-service change ran.

A targeted live signed-in ChatGPT/GPT-6.1-Sol high-reasoning check passes both focused
cases, with all four model passes valid: the higher-estimate receiver and the
lower-estimate cautious alternative. The fresh seventeen-case sweep passes all
seventeen cases, with all thirty-four model passes valid. Preserve the earlier fourteen-of-fifteen
full-run failure and separate targeted reruns. These checks measure fictional
decision process, not prospective forecast accuracy or betting profit.

Kicker coverage (October 9): the public adapter validates optional kicking counts
and individual made/blocked distances while preserving older offensive schemas.
Supported Sleeper rules include distance/miss/yardage formats with blocks counted as
misses; recognized Yahoo made/PAT names also work. Unsupported scoring, missing
required distances and unknown identities remain withheld. No new keys or extra
provider endpoints were introduced. Weekly baselines and separately evaluated
full/remaining K forecasts preserve imports, chronology and conditional scope.

Bounded fresh public reads provide 569/569/130 K rows for 2024/2025/2026; all 1,268
score under the tested rules. All 32 current matched kickers have remaining
estimates. The 794-case/28-week earlier evaluation retains the baseline for every
one because residual corrections fail reliable improvement. This is compatible
public data and historical testing, not prospective accuracy, weather, current
kicking-job certainty or DST coverage. The targeted native GPT-6.1-Sol kicker case
passes both rounds with the expected choice and eleven/seven baselines. It is a
separate one-case run; there is no fresh eighteen-case live sweep claim.

Final kicker revision: the complete root command passes 681 workspace tests
(306 API, 144 core, 149 integrations, 82 dashboard), thirteen evaluator regressions
covering eighteen cases and two expected platform skips. All 184 Chromium journeys
pass on desktop/mobile, including global Search → kicker FAQ → actual lineup flow,
both automatic baselines, saving/reloading and unchanged delivery/provider settings.
Screenshots were inspected at 1440×1000 and 320×568 using local loopback preview,
temporary SQLite and dummy providers. Build/typecheck/lint/format and whitespace
checks pass. Ordinary code/manual security review covers optional CSV boundaries,
blocked/missing semantics, chronology, per-position evaluation, import priority,
source closure and budget preservation. No automated security scan, real delivery,
roster action, wager, owner-service restart, credential change or release ran.

The full-suite size boundary regression now includes the returned omission count
in saved-evidence sizing, preserving all protected forecasts and decision metrics.
Team defense, rookies/current availability, larger comparisons, live media relevance
and prospective prediction/market evaluation remain open; the advisor goal stays active.

Team-defense support (October 9): supported Sleeper event and points/yardage rules
now use published filtered weekly D/ST data with independent team-total zero
verification, canonical team/game joins and explicit source provenance. Separate
D/ST season cohorts retain the existing chronological test/baseline gates; unknown
recent events/appearances and stale sources withhold automatic estimates. A fresh
keyless public probe joins 1,218 games and scores 1,213 under the tested common
settings; five ambiguous fumble-return TD games remain unknown. The current-week
probe provides 27 weekly and 31 remaining estimates (all baseline), with 855 earlier
held-out outcomes across 28 weeks and roughly 4.706 points/game MAE. This does not
verify prospective accuracy, current personnel, every scoring format or every team.
Yahoo/ESPN automatic DST and additional custom rules remain unverified.

A targeted native GPT-6.1-Sol high-reasoning defense case passes both production
analysis/review stages, selecting BUF from ten-versus-six computed baselines.
This is a separate one-case run, not a new nineteen-case live sweep. The final root
command passes 706 workspace tests, fourteen evaluator regressions across nineteen
cases and two expected platform skips. Build/typecheck/lint pass. Manual review
covers typed source boundaries, positive-vs-zero partitions, limits/cache dates,
team identity, chronology, scoring and persistence; no automated scan, credential
change, real delivery, roster transaction, wager, owner-service restart or release
ran. The goal remains active for unresolved TDs, broader scoring, current availability/
rookies, larger comparisons and prospective model/market checks.

The final D/ST build passes all 188 Chromium desktop/mobile browser journeys.
Inspected 1440×1000/320×568 screenshots show both computed alternatives, the friendly
Team defense label and no horizontal overflow. Search → defense FAQ → lineup,
saved/reloaded advice and complete K/DST starter assignments run through temporary
production routers with SQLite and dummy adapters. Page identity, meaningful
content, absence of framework overlays, console health and interaction checks pass.
Repository Playwright was used because the Browser plugin is absent. Formatting
and whitespace checks pass; native/live evaluations and test handles are terminal.
Other browsers, real devices and prospective prediction remain unverified.

Final roster-identity review fixes a catalog-outage case that could show an owned
D/ST again as an unrostered candidate under a different name. Catalog/owned
DEF/DST aliases now merge by verified NFL team while retaining the owned platform
ID and separate Sleeper identity. Synthetic team IDs are never tagged as GSIS.
Two pool regressions cover the fallback and cross-platform alias paths.

The October 9 offensive-fumble follow-up resolves the five TD gaps reported above.
Public ESPN summaries are checked only for up to twelve recent unresolved games,
using the schedule's separate numeric event ID, final game/scores/date/kickoff and
structured scoring/possession/unit records. An offensive fumble touchdown can carry
a fumble-return label. Only exhaustion of the independently recorded fumble-TD
total can prove missing D/ST zeroes; incomplete, contradictory and unfamiliar plays
stay unknown. Shared permits/deadlines, bounded one-megabyte reads, raw caches,
original retrieval dates and complete weekly/total/summary provenance are retained.
No key or owner connection is added; the undocumented endpoint may become unavailable.

A fresh public-data probe at 15:44 UTC scores all 1,218 joined records under the
tested common Sleeper settings. Week-5 coverage is 28 weekly and 32 remaining
estimates, all remaining values still use rolling-baseline-v1. Retrospective tests
cover 858 earlier held-out outcomes/28 weeks, MAE about 4.704 points/game; these do
not establish prospective accuracy. All metric/projection sources resolve. A
two-team remaining comparison preserves five summary citations and 54 sources with
zero omitted metrics within the existing prompt/saved-byte limits (35.6/46.2 KB).

The full root command passes 716 workspace tests (309 API, 152 core, 172 integration,
83 dashboard) with existing evaluator regressions and two expected platform skips.
Twenty-two targeted Chromium desktop/mobile defense, kicker, start/sit and forecast
journeys verify numerical alternatives, owned team identities, full K/DST lineups,
saved/reloaded advice and Help navigation against dummy production-router fixtures.
Build, typecheck, lint, formatting and whitespace checks pass. Manual trust-boundary,
cache/provenance/arithmetic/budget review ran; no automated security scan, native
model rerun, real delivery, roster action, wager, owner-service change, commit or
release ran. Broader scoring/platform coverage, current personnel/rookie evidence,
deeper comparisons, media relevance, prospective prediction and real devices remain
open; the original advisor goal stays active.

## NFL draft facts and rookie context — October 9, 2026

Implemented a fixed, bounded nflverse draft-picks resource with no extra credential.
Modern/legacy IDs, missing identity cells and historical PFR punctuation are validated;
career totals/honors are excluded. Fresh matching profiles provide draft facts and
historical same-position/round-band rookie context. Eligible earlier-class recorded
appearances use league scoring and equal player weights; scoring summaries require
eight players across two classes. Selection bias, missing histories and current-role
uncertainty remain explicit. Facts/cohorts never fill missing projected points.
Explicit draft/waiver candidates without an estimate remain visible in model/saved
results and cannot become a supported pick. Searchable Help leads to the actual
projection import form; matching scoring-confirmed imports keep priority.

The public snapshot at 16:18–16:20 UTC provides 4,350 supported-position profiles,
81 current-class profiles and 75 unique current Sleeper name/position matches. These
catalog records have no GSIS; conflicting explicit IDs never fall back to names.
Ten eligible first-round WR rookies across two earlier classes support descriptive
scoring context; QB/RB/TE samples are too thin. Every metric source resolves to
available dated metadata. This proves source compatibility, not prospective skill.

The new native missing-forecast case passed both existing signed-in GPT-6.1-Sol
high-reasoning passes: Insufficient, no selected players and confidence zero.
This single run does not refresh the full twenty-case live-model evaluation.
The root command passes 725 workspace tests and fifteen evaluator regressions across
twenty controlled cases, with two expected platform skips. Player-specific pre-NFL
rookie forecasts, current personnel, broader scoring, deeper comparisons, media
relevance and prospective fantasy/betting validation remain open. The goal stays active.

Final rendered verification passes all 194 Chromium desktop/mobile journeys,
including six new rookie workflows for imported estimates, absent estimates,
saved reloads and Search → rookie FAQ → actual projection imports. Screenshots at
1440×1000 and 320×568 show separate readable draft facts and point estimates;
calendar years omit grouping separators. No app console errors/overlays or
horizontal overflow appear in the affected flows. Fixtures use temporary loopback
SQLite and dummy providers; no real sends, roster/wager actions, credential writes
or owner-settings changes occur. Build, typecheck, lint, format and whitespace
checks pass. Browser plugin absent, repository Playwright used; other browsers,
real devices and human usability remain open. Changes are local/uncommitted and
all owned model/test processes are terminal; no owner-service restart or release.

## Public individual forecasts — October 9, 2026

Implemented keyless public ESPN weekly expected-stat rows for supported QB/RB/WR/TE
league scoring, separated from observed NFL history. Strict scope/identity/formula
checks, five fixed bounded pages, partial-cache dates, short retries and duplicate
pagination guards precede use. Imports keep priority. Core composes exact future
weeks with verified unique schedules; full-season estimates add verified credited
production separately. Missing weeks/custom scoring never become invented zeroes.
Public forecasts stay tentative with explicit source/role/accuracy limitations.

At 16:51 UTC, all five live pages validate: 6,190 weekly rows across 428 players.
A temporary PPR probe joins the shared catalog and previously retrieved fresh NFL
history/schedule. Three sampled current rookies have weekly/remaining/full-season
estimates; two without prior NFL appearances lack required weekly forecast coverage
and remain unknown. This source probe does not prove preseason or future accuracy.
Controlled preseason tests cover no-history rookie estimates without borrowing
later-issued projections. Native GPT-6.1-Sol high reasoning validates both passes
for the fictional 12-point rookie versus 15/25-point owned receivers: Hold, confidence
50, no invented historical games, unknown perception. The immediate-upgrade
expectation was corrected after the model exposed the original fixture's mismatch.
The final targeted native case passes; the full twenty-one-case native sweep was
not rerun. Future playing time, broad custom/platform scoring, deeper comparisons,
media relevance and prospective fantasy/betting quality remain unverified.

Final verification passes the root command with 740 workspace tests (312 API, 164
core, 180 integrations, 84 dashboard), sixteen evaluator regressions across twenty-
one controlled cases and two expected platform skips. All 200 final desktop/mobile
Chromium journeys pass, including six public forecast workflows for rookie weekly
numbers, exact remaining trade horizons, both passes, saved reloads/settings isolation
and searchable Help navigation. Inspect 1440×1000 and 320×568 screenshots outside
the repo; expected numbers and source cards are readable without overflow/runtime
errors. Build, types, lint, formatting and whitespace checks pass. Manual boundary
review covers scoring, identities, time/freshness, sparse expectations, caches,
source closure, prompt limits and transaction isolation; no automated security scan
runs. Browser plugin absent, repository Playwright used with temporary SQLite/dummy
providers. All owned processes are terminal; no new credentials, real delivery,
roster/wager action, owner-service restart, commit or release. Other browsers/real
devices/human sessions remain open, as does the original advisor goal.

## Advisor integration completion — October 9, 2026

The [completion audit](reviews/2026-10-09-advisor-completion.md) verifies all
requested local advisor modes, two-pass high-reasoning analysis, source-linked
statistics, confidence, risks/alternatives, public perception where available and
existing-account access without a new key. The native benchmark passes 21/21
cases with 42 valid calls; after a numerical-unit formatting fix, the final
six-mode native recheck passes 6/6 with twelve valid calls. Two actual public-data
analyses validate in all four raw calls: a tentative injury-qualified receiver
comparison and a held hypothetical-price bet whose conservative support gate fails.

Final build/root checks pass with 741 workspace tests, sixteen evaluator
regressions and expected opt-in platform skips. Types, lint, format and whitespace
checks pass. All 204 repository Chromium desktop/mobile journeys pass, plus four
outside-repo checks rendering/reloading the actual native results through temporary
production-router SQLite. Inspect desktop/320-pixel screenshots with clean units,
source evidence and confidence; no overflow or runtime errors. Saved reloads make
no model call. All owned native/test processes are terminal. No new credentials,
owner-settings write, real delivery, roster action, wager, service restart, commit
or release is performed, and no automated security scan runs.

The requested source integration is complete. Broader scoring/personnel/dynasty
formats, representative public-opinion sampling, prospective fantasy/betting
performance, other browsers/physical devices and installer publication still need
their own verification; they are not implied by these local results.

## Public prices and outcome tracking — October 11, 2026

Public ESPN pregame moneylines, spreads and totals are implemented with paired
prices, event/time/team verification and exact quote selection. A real Rams–Bills
feed check returned all six DraftKings side quotes and verified the selected price.
This does not verify all sportsbooks, props, in-play prices, fills or other devices.

Forward prediction capture, persistence, final-result settlement, fantasy errors,
betting Brier/calibration and one-unit paper returns are implemented. Dummy tests
cover settlement and missing evidence; a live final receipt check is recorded in
the review. A real two-season archived-price replay covers all 272 regular-season
games per market in each season. The rolling probability model did not beat the
book baseline in any market/season; sparse returns do not establish profitability.
There is no completed real forward sample yet. Historical timestamp/book coverage,
prospective fantasy/AI accuracy and profit remain unverified. See the
[dated review](reviews/2026-10-11-live-prices-and-performance.md).

## Improved game-market model — October 12, 2026

Paired-price games use the new opponent-adjusted, regularized book-input model.
Frozen older-season parameters reduce aggregate Brier error 7.27% versus the
previous model in the real 2022–2025 archived-price comparison, covering 3,221
matched non-push outcomes. The book baseline remains slightly better overall;
recent totals trail it and a consistent advantage/profitability is unestablished.
The statistical current Rams–Bills check uses actual public DraftKings prices,
produces all three new forecasts and withholds unsupported action. Dummy browser
checks verify saved schemas, source disclosure and separate prospective methods.
This does not verify actual future outcomes, all sportsbooks/props, other devices
or packaged releases. [Evidence](reviews/2026-10-12-model-v2-comparison.md).

## Further context/blend model — October 12, 2026

V3 adds earlier-week rest, season phase, line and team-residual context, with
adaptive moneyline shrinkage. The frozen older-development selection reproduces
on production data. A reused 3,221-outcome 2022–2025 audit improves pooled Brier
slightly versus v2 and the book, but beats the book in only five of twelve
season/market cases; pooled uncertainty includes zero and no simultaneous
comparison establishes superiority. No paper selection qualifies. Consistent
accuracy advantage and future profitability remain unverified.

All 766 workspace tests, 220 Chromium journeys and two actual-report visual
checks pass. Saved v2 remains readable and new v3 ledger identities are separate.
Actual public prices exercise all three current game markets; bounded/full
numeric contexts agree exactly and action is withheld. No future outcomes,
all-book/prop support, other browsers/devices or release certification is implied.
[Evidence](reviews/2026-10-12-model-v3-comparison.md).

## Dated health/weather totals — October 12, 2026

Typed injury, captured quarterback-change and regional forecast context is
implemented for supported v4 totals. Moneyline/spread retain v3 probabilities.
2025/2026 NFLverse injury files lack update timestamps and are excluded; historical
2025 injury coverage is zero. Older undated charts are excluded. The live ESPN
alternative supplied dated labels for a real Rams–Bills event, with IR excluded;
its equivalence to historical NFLverse labels remains unverified. Covered SoFi
weather stays unknown. All live numeric picks were withheld.

The frozen reused 3,221-outcome study improves totals versus v3 in three of four
seasons and worsens 2024. The model beats the book in five of twelve cells, with
pooled uncertainty spanning zero and no qualified paper bets. Injury-only
diagnostic error worsens v3; reliable independent injury/QB/weather benefits,
future outcomes, profitability and consistent market superiority are unestablished.
See [v4 source/method/test evidence](reviews/2026-10-12-model-v4-comparison.md).

All 781 workspace tests/root suites, 222 Chromium journeys and two actual-report
visual checks pass, with final build/types/lint/format/whitespace validation.
These checks do not certify a packaged release or future prediction accuracy.

## Better personnel sources — October 12, 2026

Official NFL article modification dates recover usable injury facts for 130 games
in the 2025 study, with partial coverage and actual article links. Prior weekly
passing performance and snap roles have typed adapters, strict identity/cutoff
checks and unknown unmatched values. These inputs are descriptive; six tested
corrections worsened older development error, and the official-count trial raised
recent error. No production v5 is enabled. Retained v3/v4 errors reproduce exactly;
only five of twelve market/season cells beat the book and uncertainty spans zero.

790 workspace tests plus root suites, 222 Chromium journeys and final focused provider/
model checks pass. A real pregame numerical record captures current source context
and paired prices for later grading; outcomes are pending and all picks were
withheld. Exact publication/fill timing, officially confirmed starters, sustained
book advantage and profitability remain unverified.
[Evidence](reviews/2026-10-12-personnel-data-comparison.md).

## Richer QB/practice research — October 12, 2026

Typed passing/rushing EPA, team-relative QB evidence and position/practice role
features are implemented and tested. Advice exposes descriptive values without
changing production probabilities. The frozen v6 candidate lowers aggregate Brier
on 3,221 matched archive outcomes to 0.23653643 versus the book's 0.23666635, but
beats it in only six of twelve season/market cells; all simultaneous intervals
include zero. On 224 additional 2026 outcomes, only spreads beat the book.
Numerical deployment, consistent advantage and profitability are unverified.

2016–2025 snapshots have both-team EPA in 2,231 of 2,639 contexts and offensive
limited-practice roles in 1,647. No usable dated 2025 practice or 2026 injury
coverage was recovered by these sources. A live 2026 typed-source check returns
180 QB rows (174 usable EPA) and 7,277 snaps. That proves parser/source compatibility,
not complete injury coverage or historical publication timing. Regression tests
verify target/week/future invariance and production probability preservation.
[Evidence](reviews/2026-10-12-model-v6-comparison.md).

## Alternate boosted-tree comparison — October 13, 2026

Research-only time-decayed boosted trees and adaptive book blending are implemented
and tested with deterministic future/target/week exclusion. Eighteen older-data
procedures per market are compared and frozen. On 3,221 matched archive outcomes,
trees score Brier 0.23691737 versus book 0.23666635, winning five of twelve cells.
Trees win all four archived totals cells, but 2026 totals and pooled results lose.
All uncertainty intervals remain compatible with no advantage. No v7 production
method, sportsbook edge or profitability is verified.

The original pre-kickoff v6 Bills–Rams forecast has a separate final-result receipt:
Buffalo 37, Rams 34. Moneyline/spread error slightly improve versus the recorded
book, while total error worsens. That is one independently observed game, excluded
from v7 selection and the prior current-season replay. 799 workspace tests plus
root suites and final checks pass.
[Evidence](reviews/2026-10-13-model-v7-comparison.md).

## Totals hybrid seasonal retest — October 13, 2026

The research hybrid and optional weekly calibration/book blending are implemented
and verified for target/week/future exclusion and exact v3 non-total preservation.
Seventeen older procedures are compared. The selected plain hybrid has archive
Brier 0.23638752 versus paired book 0.23666635, winning seven of twelve cells and
all four totals seasons. Its intervals include zero and current-season totals
regress. Enabled seasonal correction loses older selection and worsens later
results. No live hybrid method, consistent edge or profitability is established.
802 workspace tests plus root suites and final checks pass.
[Evidence](reviews/2026-10-13-model-v8-hybrid-comparison.md).

## Online totals-expert retest — October 13, 2026

Totals-only expert tracking is implemented and verified for recovery, season
reset/carry, prior-week label exclusion, convex/isolated weights and exact v3
moneyline/spread output. Older selection rejects all sixteen mixtures. The best
enabled mixture cuts reused 2026 totals excess error about 85%, but scores Brier
0.25045825 versus book 0.25004633 and production 0.25015286. A fixed-weight
control does slightly better than learning on both samples; adaptive value, a
consistent edge and profitability remain unverified. No live method changes.
805 workspace tests plus root suites and final checks pass.
[Evidence](reviews/2026-10-13-model-v9-expert-comparison.md).

## Game-level totals-signal retest — October 13, 2026

Bounded weekly team-stat ingestion and prior-week opponent-adjusted efficiency/
volume features are implemented and tested. Live public reads yield 5,948 rows;
5,938 join the fixed completed rating-observation pool. All audited totals have
supported prior histories. Raw reparse, historical aliases, malformed/missing/
duplicate inputs and target/future label/stat exclusion are verified. Historical
publication/revision availability and true neutral-script tempo are unverified.

Older selection retains plain hybrid. A separately frozen new-feature mixture
wins all four archive totals seasons, Brier 0.24949643 versus book 0.25011732,
but fails current totals, 0.25076852 versus book 0.25004633 and fixed mixture
0.25039020. Moneyline/spread remain exactly unchanged. No live model switch,
consistent edge or profitability is established. 812 workspace tests plus root
suites and final checks pass.
[Evidence](reviews/2026-10-13-model-v10-matchup-comparison.md).

## External-market totals research — October 13, 2026

Real bounded public reads collected 113 matched Kalshi/Polymarket tapes and
62,463 pre-cutoff trades for a fresh 79-game 2026 replay. Price coverage is 74,
flow coverage 64; only one game has a supported nonzero wallet-weight feature.
Settlement-payout leakage, pagination/time filtering, direction/identity gates,
past-only wallet weighting and exact moneyline/spread output are tested. Combined
totals Brier 0.25013828 and flow 0.25018439 beat book 0.25026877 in point estimates;
whole-sample intervals include zero. This is a different fresh base from the old
77-game enriched context, not a reproduced old audit or a validated profit claim.

Fourteen upcoming forecasts have verified live paired book prices and sealed
numeric records; all results remain pending. Separate current headline capture
is implemented, but historical sentiment accuracy and representative social
coverage are unverified. No live model switch or background collector. 819
workspace tests plus root suites and final checks pass.
[Evidence](reviews/2026-10-13-model-v11-external-markets.md).

### Historical prediction-market expansion (research only)

Live public checks recover sixteen 2024 Polymarket totals contracts and 380
2025 provider/game tapes (156 Kalshi, 224 Polymarket), combined with the unchanged
113 v11 2026 tapes. Seven-day windows, archived endpoints, historical dollar
fields, legacy minute prices and verified title/rule orientation are implemented.
Checked 2023 sources yield no usable contracts; 2024 wallet activity is sparse.

The frozen expanded totals candidate beats the reused 2026 sportsbook point
estimate (0.24989373 versus 0.25026877), but loses the combined late-2025/2026
audit (0.25064412 versus 0.25032936). Intervals include no improvement. Moneyline
and spreads are exact matches to production; production dispatch and earlier
forecast seals are unchanged. No consistent edge, executable historical returns,
general historical sentiment or proven whale skill is verified.
[Evidence](reviews/2026-10-13-model-v12-historical-totals.md).

### Seasonal external totals feedback (research only)

Verified weighted weekly fits, seasonal reset/weak-prior alternatives and earlier
prequential forecast feedback on the same frozen v12 sources. Selected adapter
reduces late-2025 excess Brier loss by 44.6% (0.25073543 versus old 0.25103671),
but still loses book 0.25036106 and the combined audit. The 2026 point estimate
is 0.25025792 versus book 0.25026877, with modifications confined to one week.
Intervals include no improvement. Moneyline/spreads remain numerically exact;
live dispatch and earlier forecast seals are preserved. No consistent edge or
independent prospective success is verified.
[Evidence](reviews/2026-10-13-model-v13-seasonal-external-totals.md).

### Fixed coverage/liquidity ablation (research only)

Verified forced removal of coverage/unsigned-volume predictors in both fit and
inference, plus a stricter fixed price-only control. Adaptation/source settings
remain fixed. Primary ablation reduces late-2025 excess loss by 85.0%, scoring
0.25041735 versus book 0.25036106; combined audit still loses (0.25036635 versus
0.25032936). Price-only differences are practically negligible and it returns
book exactly on 2026. No sportsbook edge or new prospective success is verified.
Moneyline/spread outputs, production and earlier issued records remain unchanged.
[Evidence](reviews/2026-10-13-model-v14-directional-totals.md).

### Canonical signed-flow repair and robust pressure (research only)

Verified official Kalshi direction semantics against all 117,536 captured raw
executions: legacy parsing mapped every one to Under, and 70,673 Over directions
are repaired in separately retained inputs. This invalidates earlier attribution
to correctly oriented Kalshi flow; old forecasts remain exactly as issued. No
production dispatch uses the research adapter.

Verified centered minute/actor pressure, split-fill invariance, distinct-minute
gates, large-bucket classification and a price-confirmed control. Direction-only
repair still loses late 2025. Robust primary scores 0.25036107 versus book
0.25036106 there, with tiny combined and 2026 point wins and intervals including
zero. Most forecast corrections are practically negligible; no consistent edge
or independent prospective success is verified. Moneyline/spreads remain exact.
[Evidence](reviews/2026-10-13-model-v15-robust-trade-flow.md).

### Football drive residual totals (research only)

Verified bounded live nflverse PBP acquisition for 2019–2026, paired derivation of
3,822 team-game rows, 39 unavailable historical games and exact offline replay from
retained selected source fields. Verified opponent-adjusted prior-week football
features, continuous totals residual fitting, prior-season carryover, earlier-origin
feedback and separately fitted corrected-flow ablation. Historical publication
vintages and sportsbook observation times remain unavailable.

Frozen development-selected football-only primary scores 0.24869777 versus book
0.25026877 on 79 reused 2026 games, and 0.25016943 versus 0.25032936 on combined
audit. It still loses late 2025 and all 890 matched totals. Added flow worsens both
later phases; nominal primary intervals include zero. No consistent edge or
independent prospective success is verified, and no production model is promoted.
All four candidates preserve 893 moneyline and 870 spread outputs exactly.
[Evidence](reviews/2026-10-13-model-v16-drive-totals.md).

### Independent recent totals feedback (research only)

Verified exact v16 raw forecast reproduction and new feedback with bounded current-
season history, distinct-week/effective-game guards, season reset or limited fading
seed, and half/full correction caps. Frozen development selects a two-week half-
life, cap 0.5 and reset. Source features, fitting and no-flow choice are unchanged.

On reused samples, late-2025 Brier improves to 0.25024812 versus book 0.25036106;
combined audit is 0.24985803 versus 0.25032936, and all 890 totals are 0.25007216
versus 0.25010217. 2026 retains a smaller gain than v16; full 2023 and 2024 still
lose. Conservative intervals include zero and no independent prospective or
consistent edge is established. All eight variants preserve 893 moneyline and
870 spread outputs exactly; production and issued forecasts are unchanged.
[Evidence](reviews/2026-10-13-model-v17-recent-feedback.md).

### Weekly stability totals feedback (rejected research candidate)

Verified exact v17 reproduction, weekly cluster/leave-week-out reliability with
pooled/directional heads, three-week evidence gates and immutable policy/cache.
Selected on 537 earlier 2021–2022 totals; inherited source settings were previously
selected later, so the complete pipeline remains retrospective.

Primary reduces 2023 and 2024 excess loss by 14.7% and 91.3% but still loses both.
All 890 Brier regresses to 0.25024754 versus book 0.25010217 and v17 0.25007216;
late 2025 also loses. Stricter controls copy book exactly throughout 2024, and
no candidate is promoted. All six preserve 890 raw totals, 893 moneyline and
870 spread probabilities exactly. No independent prospective edge is verified.
[Evidence](reviews/2026-10-13-model-v18-stable-feedback.md).

## Report library preview — October 14, 2026

Five default report templates, revision-checked weekly draft setup, one-time draft automation
prefill and numeric league/saved-report charts pass controlled source/browser/macOS ARM packaged
checks. White/black and 320–390px layouts, missing scores and frozen snapshot persistence are
covered; all six advice workflows remain covered by the browser suite. These checks do not
establish fresh live AI recommendation quality, interactive installation or Windows/Linux native
support. See [exact current preview receipts](reviews/2026-10-14-report-library.md).

## Real report QA — October 14, 2026

Five default report types pass real-model review against a sanitized public 2018 league and
separate 2026 Week 6 public-projection scenarios. One-time/recurring cron ticks produce dashboard
drafts, with duplicate prevention, eligible-lineup gating and no outbound delivery. 104 source/
content checks and eight actual reports render in the corrected macOS ARM preview without
dialogs/errors, including source links, two-decimal scores/year labels, missing graphs and
mobile/black mode. No owner live league, future forecast outcome, interactive install or
Windows/Linux native verification is claimed. [Current exact receipts](reviews/2026-10-14-real-report-quality.md).
