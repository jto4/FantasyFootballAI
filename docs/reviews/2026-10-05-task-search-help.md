# Tasks, sharing, sample mode, and Help & FAQ review

Reviewer: Codex. Date: October 5, 2026 (America/New_York). Source branch:
`codex/reliable-operations`, local uncommitted follow-up to the beginner experience.
Earlier operations/search changes already present in this workspace were preserved.
This is local source validation, not a release candidate, hosted deployment, or
signed-package review.

## Changed behavior

- Fictional sample league, report cards, editable prewritten draft, and copy/download
  without accounts, provider generation, real jobs, service mutations, or delivery.
- Saved-report clipboard/download/native-share integration with an explicit manual
  fallback, saved-text-only output, edit guards, and unchanged provider send status.
- Local task interpretation that preserves negation and named report/channel scope,
  proposes review-first weekly schedules, previews delivery policy changes, and
  routes failed-send questions to the appropriate FAQ and report attempts.
- Inline Schedule editing with section revisions, recipient previews, stale delivery
  checks, explicit automatic-send confirmation, sticky save feedback, and a shared
  timezone planner. Execution, retry, shutdown, and deduplication remain in the
  existing scheduler; display estimates are not promises.
- Versioned safe setup progress, a Home status summary, and searchable/bookmarkable
  Help & FAQ with provider-specific access and actual setting/page destinations.
- On-demand help/preview modules and focused regression coverage, including one
  confirmation before discarding edits for a task. Human-study and managed-service
  designs are documented; neither actual sessions nor a hosted service are claimed.

## Manual code review

- [x] Read the follow-up's changed components, shared planner/types, search routing,
      content catalog, persistence, tests, and docs. No new dependencies, lockfile,
      backend mutation endpoints, process management, or native privileges were added.
- [x] Checked typed task destinations, validated help IDs, actual setting anchors,
      scoped saves, pinned revisions, and failure/recovery messaging. Reviewed the
      missing-recipient and newer-delivery-revision checks before enabling sending.
- [x] Traced sample state separately from real service state; confirmed report cards
      and examples are labeled fictional and that the transition starts real setup.
- [x] Reviewed DST gaps/fall-back, timezone conversion, elapsed weekly/monthly runs,
      and due/missed/completed one-time display states. The running-service, awake
      computer, season, and fresh-data limitations remain visible.
- [x] Reviewed empty/loading/error/recovery/edit/review states and actual desktop/phone
      flows. Inspected screenshots for content, wrapping, modal scroll, layering,
      card selection, and visible saves. Fixed the real chooser overflow on phones;
      did not force-click hidden controls.
- [x] Removed duplicate schedule summaries and improved new editor control sizing.
      Preserved exact-setting search priority after adding help answers. Retained
      ordinary guards without asking twice for the same unsaved task navigation.
- [x] Updated task, architecture, decisions, memory, usage/search, support, and release
      records. Broader refactoring and native/live-provider checks remain separate.

## Manual security review

- [x] Traced query text through local bounded parsing and typed proposal destinations;
      it never becomes code, a remote AI request, a saved secret, or an immediate send.
      Queries/FAQ results do not expose credentials or index saved report bodies.
- [x] Checked help rendering is escaped React text; links use fixed known IDs and
      reviewed URLs. Sample mode has no mutation or generation pathway. Saved report
      text is passed only to user-invoked copy/download/share, not to automatic delivery.
- [x] Checked setup storage is schema/version bounded and contains only safe choices
      and validated numeric/provider league IDs. Arbitrary URL parameters, session
      values, keys, and incomplete raw input are excluded; the OS vault boundary stays.
- [x] Checked downloads use a bounded sanitized filename and a plain-text Blob, with
      object URL cleanup. No archive, filesystem permission, symlink, subprocess,
      shell, custom-endpoint, CSP, listener, or Electron privilege changes were added.
- [x] Checked automation changes require explicit owner confirmation, valid recipients,
      and section revisions; enabling checks delivery revisions too. An in-flight send
      may still finish. Separate schedules/chat-policy writes can partially succeed;
      failures explicitly instruct reopening rather than silently retrying or rolling
      back another window's changes. They are not a global transaction: another trusted
      local window can change delivery after a freshness check.
- [x] Existing revision/channel/destination guards, immutable uncertain-delivery
      envelopes, and duplicate-send confirmations remain covered by regressions.
- [x] Prepared a separate managed-service threat model/authentication/billing/privacy
      design without exposing a remote listener or creating paid infrastructure.
- [x] No automated security scan was run, per the owner's explicit repository instruction.
      No new release artifact was produced or inspected; this follow-up is not a release.

## Validation and evidence

The full ordinary suite passed 576 checks total: 574 passed and two opt-in native
checks skipped. Dashboard has 70 passing tests and core has 54; the full API,
integrations, runtime/service/maintenance/release checks also passed. The final
full desktop/mobile Chromium run passed all 64 journeys. A focused follow-up
rechecked all setting targets, FAQ routing, and sample sharing after adding the
Yahoo access anchor and capture evidence. Final typecheck, lint, production build,
formatting, and whitespace checks passed.

Browser plugin was unavailable; repository Playwright was used. Tests ran at the
isolated preview on `127.0.0.1:4201` and temporary production-router loopback fixtures,
1440×1000 desktop and 390×844 mobile. Normal new journeys assert no relevant console
or runtime errors and no horizontal overflow. Simulated provider failures, denied
clipboard access, revision conflicts, and renderer errors are checked separately.
The renderer-failure fixture was scoped to the target Reports route so background
Home status updates cannot trip it before the intended click.

Commands: `npm test`, `npm run test:e2e`, the focused Playwright follow-up,
`npm run typecheck`, `npm run lint`, `npm run format:check`, and `git diff --check`.
Screenshot evidence is outside the repository at
`/Users/jimmyto/.codex/visualizations/2026/10/05/everyday-workflows/`.
Native share behavior was exercised through a controlled browser interface; actual
OS share targets/delivery are not verified by that test.

Remaining work: willing participants and actual human-study observations; managed
service operator/account, auth, budget, commercial/privacy terms, implementation,
and staging/production review; native installers/OS share targets, screen readers,
other browsers, and live provider accounts. No owner app/service process was
restarted and no GitHub commit, push, merge, subscription, or deployment was performed.
