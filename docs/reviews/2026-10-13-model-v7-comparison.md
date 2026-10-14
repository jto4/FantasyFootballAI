# Loss diagnosis and boosted-tree comparison — October 13, 2026

## Result and deployment decision

A different model fixes the older totals failures in point estimates, but does not
provide a consistent sportsbook advantage. The frozen boosted-tree procedure
beats the book on all four 2022–2025 totals seasons, yet loses all four moneyline
seasons and three spread seasons. Its 2026 totals also lose. Numerical v7 remains
research-only; production retains v3/v4 and the prior v6 trial remains experimental.
No live method, stored probability, qualification gate or owner configuration changes.

| 3,221 matched 2022–2025 non-push outcomes | Brier (lower is better) |   Log loss |
| ----------------------------------------- | ----------------------: | ---------: |
| Frozen boosted trees                      |              0.23691737 | 0.66512437 |
| Earlier v6 experiment                     |              0.23653643 | 0.66422845 |
| Retained production                       |              0.23658686 | 0.66435334 |
| Paired no-vig sportsbook                  |              0.23666635 | 0.66450478 |

Trees win five of twelve season/market cells and lose seven. No simultaneous
interval establishes superiority; every individual totals interval also includes
zero. The pooled book-minus-tree 95% weekly-cluster interval is
[-0.00104386, +0.00054181]. These later seasons were read for diagnosis and have
been tested repeatedly. This is a reused audit, not an independent holdout.
Lower forecast error does not establish executable betting profit.

The unchanged prior current-season snapshot has 224 non-push outcomes. Trees
score 0.24204370, v6 0.24101725, production 0.24102046, and book 0.24112677.
Moneyline and spread barely beat the book in point estimates; totals error is
0.25280588 versus the book's 0.25004633. All intervals include zero. This sample
stops at the previous October 12 snapshot, before the newly scored Bills–Rams game.

## Why the previous model loses

We decomposed the paired Brier excess algebraically. If `d = model - book`, then:

```text
model loss - book loss = mean(d²) - 2 mean[d × (outcome - book)]
```

The first term is the cost of moving away from the book; the second measures
whether those moves align with outcomes. This attributes numerical error without
claiming a causal explanation for NFL performance or treating post-hoc subgroups
as new training targets.

- **2024 totals: persistent Under bias after an observed rate shift.** Over won
  44.4% of archived non-push cases in 2022, 45.9% in 2023, then 53.9% in 2024.
  The model still averaged 48.2% Over versus the book's 50.1%. Its correction
  variance cost was 0.00049404 and alignment gain was negative (-0.00136100),
  yielding 0.00185503 excess error. About 73.4% comes from the older v3 correction,
  11.4% from the added health/weather correction and 15.2% from personnel.
  The rate change and a four-season unweighted correction fit are consistent with
  slow adaptation; this is an inference, not proof of the underlying football cause.
  All three season phases lose. Lines 42–48 lose most (145 cases, excess 0.00339132),
  while 48+ lines win (52 cases). The latter cannot justify a retrospectively chosen
  betting threshold.
- **2023 moneyline: the new personnel correction is the main numerical culprit.**
  It adds 0.00015050 error out of 0.00015438 total excess; retained production was
  almost level with the book. Early and middle phases lose, and late games improve.
  QB EPA and snap roles are not established independent signals after market prices
  already enter the model. The diagnosis does not prove either redundancy or an
  intrinsic QB valuation error.
- **2023 spread: the older correction moves the wrong way in midseason.** Weeks
  7–12 average 49.1% home-cover probability, versus the book's 50.2% and 53.0%
  realized covers. That 83-case phase contributes excess error 0.00248199.
  The v3 layer accounts for about 96% of the full-season excess; richer injuries
  are not the main cause.
- **2025 spread/total: missing rich injuries cannot rescue inherited errors.** The
  v6 injury-only corrections are inactive in these markets because the richer dated
  practice/role features are missing. The forecast inherits v3/v4. On totals, some
  moves align positively with outcomes, but their squared correction cost
  (0.00035042) exceeds their alignment gain (0.00019879). This is excessive
  correction strength relative to the weak observed benefit. The 2025 low-total
  subgroup loses, but its post-hoc threshold is not a deployment rule.

The raw score-only probability has still higher error in these examples. Simply
removing the book input or adding more personnel coefficients is not supported by
this evidence. Coverage subgroups are descriptive, sometimes extremely small, and
confound seasons, venues, publication timing and market conditions. No subgroup
cutoffs were used to fit or select the new model.

## Different modeling approach

The new module uses shallow boosted Newton decision trees to correct the **book
logit directly**, replacing the stack of v3/v4/personnel linear corrections.
Tree splits can learn different responses by line, price and prior team context,
and depth-two trees can express interactions. This is an implementation of the
stagewise tree principle described in
[Friedman's original gradient-boosting paper](https://www.cse.iitb.ac.in/~soumen/readings/papers/Friedman1999GreedyFuncApprox.pdf),
not an implementation of all of that paper's methods.

Fixed parameters: 20 rounds, learning rate 0.05, leaf ridge 20, at least 60 rows
per leaf, at least 200 training rows, and at most 0.5 added logit. Thresholds are
training-only covariate quantiles. Every origin uses strictly earlier NFL weeks
from up to four seasons, with exponential time decay. The grid compares depth
one/two, 120/730-day half-lives, market-only/all validated context features, and
direct/adaptive-book rules: sixteen tree procedures plus the book and retained
production, eighteen per market. Missing context has explicit coverage flags;
unknown measurements are not imputed as participation or health.

The adaptive rule learns a bounded Brier blend toward the book from earlier
out-of-week tree predictions only, using two previous seasons, the same time
decay and a unit ridge. Exact book fallbacks are reported as ties, not wins.
Neither tree training nor weighting optimizes wager returns.

All later rows are removed before development preparation. Selection on
2018–2021 froze at **04:45:24 UTC (12:45 a.m. New York, October 13)**:

| Market    | Frozen structure                         | Older tree Brier | Older production Brier |
| --------- | ---------------------------------------- | ---------------: | ---------------------: |
| Moneyline | depth 1, 120 days, all inputs, direct    |       0.21005128 |             0.21082684 |
| Spread    | depth 2, 730 days, market inputs, direct |       0.24829933 |             0.24907034 |
| Total     | depth 2, 730 days, market inputs, direct |       0.24875265 |             0.24967576 |

The selector chose direct trees, not the adaptive option. Audit results cannot be
used to replace those choices with better-looking later candidates. An initial
run was stopped after two older moneyline candidates to avoid computing unused
prediction origins; the prediction formula/grid was unchanged. The final run
scores all candidates and freezes before any tree audit is read.

The trees improve older development error, but those gains do not generalize
across all markets. Totals are promising as a separate future hypothesis; the
2026 failure and broad uncertainty prevent promoting even that market now.

## Matched later results

| Season | Market    | Outcomes | Tree Brier |   v6 Brier | Book Brier |
| ------ | --------- | -------: | ---------: | ---------: | ---------: |
| 2022   | moneyline |      269 | 0.21136436 | 0.21048747 | 0.21082110 |
| 2022   | spread    |      261 | 0.24845361 | 0.24821012 | 0.24853205 |
| 2022   | total     |      268 | 0.24858508 | 0.24872490 | 0.25021228 |
| 2023   | moneyline |      272 | 0.21970068 | 0.21886390 | 0.21870951 |
| 2023   | spread    |      258 | 0.25062130 | 0.25075924 | 0.25000046 |
| 2023   | total     |      270 | 0.24902448 | 0.24819909 | 0.25006923 |
| 2024   | moneyline |      272 | 0.20072817 | 0.19948545 | 0.20016162 |
| 2024   | spread    |      268 | 0.25232784 | 0.25079516 | 0.25107184 |
| 2024   | total     |      269 | 0.24884642 | 0.25163448 | 0.24977945 |
| 2025   | moneyline |      271 | 0.21390815 | 0.21221298 | 0.21213897 |
| 2025   | spread    |      271 | 0.25093359 | 0.25002529 | 0.24958671 |
| 2025   | total     |      272 | 0.24999057 | 0.25055727 | 0.25040564 |

## First previously recorded prospective v6 result

The immutable forecast saved October 12 at 2:37 p.m. New York preceded kickoff.
The verified [ESPN final](https://www.espn.com/nfl/game/_/gameId/401872994) is Buffalo
37, Los Angeles Rams 34. With the recorded prices/lines, v6 Brier is 0.37110878
versus book 0.37116879 on moneyline; 0.23134566 versus 0.23293739 on spread;
0.23970217 versus 0.23293739 on total. It slightly wins two markets and loses totals.
These are three correlated outcomes from **one independent game cluster**, not
three independent accuracy trials. This is a v6 forecast; no v7 forecast was issued
before this game, and a v7 backcast is not labeled prospective.

The sidecar `docs/research/2026-10-13-v6-forward-result.json` retains final source,
observation time, issuance and original-record hash. Earlier prediction records
remain untouched, including their original pending-at-capture field. The result
was excluded from v7 development and its fixed current-season replay. No wager
or saved owner Advice entry was created.

## Reproduction and verification

Use Node 22. The existing public context snapshot's SHA-256 is
`4cf98d965842625c7242cac204808b5bd8d818eac808b52a4b6768a718721de5`.
Raw public context remains outside the repository; all numeric artifacts are saved.

```sh
npm run betting:loss-diagnose -- --contexts <recent-games.json> --frozen-v6 docs/research/model-v6-rich-development.json
npm --silent run betting:boosted-develop -- --contexts <recent-games.json> > development.json
npm run betting:boosted-audit -- --contexts <recent-games.json> --frozen development.json --v6 docs/research/model-v6-rich-development.json
```

Evidence: `model-v7-loss-diagnostics.json`, `model-v7-boosted-development.json`,
`model-v7-boosted-frozen.json`, and `model-v7-boosted-audit.json` under
`docs/research`. The audit checks context/development hashes, parameters and frozen specification identities,
validates the fixed v6 reference and reproduces its prior aggregate errors.
Code hashes bind the recorded implementation. No HTTP tuning/import option or
new ledger method is added.

**799 workspace tests** plus root/service suites pass, including new nonlinear
learning, thin/balanced-book fallback, numeric bounds and deterministic target/
same-week/future exclusion for direct and adaptive rules. Types, production build,
lint, formatting and whitespace checks pass. The existing dashboard chunk warning
remains. No new browser journeys are needed for this isolated research module;
existing dashboard rendering tests pass in the workspace suite.

Manual code/security review covered validated bounded snapshots, train-only
thresholds, date/week joins, numeric/row/dimension bounds, capped tree depth and
correction, bounded fit/prediction caches, earlier-only blend labels, frozen
reference validation, push exclusions, matched prices, forecast immutability and
unchanged production dispatch. No automated security scan was run. No credentials,
AI, service, release, owner setting or wager changed.
