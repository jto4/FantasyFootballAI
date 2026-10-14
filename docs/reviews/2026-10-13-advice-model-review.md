# Models and advice review — October 13, 2026

Reviewed by Codex against the existing working tree. The review covers production
calculations and all six advice workflows, plus the retained totals experiments.
Implementation fixes allocation, identity, add/drop comparisons, error reporting
and betting qualification. It does not establish improved NFL outcome accuracy,
calibrated confidence, betting profit or a consistent sportsbook advantage.

## Research and decisions

- [Google's assignment/min-cost-flow documentation](https://developers.google.com/optimization/flow/assignment_min_cost_flow)
  explains joint assignment through constrained flow and residual reassignment.
  This fits overlapping FLEX/Superflex demand better than sequential greedy
  allocation. Implemented a small dependency-free solver; no optimizer package was
  added. This is an allocation algorithm, not a learned player projection.
- [Scikit-learn's probability calibration guidance](https://scikit-learn.org/stable/modules/calibration)
  distinguishes Brier performance from calibration alone and requires separate
  data for calibration. A frequency comparison is not historical sportsbook
  validation. The betting action gate now requires the latter for every market.
- [TimeSeriesSplit](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html)
  documents why future data cannot train forecasts of earlier observations.
  Existing chronological fitting remains in place. Selected fantasy-baseline
  errors now remain separate from a rejected adjustment model's errors.
- [Sleeper's roster-move restrictions](https://support.sleeper.com/en/articles/4037431-why-can-t-i-drop-players)
  show why numerical feasibility cannot establish permission to execute a drop.
  The new drop comparison computes scoring consequences while keeping platform
  locks, priority, FAAB and IR rules explicitly separate.

The v18 totals audit still loses 2023, 2024 and the combined comparison, despite
partial weak-season improvements. Earlier v17 aggregate point gains also fail
individual seasons. No candidate was promoted. The 51 source hashes sealed by
`2026-10-13-v18-frozen-settings.json` remain unchanged; moneyline, spread and total
probability calculations and recorded forecasts were not rewritten. Prediction
market flow and media activity still lack a demonstrated incremental prospective
edge. Further tuning on the same audit would not supply independent validation.

## Workflow findings and implementation

| Area                      | Finding and resulting behavior                                                                                                                                                                                                                                                                                                                                              |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Draft planning            | Greedy overlapping FLEX slots could produce different replacement values when reordered. Jointly optimize every league starting slot, normalize DEF/DST, require known positional supply, and retain missing replacement as unknown.                                                                                                                                        |
| Draft review              | Uses the same corrected allocation for current outlook. Current full-season outcomes still cannot establish draft-time skill, and ADP timing is separate from success.                                                                                                                                                                                                      |
| Full lineup and start/sit | Existing global legal assignment and one-spot checks are retained. A supplied conflicting GSIS identity now withholds both scoring and workload history instead of attaching another player's unique name match. Independent scoring-matched platform imports remain usable.                                                                                                |
| Trades                    | Exact remaining-period ownership and starting-slot calculations are retained; the identity correction and correctly labelled selected-model errors apply here too. Future bye coverage, bench depth, dynasty assets and roster-limit transactions remain unquantified.                                                                                                      |
| Waivers                   | Add-only screening cannot establish a complete transaction. Add an optional owned-player drop, recompute every starting slot, and expose before/drop/after/gain metrics. A non-positive move is Hold; incomplete legal lineups remain insufficient. Inactive candidates cannot become starters, and inactive bench estimates need not prevent a complete active comparison. |
| Game bets and props       | Legacy props had an unspecified baseline identity that could pass the action gate. Label their frequency comparator explicitly and require matched sportsbook validation for actionable qualification. Descriptive prop estimates remain available with Hold; probabilities and existing methods are preserved.                                                             |
| Fantasy forecast model    | Baseline fallbacks previously reported the rejected adjustment model's MAE as their own. Report selected-method MAE and separately retain candidate MAE through prompt budgeting and saved numerical evidence. Coefficients and point predictions are unchanged.                                                                                                            |
| Analysis/review model     | Both passes must visibly cite complete add/drop comparisons. Fixed feedback permits review repair; missing final comparison or endorsement of a non-improving move fails before saving. Capability-based model ranking still is not a measured football-quality ranking.                                                                                                    |

For an overlapping two-team FLEX pool, the old ordering could set RB replacement
at 90 points instead of 1 from the same supplied forecasts. The new allocation is
order-independent and agrees with an exhaustive legal-assignment oracle across
forty deterministic small-pool formations. A 32-team, ten-slot pool exercises the
supported upper-scale path; work is bounded by 2,000 players and 384 assignments.
These are synthetic correctness comparisons, not NFL prediction backtests.

Two new fixed decision cases independently specify arithmetic: the existing
QB/WR/RB roster estimates total 57; dropping its 25-point receiver for the
20-point runner leaves 55, a loss of 2. Dropping the 5-point bench runner instead
retains the receiver and produces 65, a gain of 8. Before, drop, after and gain
survive both service passes, contract validation and saved requests. A repair case
verifies fixed feedback; an unsupported reviewed explanation is rejected.

## Verification

Supported Node 22.23.3 on macOS ARM. Final `npm test` passes: 873 workspace tests (314 API, 84 dashboard, 252 core
and 223 integrations), plus root/service/integration suites. Two opt-in platform
checks are skipped as expected. Nineteen controlled evaluator regressions include all 23
fixed decision cases through the real service and two controlled model passes.
These substitutes do not measure real-model reasoning quality.

Build, typecheck, lint, formatting and diff whitespace checks pass. Vite retains
its existing large-main-chunk advisory. All 118 existing advice Chromium desktop/mobile
journeys exercise all modes, game markets, public forecasts, rookie/kicker/defense
support, trade intervals, model connections and saved-result reopening.

With the Browser plugin unavailable, additional headed Playwright CLI checks use
an isolated API fixture at `http://127.0.0.1:62083`, desktop 1440 × 1000 and mobile
390 × 844. Controlled imports set the comparison QB to 18 and WR to 30. In this
separate fixture the old starting total is 50: dropping the 20-point QB produces
48/Hold; replacing the 16-point WR produces 64/+14/Lean. UI selection, saved drop,
visible numbers, result reload and narrow overflow checks pass. No console errors,
blank page or framework overlays appear. Visually inspected screenshots are in
`/tmp/sidekick-advice-waiver-*.png`, outside the repository. No owner data,
configuration, credential writes, delivery or wager was involved.

A fresh native benchmark was attempted for all six modes and both new drop cases.
It stopped at connection preflight, before any model generation: installed
`codex-cli 0.162.0-alpha.17.2` differs from the adapter's verified
`0.162.0-alpha.2`. The version/isolation gate remains intact. Earlier actual-model
results are historical evidence, not verification of the new behavior. Reverify
that native protocol/isolation before enabling it and rerunning fresh model tests.

## Ordinary manual review and limits

Read the scoped production changes, request and saved-result compatibility,
source closures, numerical comparison validation, ownership checks, inactive
filters, deterministic assignment, input limits and computational bounds. Review
retains the fixed safe validation feedback and prevents raw provider errors from
entering the second pass. The new HTTP field accepts only a bounded ID in waiver
requests, checks the selected roster before inference, and is rechecked by core.
It cannot authorize a transaction or rewrite configuration. Labels and descriptions
render as React text; no HTML or new remote provider is introduced. Existing
loopback/CSP, keychain, model-output validation and immutable forecast boundaries
remain in place. No automated security scan was run.

No release or installer was produced. Real-provider transaction rules, richer
formats, prospective availability/role forecasts and fresh model reasoning quality
remain unverified. Independent forward testing is required before changing live
probability models or claiming a sportsbook edge.

The subsequent [Codex compatibility review](2026-10-13-codex-compatibility.md)
records verification/fixes for the newer CLI and the fresh model-quality retest.
The preflight failure above remains the result of this original review attempt.
