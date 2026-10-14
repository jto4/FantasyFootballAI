# Shorter Home, Advice and Settings — October 14, 2026

Reviewer: Codex. Base commit `890ffcb8599dc5598dd7cfc7d9082bbb64ed2938`
plus the accumulated working tree. This review concerns the current presentation
changes, not a new numerical model or a public signed release.

Superseded at the same artifact filenames by the [quiet-verification
preview](2026-10-14-quiet-verification.md). The exact compact preview described
here is retained under `/tmp/sidekick-before-quiet-verification-out`.

## Observed flow and fixes

The review began with fresh rendered captures of the existing Home, Advice form,
saved lineup and Settings. The fixture uses the production loopback API/router,
temporary SQLite, controlled external providers and a previously generated saved
result with public NFL evidence and an explicitly synthetic roster. It does not
use the owner's league, credentials or app database.

1. **Home: competing priorities.** The weekly football actions, repeated Advice
   entry, report setup, activity, connection status, standings and news all
   occupied the same page. Home now leads with the weekly decisions, removes the
   repeated entry, and makes other sections expandable. Drafts, delivery issues
   and in-progress reports still make activity open automatically.
2. **Advice: form buried under explanations.** Large task cards, a separate
   betting research card, saved history and results trackers made the workflow
   hard to scan. Six compact task buttons now precede the form. New decision,
   Saved advice and Track results are separate views. The connection/model
   choices remain explicit when available; privacy and advanced limits expand.
3. **Results: decision buried in calculations.** Repeated selected-player names,
   full risk/alternative narratives, all supporting tables and player evidence
   extended the page substantially. The default result now shows its headline,
   conditional change or absent quantification, confidence, availability flags,
   starting lineup and first reason. All remaining statements and numerical
   evidence stay accessible in named disclosures. The lineup uses two columns
   on desktop and one on phones.
4. **Settings: unrelated and specialist content.** Appearance previously appeared
   above every settings section. It now lives under Storage & desktop; the header
   theme switch remains. Backup, diagnostic, calendar, schedule and Yahoo
   connection sections expand on demand. Exact-setting search still opens the
   relevant ancestors and focuses the control.

The default disclosure targets retain at least 44 CSS pixels of height. No text
clamping discards model statements, and no model answer is rewritten to shorten
it. Availability flags, unknown current injury coverage, low confidence, and
conditional estimates remain visible. Draft inputs remain mounted across Advice
view changes. Accepted history navigation returns to the decision; opening the
current result also returns to the decision and focuses its headline.

Fresh before/after and narrow-screen screenshots were inspected under
`/tmp/sidekick-ux-audit/`. The initial captures and final captures have differing
viewport sizes, so no scroll-height percentage improvement is claimed. The
desktop review uses 1440 × 1000 and the phone review uses 390 × 844; regression
tests also exercise 320 × 568. Browser console checks found no renderer errors.

## Verification and limits

The existing tests were updated to open Numbers & comparisons, Track results,
Report schedules and optional league detail through the visible UI before
checking their original content. Arithmetic, source, provider, persistence,
unsaved-change, cancellation and delivery assertions remain intact. Result
headline focus is checked before opening evidence, so disclosure scrolling does
not mask a focus regression.

Added regression cases cover draft preservation across all three views, all six
task labels, visible lineup/confidence and unknown quantification, closed and
expanded tables, expanded risks, five-result history with Show more, validated
saved-result replay without new AI calls, pending drafts, and diagnostic access.

Initial failures included old tests targeting now-hidden controls, a new fixture
with invalid numeric headlines, and a current-result history navigation issue.
The test fixtures now validate through `isAdviceResult`, and the actual
navigation issue is fixed. Original failure logs and successful retries remain
locally under `/tmp/sidekick-ux-*`.

This is an engineering and visual review of three primary flows. It is not a
participant study, a measured task-time improvement, or evidence of improved
football prediction accuracy. Reports, Schedule, imports and league-member
screens retain their existing workflows. Longer evidence remains available when
explicitly expanded. No fresh paid AI analyses, messages or bets are required
for this UI change.

## Manual code and security review

- Reviewed the changed React/CSS and browser/native verification paths, empty,
  loading, failed-provider, unsaved, cancellation and same-result states.
- Avoided mutating the shared task-choice array while reordering task buttons.
  Tracking components mount only in their requested view; the decision form
  stays mounted to retain draft inputs. No new dependencies or background jobs.
- Existing trust-boundary validators and React text rendering remain in use.
  No API/provider, credential, process, listener, CSP or delivery changes.
- Search opens collapsed settings; their independent Save/revision controls and
  review-before-send safeguards remain available. Disclosure visibility does not
  change permissions or enable an action.
- Package verification uses the existing private verification root, disposable
  credential namespace, SQLite and preferences; owner state is untouched.
- Automated security scans were not run, as required by the owner. Signing,
  notarization, published upgrade and other-OS interactive gates remain open.

## Final checks and installer

- Full `npm test`: 1,018 passing checks, two platform skips (907 workspace tests
  plus 111 root checks). Dashboard tests were also rerun after the UI changes.
- Final desktop/mobile browser run: **160 passed**, including all six Advice
  workflows, signed-in connection choices, calculations, save/reload, unknown
  evidence, cancellation, guarded setup/delivery, and exact-setting search.
- Typecheck, lint, formatting and production build pass. Vite retains its
  existing large-main-chunk advisory; this change is not a bundle-performance
  claim.
- `desktop:make` passes its API/dashboard, MCP and headless shutdown smokes.
- Native rendering of **ten prior results spanning six workflows** passes exact
  API replay, default/expanded evidence, history navigation and narrow layouts.
  The private native test reads saved public-NFL/synthetic-roster results; it does
  not generate new model analyses. Ambiguous duplicate history headlines return
  through Your decision in this native harness; the unique current-result
  navigation is separately checked in browser regressions.
- Output-app and mounted-DMG native checks pass isolated credentials/preferences,
  code fingerprint, backups/diagnostics, team persistence, white default, black
  dark mode/restart and explicit Stop with flushed shutdown logs. The native
  verifier was updated to open Automatic backups as well as the other new groups.
- `hdiutil verify` and `unzip -t` pass. All 184 inspected compiled application
  files match source; **all 168 compiled API/core/integration files are unchanged
  from the prior installer**. The manually inspected payload contains 2,688 files
  and no `.sidekick`, state database, `.env` or native `auth.json` capture.

Rebuilt macOS ARM preview artifacts, still version 0.1.0:

| Artifact                                                                        | SHA-256                                                            |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `apps/desktop/out/make/Sunday Sidekick-0.1.0-arm64.dmg`                         | `775a15439b20a60ac6137f4d8e3d1f509585c72f8228507394f14d0a53e60fb4` |
| `apps/desktop/out/make/zip/darwin/arm64/Sunday Sidekick-darwin-arm64-0.1.0.zip` | `3d7c064a3d871cc5d6b8705cf9855bfaa8f2ea4a5db21d2496defdba65d8e416` |
| Application ASAR (identical in output app, DMG and ZIP)                         | `25ffd8743a1f1473472a2e8604dfb563f736d0f03ec52e88c1f86fb56717a2bf` |

The prior artifact is preserved under `/tmp/sidekick-before-compact-workflows-out`.
The executable has an ad-hoc linker signature, no Developer ID, bound resources,
Team ID or notarization. This remains an unsigned contributor preview; the owner
app was not replaced. The owned DMG mount and temporary audit service were closed.

Local receipts and inspected screenshots are retained under
`.sidekick/research/2026-10-14-compact-workflows/` and the adjacent JSON record.
Earlier failed native attempts used the old history/backup navigation; successful
reruns and the underlying failures remain in `/tmp/sidekick-ux-*` logs.

**Health:** the revised primary flows pass engineering and visual checks. A fresh
owner usability session is the next evidence needed to judge discoverability and
effort in everyday use. No participant-success or prediction-superiority claim
is made.
