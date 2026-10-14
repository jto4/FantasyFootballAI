# Dialog and report-refresh QA — October 7, 2026

## Confirmed failures and fixes

Four targeted scenarios failed on both desktop and mobile before the patch:

- Command/Ctrl-K opened search over a sample editor with unsaved work and moved its
  keyboard focus. The shortcut now stays suspended until the other dialog closes.
- Unbroken report titles and league names exceeded the review width at 320×568.
  Review content now wraps; Copy and Close remain reachable with ordinary scrolling.
- A deliberately delayed background refresh for report A replaced report B after
  the user switched reviews. Background fetches now abort when selection or editing
  changes; manual retry/post-send results also belong to their original session.
- Scrolling at the bottom of a long review moved the report list behind it by 600
  pixels. Shared dialogs now lock background scrolling, account for scrollbar width,
  and restore prior inline body styles after the last close. Guided setup uses the
  same Dialog component rather than a separate keyboard/scroll implementation.

## Ordinary code and manual security review

- [x] Checked initial loading, retries, background polling, edits, report selection,
      post-send refresh, request cancellation, and stale-result handling.
- [x] Checked focus restoration, disabled controls, Escape, Tab, busy setup guards,
      portal layering, body-style restoration, and overlapping dialog lifetimes.
- [x] Kept escaped React content, saved-text/destination/revision guards, and explicit
      send confirmation. No remote listener, credential, integration, persistence,
      or Electron privilege changes were made in this pass.
- [x] No automated security scan was run, per the owner's repository instructions.
      This pass does not constitute a release or native-provider verification.

## Validation

Browser plugin was unavailable, so repository Playwright was used against the local
preview on `127.0.0.1:4201` and temporary production-router loopback fixtures. Node
22.23.3 on macOS ARM; Chromium viewports 1440×1000 and 390×844, plus 320×568 stress
checks. SQLite and provider/credential/delivery adapters were temporary dummy data;
no real messages were sent.

- `npm run build`: passed.
- `npx playwright test e2e/dialog-reliability.pw.ts`: eight regressions passed after
  all eight failed against the preceding build.
- `npx playwright test`: 86 journeys passed on the final build, including the new
  tests' page-error and console-error assertions, Command and Ctrl shortcuts,
  report identity/content checks, scrolling restoration, and normal setup/search/
  edit/share/send journeys.
- `npm run test --workspace @sidekick/dashboard`: 73 tests passed.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, and
  `git diff --check`: passed.

Inspected before/after mobile wrapping, desktop unsaved editor focus, mobile report B
identity after delayed A completion, and the bottom of a long report. PNG evidence is
saved outside the repository in
`/Users/jimmyto/.codex/visualizations/2026/10/07/dialog-reliability/`.

Other browsers, real touch devices, native packaging, screen readers, live providers,
and human usability sessions remain outside this test pass. The existing dashboard
bundle-size build warning remains; no performance claim is made here.

## UI suggestions awaiting implementation

1. Keep the review title and Close button visible while scrolling. At the bottom of
   a long phone review, Close currently requires scrolling back to the top or Escape.
2. Put generated/data/news metadata under Details so the report text appears sooner
   on a phone. Keep missing/stale-data notices visible when they affect the review.
3. Show the full report once when the saved body and send preview are identical;
   retain a separate exact send preview when channel limits or formatting alter it.

These suggestions have not been implemented. Source changes remain local and
uncommitted; no GitHub, deployment, owner-service, or release-artifact action was taken.

## Subsequent approved UI work

The owner approved all three suggestions after this QA pass. They are now
implemented; current behavior and validation are recorded in [Everyday use](../usability.md)
and [Tasks](../tasks.md). The suggestions above describe the state at the original
review, not outstanding work.
