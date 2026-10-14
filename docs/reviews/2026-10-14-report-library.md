# Report library, automatic drafts and numeric charts — October 14, 2026

Reviewed by Codex against the prior quiet-verification payload, from the working tree based on
`890ffcb8599dc5598dd7cfc7d9082bbb64ed2938`. This is an unsigned macOS ARM contributor preview,
not a public release or a live-provider/model-quality evaluation.

## Behavior

- Reports now has a compact five-template library: power rankings, matchup preview, draft hype,
  draft review and offseason update. Weekly reports stay visible; seasonal reports expand.
- A weekly-plan dialog previews Tuesday 09:00 rankings and Wednesday 09:00 matchup previews,
  retaining each action’s timezone. It explicitly describes replacement of those two schedules’
  league scope and delivery policy, then saves dashboard drafts for the selected league with a
  schedules-section revision check. Other settings and report schedules are preserved.
- Individual automation uses the existing schedule editor, with one-time draft event setup and
  monthly offseason suggestions. Existing cron timing, duplicate occurrence handling, season
  pauses, retries and review-before-send behavior remain in place.
- League charts has accessible SVG season points/wins and current-week score comparisons, an
  expandable underlying table, source timestamps, missing-score states and independent six-team /
  three-matchup expansion. White default and black mode remain supported down to 320px.
- Saved reports retain bounded numeric evidence captured before inference. Report edits, league
  updates and restart do not rewrite it. Older reports retain their text without synthetic charts.
  Team comparisons require complete metric coverage. Scores are labeled platform snapshots that
  may be live or final, not forecasts. Only the selected week is retained before bounding rows.
  Copy/download and provider delivery still share saved report text, not the charts.

## Verification

- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, `npm run build`: passed.
  **1,024 source checks passed; two platform-only checks skipped** (913 workspace + 111 root).
- **130 desktop/mobile browser cases passed**: 64 library/everyday/compact/setup/API/operations/quiet
  profile cases and 66 advice/report-boundary/review/schedule cases. All six advice workflows remain
  covered. Controlled fixtures only; no live messages or paid inference.
- Scheduler/service integration triggers a weekly action twice in the same occurrence and confirms
  one draft, no credential/delivery calls, persistence across restart, and invalid chart import rejection.
- Older operations tests were updated to open existing collapsed Home/storage groups; they had
  been attempting to click hidden controls. No app flow was weakened to accommodate them.
- Packaged report QA: library, preview/save of scoped weekly plan, current league charts, fixed
  historical chart values, desktop/mobile black mode, zero renderer errors and zero dialogs.
- Quiet native verifier: isolated credentials, mock Chromium Keychain, nonpersistent session,
  launch/restart/unsaved Stop, credential reset, persisted theme/team preferences and diagnostics passed.
- Native saved-advice replay: ten earlier public-NFL/synthetic-roster results across all six
  workflows pass exact API replay, expandable evidence, saved-history navigation and mobile checks
  in this package, with zero dialogs/errors. No new model generation or quality claim.
- Package API/dashboard and MCP smoke checks passed. `hdiutil verify` and `unzip -t` passed.
  ZIP ASAR matches the delivered payload. 185 compiled application files match source; 2,694
  packaged files contain no `.sidekick`, state database/JSON, `.env` or `auth.json`.
- Compared with the prior quiet package, only report service/store validation and shared index/
  workflow validation changed outside the dashboard, plus the new report snapshot helper.
  Numerical advice/model algorithms and integrations are unchanged.

Local evidence: `/tmp/sidekick-report-native-qa`, `/tmp/sidekick-report-final-source.log`,
`/tmp/sidekick-report-browser.log`, `/tmp/sidekick-reports-advice-regression.log` and
`/tmp/sidekick-report-package.log`. Browser traces/screenshots remain in the system temporary
Playwright output directory. Previous package preserved at `/tmp/sidekick-before-report-library-out`.

## Manual code and security review

Completed the scoped `SECURITY.md` checklists for this increment; earlier implementation reviews
remain the record for the unchanged prior payload. No automated security scan was run.

- [x] Read changed application files and reviewed the complete compiled delta against the prior
      inspected payload. No dependency/lockfile change, new integration or runtime privilege.
- [x] Public snapshot types, helper, HTTP report validation, backup validation and rendering agree;
      collections/numeric values are bounded. Snapshot capture keeps no roster, player IDs, owners or
      member notes. React renders names as text; charts never parse AI prose or inject HTML.
- [x] Reviewed schedule timezone/scope/revision semantics, explicit replacement preview, draft-only
      delivery, duplicate occurrences, error recovery, service/awake requirements and shutdown.
- [x] Existing localhost host/origin/CSP and credential boundaries are preserved. The plan uses the
      existing protected schedules PATCH route and does not write credentials or recipient settings.
- [x] Existing provider prompt/recipient/review/duplicate-send guards are retained. Saving the plan
      does not generate or send immediately. AI context sharing/usage remains disclosed.
- [x] No application subprocess or filesystem behavior changes; disposable QA roots are cleaned,
      normal profiles and OS vault safeguards are untouched. No owner data/service/app installation changed.
- [x] Empty, missing data, loading, failures, conflicting edits, legacy reports, larger leagues,
      source timestamps and narrow/black layouts tested. Supporting content stays expandable.
- [x] Artifacts inspected for source agreement/private-data exclusion; archive checks pass.
      Developer ID signing/notarization, interactive install, Windows/Linux and published upgrades
      remain maintainer release gates. Bundle-size warning remains an existing performance follow-up;
      SVG charts add no chart-library dependency.
- [x] Task, architecture, memory, usability and release/support documentation updated.

## Exact rebuilt artifacts

| Artifact                                                                        | SHA-256                                                            |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `apps/desktop/out/make/Sunday Sidekick-0.1.0-arm64.dmg`                         | `dadd94631bb8e3f426e7705d95d360c1ead493d76d87227902f902432e51e064` |
| `apps/desktop/out/make/zip/darwin/arm64/Sunday Sidekick-darwin-arm64-0.1.0.zip` | `f8b525d2bd00bca092fe34d4d0624cd6e850a805d776f422ba8918de98de4847` |
| Delivered `app.asar`                                                            | `e6b7190de20c4164b615d37a6183046f5d1812cbe354ba67764d3b1f4423a127` |

These rebuilds replace the previous preview at the same output filenames. Prior exact-artifact
receipts remain valid for their archived payload, not this new installer.

## Later real-data QA rebuild

The real-report quality rebuild supersedes this installer at the same output filenames. This
review’s hashes remain valid for `/tmp/sidekick-before-real-report-fixes-out`. See
[the current report quality review](2026-10-14-real-report-quality.md) for fixes and exact final hashes.
