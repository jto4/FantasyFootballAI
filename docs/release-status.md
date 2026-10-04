# Release status

This is the source of truth for current readiness. Last reviewed: 2026-10-04.
The project remains a contributor preview; this change does not establish a signed,
public, device-verified desktop release.

## Current source

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

| Gate                         | Required evidence                                                                                          | Current limit                                                                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Current cross-platform build | Run updated source/package CI, including browser journeys and the minimum runtime                          | October three-OS source and unsigned package matrix passed; separate Intel Mac distribution remains unverified for this source |
| Signed distribution          | Credentialed Developer ID/notarization and Windows Authenticode jobs, verified downloadable assets         | Signing logic exists; credentialed release verification remains open                                                           |
| Native lifecycle             | Install, launch, Settings data move, tray/quit, sign-in, upgrade, and packaged MCP on owner devices        | Intel Mac and Windows/Linux interactive checks remain open; September macOS evidence is historical                             |
| Native updates               | Upgrade from a prior signed version using published architecture-matched assets                            | No verified signed published-release update cycle                                                                              |
| Live fantasy providers       | Owner-authorized Yahoo/ESPN/Sleeper scenarios, representative scoring and lineup/season semantics          | Fixtures and previous limited checks do not establish live account coverage                                                    |
| Live AI and delivery         | Actual selected API/CLI, Resend, Twilio Conversations/direct SMS, BlueBubbles/webhook, and image providers | Browser mocks and adapter tests cannot establish live delivery or model behavior                                               |
| Performance                  | Repeat current-source performance smoke; slower hardware and live inference/sync                           | Synthetic local benchmark only; broader hardware/provider measurements remain                                                  |
| Release review               | Complete code/security checklists for the exact published commit and inspect support claims                | Focused local manual review recorded; publication review remains separate                                                      |

Do not turn these gates into completed tasks without recorded evidence. Automated security
scans remain excluded by the owner. See [release process](release-process.md) for the
maintainer workflow and [tasks](tasks.md) for active work.
