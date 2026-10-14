# Live prices and prediction performance — October 11, 2026

Reviewer: Codex, manual source and rendered review. Source worktree with earlier
uncommitted changes retained; no release commit or publication. Times below are
UTC on October 12, corresponding to late October 11 in New York.

## User-visible behavior

Advice can explicitly fetch and select public pregame moneyline, spread and total
prices, retain the exact analyzed snapshot, and reject altered/expired selections.
Prices moved during inference lower confidence and cannot enter actionable paper
tracking. Switching teams clears the fetched handicap/odds. Manual entry and
player props remain available. No new key or wager integration is introduced.

New pre-kickoff analyses populate an independent bounded prediction ledger. The
user can refresh the record, check finished games, inspect scoring/probability
errors, calibration and hypothetical unit returns, export it or explicitly clear
it. Final NFL identities and complete fresh scoring are required; missing player
appearances remain unknown. Searchable Help describes both workflows.

## Actual public-source evidence

At 03:17:12 UTC, the production ESPN adapter returned six DraftKings quotes for
Rams–Bills, game `2026_05_BUF_LA`, ESPN `401872994`, kickoff October 13 at 00:15 UTC:

| Market    | First side        | Opposite side      |
| --------- | ----------------- | ------------------ |
| Moneyline | Rams -180         | Bills +150         |
| Spread    | Rams -3.5 at -105 | Bills +3.5 at -115 |
| Total     | Over 54.5 at -115 | Under 54.5 at -105 |

It verified the chosen exact quote. These are public ESPN-displayed snapshots,
not guaranteed fills or comprehensive sportsbook coverage. The final adapter
recheck at 03:26:54 UTC again returned all six quotes, after the competition UID
validation and concurrent-identity guard were added.

At 03:23:42 UTC, the actual final-result adapter verified Philadelphia at
Jacksonville (`2026_05_PHI_JAX`, ESPN `401872981`), matching the frozen teams and
kickoff; ESPN marked it completed with Jacksonville 19, Philadelphia 17. This
proves source/result compatibility; it does not retrospectively invent an earlier
prediction or paper selection.

## Fixed archived-price evaluation

Run `node scripts/evaluate-market-prices.mjs` after building shared packages, or
`npm run betting:market-evaluate`. Public schedules were retrieved at
03:17:04 UTC from the nflverse schedules release. The unchanged rolling method
and conservative selection thresholds were fixed before this evaluation. Each
historical forecast fits only earlier weeks, using paired archived moneyline,
spread or total prices and correct selected-team handicaps. Both sides are fitted
independently, selecting at most one per game/market without using its outcome.
There were 272 priced games and 272 forecasts per market in each tested season.

| Season | Market    | Model Brier | Book baseline Brier | Paper choices | W/L/P | Net units | ROI           |
| ------ | --------- | ----------- | ------------------- | ------------- | ----- | --------- | ------------- |
| 2024   | Moneyline | 0.23481     | 0.20016             | 1             | 0/1/0 | -1.00000  | -100.00%      |
| 2024   | Spread    | 0.27462     | 0.25107             | 3             | 2/1/0 | +0.80195  | +26.73%       |
| 2024   | Total     | 0.25977     | 0.24978             | 1             | 0/1/0 | -1.00000  | -100.00%      |
| 2025   | Moneyline | 0.22965     | 0.21214             | 13            | 5/8/0 | +2.85000  | +21.92%       |
| 2025   | Spread    | 0.26993     | 0.24959             | 4             | 3/1/0 | +1.87325  | +46.83%       |
| 2025   | Total     | 0.26615     | 0.25041             | 0             | 0/0/0 | 0.00000   | No selections |

Brier is conditional win-probability error, with pushes excluded; lower is better.
The rolling model was **worse than the book probability baseline in all six
market/season comparisons**. No accuracy advantage was demonstrated. None of the
paper cohorts covered eight settled selection weeks, so no weekly-cluster return
interval is reported. Small positive sample returns are not profit validation.
The app exposes the worse-baseline finding rather than claiming a predictive edge.

The archive does not verify quote-publication times, sportsbook identity or
executable fills. Past outcomes existed during model development, so the later
season is not an untouched holdout. Paper results exclude fees, taxes and slippage;
AI judgments and current individual public projections are not reconstructed.
A real forward sample still requires future pre-kickoff records and outcomes.

The first CLI replay took 24.8 seconds. The production worker reproduced identical
season results in 29.7 seconds while its parent delivered 1,136 timer ticks, with
a maximum 56 ms gap. An already-aborted worker rejected and terminated. Worker
inputs exclude app state/player records/environment secrets; bounded timeouts and
client cancellation prevent late writes.

## Verification

- Root `npm test`: 756 workspace tests (313 API, 174 core, 185 integrations,
  84 dashboard), all script suites/evaluator checks pass, two expected platform
  skips. Journal persistence/backup validation and salvage are included.
- Final changed-path recheck: 45 passing route/feed/backtest tests after the final
  verdict, competition UID and concurrent-identity corrections.
- Final ledger-capacity adjustment reserves settlement metadata space. Its
  route/store/prediction recheck passes 82 tests after the production build is
  terminal; the initial overlapping-build import failure was rerun successfully.
- Types, lint, formatting, production build and whitespace checks pass.
- Full Chromium suite: 214 passing desktop/mobile journeys. Final mobile field
  labels, quote changes and the new searchable Help paths pass twelve final
  targeted journeys.
- Two additional actual archived-data worker-to-API-to-render journeys pass at
  1440×1000 and 320×568, with settings/vault/delivery/inference unchanged. Desktop
  market words avoid mid-word wrapping, and every mobile numerical field has its
  own visible label. Two final visual checks pass when replaying the same computed report after
  this presentation correction, without rerunning or changing the model.
  Final temporary origins were `http://127.0.0.1:63086` (desktop) and
  `http://127.0.0.1:63099` (mobile); both fixtures are closed afterward.
  Browser plugin not available; repository Playwright used. Page identity,
  meaningful content, absent framework overlay, console health, scrolling/overflow,
  screenshots and interactive state changes are verified.

Temporary production-router SQLite and fictional feeds/models cover fetch/select,
paired prices, provenance removal after edits, exact snapshot reload, expired
price rejection before inference, a price moved during inference, opposite-team
handicap sign, final settlement and fixed-worker replay without inference. They
assert no settings/vault/delivery changes. Historical tests cover target/future
outcome exclusion, actual prices, refunds/payouts and ambiguous/missing coverage.

## Manual code and security review

- [x] Trace changed request/provider data through bounded schema parsing, source
      identity/time checks, exact quote matching, prompts, local storage and React text.
- [x] Review fixed-host redirect-denied fetches, response/time/cache/registry bounds,
      original observed times, unavailable-feed behavior and concurrency identity.
- [x] Review ledger capture time, frozen scoring/horizon, earliest-record dedup,
      final-source freshness, missing outcomes, reserved settlement metadata space, exact American payouts and weekly
      correlation assumptions. Validate migration/restore/salvage and storage caps.
- [x] Review CPU-worker lifecycle, cancellation, deadlines and constant module
      bootstrap: no shell, untrusted code evaluation or inherited environment.
- [x] Review affected local route protections: existing loopback/host/origin/JSON
      controls apply, no arbitrary URL/config/threshold input or external write adapter.
- [x] Confirm no dependency/key changes, credentials in exports/logs, owner data
      writes, real wagers/messages, owner-service restart, commit or release.
- [x] Review loading/error/empty/manual-fallback and narrow-screen controls. Fix stale
      record refresh, opposite-team handicap retention and unlabeled mobile result cells; preserve explicit selection.
- [x] Update architecture, decisions, durable memory, current tasks/support/status.
      No automated security scan runs, as required by the owner.

This is a scoped source review, not a packaged release/platform certification.
Other browsers/physical devices, additional sportsbook markets, timestamp/fill
provenance and statistically substantial prospective coverage remain unverified.
