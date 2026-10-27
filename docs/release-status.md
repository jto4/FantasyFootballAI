# Release status

This is the source of truth for current readiness. Last reviewed: 2026-10-27 (status of the
October 22–26 source). The last installer-verified review is 2026-10-14. The project remains a
contributor preview; it is not a signed, public, device-verified desktop release.

## Current source

**Verdict (2026-10-27): not ready for public release.** Usable by the owner as an unsigned local
build. The gates below are open.

Source added October 22–26, summarized in [tasks](tasks.md) and [decisions](decisions.md):

- Ask Sidekick chat; props board, prop model and prop line ledger; live box-score scoring; the
  app's own weekly projections (ESPN projections removed); locked starters; desktop right-click
  menu.
- Win probability and likely ranges; forecast-wind and vacated-carries adjustments; game-day
  inactive alerts.
- UI states (no false all-clear, one error style, in-app confirmations, long-wait timers) with a
  screenshot-tested state gallery.
- Personalization (display, Home layout, watchlist, notifications, lineup strategy, projection
  switches and nudges, prop thresholds and sportsbooks, AI tone and per-task model).
- Efficiency: download cache with conditional requests, shared weekly results, memoized
  projections.
- Dynasty and keeper support (format detection, backtested multi-season values, rookie and pick
  values, trades, rookie plan, taxi and keeper help).
- Questionable-player discount and refit range widths (fitted on 2025, tested on 2026).
- Home and Live agree once games start; one AI connection status; accuracy card minimums.
- Player card, start/sit compare, all-leagues page, redraft trade calculator, FAAB bid guide,
  since-last-visit changes, Live win-chance line, desktop notification history; Props on their own
  page; older report drafts grouped.

Evidence for this source, as of commit `1f18125` plus the Windows test fix:

- Local macOS ARM: lint, format, typecheck, all workspace unit tests, 254 desktop/mobile browser
  cases and 50 UI-state screenshots pass; `npm run desktop:make` builds and passes its packaged
  API/MCP/headless smoke checks. The rebuilt app was checked by hand against one imported ESPN
  league (Afton, week 7).
- Hosted CI failed on Windows from October 24 to 26 because one test asserted Unix file
  permission bits, which Windows does not have; the assertion is now skipped there like the
  repository's other permission checks. Linux, macOS, minimum-Node and all three package smokes
  passed throughout. A report-library browser test assumed the power-rankings schedule card came
  first, which holds only on Mondays; it now checks that both weekly drafts are scheduled.
- Not covered: no installer-level review was recorded for this source; Sleeper, Yahoo, taxi,
  keeper and FAAB behavior were tested only with fixtures; the Live win-chance history, waiver
  bids and notification history have not been seen with live data; the owner's AI connection check
  was failing at review time.

The current macOS ARM preview includes the real-data report fixes: eligibility-safe matchup sums,
season-aware news/catalog/projection context, renamed-league/sync evidence retention, actual draft
status, two-decimal scores/year labels, commissioner overrides and compact missing-chart states.
It passes 104 independent checks across eight final real-model reports, 1,032 source checks,
132 distinct browser cases and packaged real-report/quiet runtime verification. See
[the current exact-artifact review](reviews/2026-10-14-real-report-quality.md) for data scope,
rejected earlier responses and hashes. Current rosters are constructed scenarios; these tests do
not establish future forecast accuracy or owner-platform delivery.

The previous macOS ARM preview introduced the five-template report library, previewable scoped weekly
draft plan, accessible league graphs and immutable saved-report chart evidence. It passes 1,024
source checks, 130 browser cases and packaged report/quiet runtime verification. See the
[report-library review](reviews/2026-10-14-report-library.md) for exact archive hashes and
limitations. Previous exact-artifact reviews describe their archived packages; the output filenames
now contain this rebuild. No live AI/provider delivery or new prediction accuracy is claimed.

Automated desktop verification now uses test-only memory credentials, a
nonpersistent browser session and macOS mock Keychain. Stop and unsaved close
warnings are omitted only in disposable profiles; normal OS storage, navigation
and delivery guards remain. The current rebuilt preview passes quiet native
launch/restart/shutdown even with its vault binding unavailable in a test copy.
See the [quiet-verification review](reviews/2026-10-14-quiet-verification.md) for
current artifact hashes and scope; real-vault testing remains opt-in.

The current macOS ARM preview also includes shorter Home/Advice/Settings flows,
separate decision/history/tracking views and expandable result evidence. Its
160 desktop/mobile browser cases and all six native saved-advice views pass;
the rebuilt DMG passes native launch, isolated credentials, appearance and restart
checks. API/core/integration runtime files match the prior installer exactly.
See the [current artifact review](reviews/2026-10-14-compact-workflows.md) for
hashes and scope. An owner usability session remains pending.

The preceding local macOS ARM DMG/ZIP included the real-data advice fixes and the
API-child verification isolation and advice restart-order corrections. Eleven
successful packaged analyses cover all six workflows with 100 independent
arithmetic checks. The final artifact passes all six saved-result views, a fresh
analysis, ordered native restart, independent credential probing, white/black
appearance and launch directly from its mounted DMG. See the
[installer review](reviews/2026-10-13-latest-installer.md) for exact checksums,
the history-only rebuild lineage and retained initial test failures. This remains
an unsigned contributor build; prospective accuracy, signed publication and the
platform/provider gates below remain separate.

The weekly-decision slice adds Home priorities, readable advice summaries, no-AI
readiness, versioned prospective comparisons, a fantasy outcome journal, native
team persistence and isolated packaged verification. See the [dated review](reviews/2026-10-13-weekly-decision-workflows.md)
for current checks; this remains an unsigned contributor preview with the
published-upgrade and cross-platform gates below.

The local operations slice adds MCP job polling/cancellation, archived deduplication receipts,
indexed report history, URL recovery, diagnostics, and optional encrypted routine backups.
The dashboard also includes plain-language workspace search with exact setting destinations
and local lookup of older report titles; see [workspace search](search.md).
See [the operations review](reviews/2026-10-05-local-operations.md) for current checks and
the macOS native-toolchain blocker. October 4 hosted checks apply to the previous integrated
source; current-slice Windows/Intel packaging and native execution are still pending.

- Manual report generation saves drafts, including actions configured for automatic delivery.
- Reports provides league/status filters, generation evidence, revision-checked draft editing,
  explicit destination/message review, and delivery history. Attempted reports are immutable.
- Settings provides six focused sections with independent saves and unsaved-edit warnings.
  AI tests and discovery cannot save pending Voice, Privacy, Delivery, or Schedule changes.
- The League desk highlights review queues, upcoming work, stale data, and delivery problems.
- Guided setup connects a league ID or supported URL, tests the saved runtime, then opens
  the first generated draft for review.
- Report, delivery, settings, and chat orchestration use injected services/routers.
- Generation jobs persist request IDs and progress, survive browser reconnects, and recover unfinished work as interrupted without provider replay.
- Delivery retries use frozen envelopes; Settings section revisions prevent stale writes.
- Dashboards poll summary state and load paginated Reports with saved bodies fetched for review.
- Core, persistence, and Settings modules are focused; the dashboard uses canonical CSS tokens.
- Source development is pinned to Node 22.23.3; Node 22.13 is the separately tested minimum.
  Native SQLite load failures are distinguished from database failures.

Current validation and manual review are recorded in
[the workflow review](reviews/2026-10-02-commissioner-workflows.md) and
[the reliability review](reviews/2026-10-02-workflow-reliability.md), with fresh local and
hosted results in [the integration review](reviews/2026-10-04-main-integration.md).
Desktop/mobile Chromium includes fast synthetic API journeys and journeys through production
workflow/league/provider routers with real temporary SQLite and controlled external providers.
API/store/process integration checks also exercise local persistence without live providers. Prior native package and
hosted OS checks remain dated evidence in the [support matrix](support-matrix.md). The October
source and unsigned package matrix passed on Linux, macOS ARM, and Windows; September
artifacts do not contain this October source change. Hosted package smokes do not establish
interactive owner-device or live-provider coverage.

## Gates before publication

| Gate                         | Required evidence                                                                                          | Current limit                                                                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Current cross-platform build | Run updated source/package CI, including browser journeys and the minimum runtime                          | Hosted CI covers October 26 source once the Windows test fix lands; Intel Mac packaging and interactive Windows/Linux runs pending |
| Signed distribution          | Credentialed Developer ID/notarization and Windows Authenticode jobs, verified downloadable assets         | Signing logic exists; credentialed release verification remains open                                                               |
| Native lifecycle             | Install, launch, Settings data move, tray/quit, sign-in, upgrade, and packaged MCP on owner devices        | Intel Mac and Windows/Linux interactive checks remain open; September macOS evidence is historical                                 |
| Native updates               | Upgrade from a prior signed version using published architecture-matched assets                            | No verified signed published-release update cycle                                                                                  |
| Live fantasy providers       | Owner-authorized Yahoo/ESPN/Sleeper scenarios, representative scoring and lineup/season semantics          | One imported ESPN league checked by hand; Sleeper/Yahoo, dynasty/keeper/taxi and FAAB leagues fixture-only                         |
| Live AI and delivery         | Actual selected API/CLI, Resend, Twilio Conversations/direct SMS, BlueBubbles/webhook, and image providers | Browser mocks and adapter tests only; the owner's Codex connection check was failing on 2026-10-27                                 |
| Performance                  | Repeat current-source performance smoke; slower hardware and live inference/sync                           | Synthetic local benchmark only; broader hardware/provider measurements remain                                                      |
| Release review               | Complete code/security checklists for the exact published commit and inspect support claims                | Three code reviews on October 24–25; no installer-level or publication review of the October 26 source                             |
| Owner usability              | Recorded sessions with willing commissioners on the current build                                          | No sessions held                                                                                                                   |

Do not turn these gates into completed tasks without recorded evidence. Automated security
scans remain excluded by the owner. See [release process](release-process.md) for the
maintainer workflow and [tasks](tasks.md) for active work.

## Beginner experience follow-up

The current local source presents four main navigation choices, guided league/AI setup,
report choice/review/explicit send confirmation, voice/schedule presets, expandable
technical controls, ordinary delivery connection fields, and persistent settings feedback.
Desktop/mobile browser verification uses controlled providers and temporary production
routers/SQLite. [Everyday use](usability.md) documents costs, private-provider requirements,
connection checks, and review defaults. Live accounts, representative nontechnical-user
sessions, native assistive technology, packaging, and publication gates remain open.

## Tasks and searchable Help & FAQ follow-up

The local source now offers fictional sample mode, reviewed-text copy/download/share,
report cards, task-aware search previews, inline schedule editing/planned runs, safe
setup resumption, Home status, and searchable/bookmarkable Help & FAQ. Ordinary
validation and 64 desktop/mobile Chromium regression journeys are recorded in the
[October 5 review](reviews/2026-10-05-task-search-help.md). These changes remain local
and uncommitted, with no owner app restart, GitHub publication, or release.

The [commissioner study](research/usability-test-plan.md) needs willing participants;
no human sessions have been completed. The [managed AI connection](managed-ai-design.md)
needs service/operator/account, authentication, budget and policy choices, followed
by implementation and staging review. No managed connection or subscription is
available. Existing live-provider, native-package, signing and accessibility release
gates remain in force.

The October 11 source adds verified public pregame prices and a separate
prospective prediction/paper ledger. The actual archived-market evaluation did
not demonstrate a probability-accuracy advantage over sportsbook odds. Sparse
positive historical returns are not profit validation. No installer publication,
owner service restart or release is performed by this change; prospective samples
and broader platform/provider checks remain required for expanded claims. See
[review evidence](reviews/2026-10-11-live-prices-and-performance.md).

The October 12 game-model source adds opponent/venue-adjusted ratings and disclosed
sportsbook-input corrections, improving the old model while the book still has
slightly lower aggregate error. The dated [comparison](reviews/2026-10-betting-model-history.md)
records mixed market differences and unproven prospective profit. No owner service
restart, installer publication or release occurs; broader platform/source checks
and substantial prospective outcomes remain required for expanded claims.
