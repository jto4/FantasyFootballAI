# Totals-tree hybrid and seasonal adaptation — October 13, 2026

## Result

The requested hybrid improves aggregate historical accuracy and avoids the
moneyline/spread regressions of the all-tree experiment. It does not establish a
consistent sportsbook advantage. The strongest older-data choice is the plain
hybrid, with seasonal recalibration disabled. New adaptation mechanisms are
implemented, tested and retained for research, but their numerical effect is not
promoted. Live production remains v3 moneyline/spread and supported v4 totals.

| 3,221 matched non-push 2022–2025 outcomes          | Brier (lower is better) |   Log loss |
| -------------------------------------------------- | ----------------------: | ---------: |
| Plain hybrid: totals trees, existing other markets |              0.23638752 | 0.66395576 |
| Hybrid with best older-data seasonal correction    |              0.23640241 | 0.66398667 |
| Earlier v6 experiment                              |              0.23653643 | 0.66422845 |
| Existing production                                |              0.23658686 | 0.66435334 |
| Paired no-vig sportsbook                           |              0.23666635 | 0.66450478 |

Both hybrid procedures beat the book in seven of twelve season/market cells,
including all four totals seasons. The plain hybrid's pooled book-minus-model
Brier improvement is 0.00027882, with a weekly-cluster nominal 95% interval
**[-0.00033696, +0.00089461]**. Its interval against production also includes zero.
No simultaneous season/market interval establishes superiority. These later
seasons were repeatedly examined in prior work and motivated this user-requested
hypothesis; they remain reused retrospective evidence, not a fresh holdout.

Totals alone have 1,079 matched archive outcomes: plain hybrid Brier 0.24911449,
best seasonal correction 0.24915892, production 0.24970954 and book 0.25011732.
The totals-only book-improvement interval also includes zero. Exact historical
moneyline/spread probabilities match production for every case; the maximum
absolute difference is **zero**.

The unchanged October 12 current-season snapshot has 224 market outcomes from 77
completed games. Plain hybrid pooled Brier is **0.24193243**, adapted hybrid
**0.24200568**, production **0.24102046**, book **0.24112677**. Totals are responsible
for the hybrid regression: plain 0.25280588 and adapted 0.25301895 versus book
0.25004633. Only spread beats the book on this fixed sample. No current-season
interval supports a reliable advantage. Neither seasonal correction nor hybrid
is deployed on the strength of these results, and no profitability is established.

## Hybrid and adaptation implementation

The structure follows the request: keep `market-context-v3` probabilities for
moneyline and spread exactly; use the previously frozen depth-two, 730-day,
market-feature totals tree. This is a **research dispatch**, not a new HTTP option
or ledger method. The former all-tree model's moneyline/spread are not used.

The new seasonal layer recalibrates the total tree's logit using **earlier
out-of-week forecasts and outcomes**, rather than in-sample fitted probabilities.
It fits a ridge-shrunk intercept each prediction origin, limits that shift to
0.35 logit and emphasizes recent NFL weeks. The grid tests four/eight-week
half-lives, ridge 25/100, no previous-season carry versus carry weight 0.25,
and direct versus adaptive-book rules. Prior-season age respects the regular
season length and explicit carry rather than silently treating a long offseason
as recent games. A zero-carry specification resets calibration at a new season.

The optional adaptive-book rule learns a convex probability weight from prior
**calibrated out-of-week** predictions and their outcomes, using the same weekly
weights and a unit ridge. When the season resets with no usable carry, it returns
the book until earlier current-season evidence supports a correction. Every
calibration and blending operation excludes the entire target NFL week and later
dates. Exact book matches are counted as ties, not wins.

Inputs and settings are cloned to isolate callers, duplicate forecast identities
and non-finite/invalid probabilities are rejected, row counts and caches are
bounded, and the totals tree settings are frozen. The mechanism reduces a stale
Under lean in a synthetic changed-season regression test, but that behavioral
capability is not evidence of improved real-data accuracy.

Temporal-shift research supports evaluating methods with past-only changing
windows; see [Han, Huang and Wang](https://proceedings.mlr.press/v235/han24b.html).
This implementation uses fixed weekly decay and calibration; it does not implement
that paper's adaptive-window tournament or claim its guarantees.

## Older selection and frozen test

The plain hybrid plus sixteen adaptations were compared on 2018–2021 only.
Later rows were removed **before** preparing the model. The structure is fixed
by the request and the preceding totals experiment; only the adaptation settings
are selected here. Selection minimizes older totals Brier, since other markets
are identical across candidates.

- Plain hybrid development totals Brier: **0.24875265**.
- Best enabled adaptation: **0.24889524**, with four-week half-life, ridge 100,
  prior-season carry 0.25 and direct output.
- Production/book development totals: 0.24967576 / 0.24993866.

Selection froze at **04:55:26 UTC (12:55 a.m. New York)**. Since every adaptation
worsened older error, the frozen selected procedure is the plain hybrid. The
best enabled adaptation was separately frozen before the later audit, allowing
the requested adaptation test without choosing a later-data winner. Its later
archive and current-season errors also worsen relative to the plain hybrid.

An initial older-data preparation was rebuilt after tightening duplicate/settings
isolation and prior-season week-age handling. No later audit was read during that
repair. No later season, phase, line threshold or return objective selects a rule.
The statistical differences remain small and uncertain; further parameters must
be labeled a new hypothesis rather than substituted into this frozen test.

## Matched season/market results

| Season | Market    | Outcomes | Plain hybrid | Seasonal hybrid |       Book |
| ------ | --------- | -------: | -----------: | --------------: | ---------: |
| 2022   | moneyline |      269 |   0.21083149 |      0.21083149 | 0.21082110 |
| 2022   | spread    |      261 |   0.24819035 |      0.24819035 | 0.24853205 |
| 2022   | total     |      268 |   0.24858508 |      0.24833980 | 0.25021228 |
| 2023   | moneyline |      272 |   0.21871340 |      0.21871340 | 0.21870951 |
| 2023   | spread    |      258 |   0.25073072 |      0.25073072 | 0.25000046 |
| 2023   | total     |      270 |   0.24902448 |      0.24927024 | 0.25006923 |
| 2024   | moneyline |      272 |   0.20009656 |      0.20009656 | 0.20016162 |
| 2024   | spread    |      268 |   0.25092004 |      0.25092004 | 0.25107184 |
| 2024   | total     |      269 |   0.24884642 |      0.24881263 | 0.24977945 |
| 2025   | moneyline |      271 |   0.21221430 |      0.21221430 | 0.21213897 |
| 2025   | spread    |      271 |   0.25002529 |      0.25002529 | 0.24958671 |
| 2025   | total     |      272 |   0.24999057 |      0.25019795 | 0.25040564 |

The hybrid fixes the all-tree model's avoidable moneyline/spread regressions while
preserving their existing limitations. Its remaining five losing archive cells
are inherited moneyline/spread errors. A global seasonal intercept does not
necessarily fix the tree's game-by-game ranking errors, and reacting to sparse
recent outcomes can add noise. This is an interpretation of the observed
recalibration failure, not an established causal explanation. The prior
[loss diagnosis](2026-10-13-model-v7-comparison.md) remains relevant.

## Reproduction and verification

Use Node 22 and the same public context snapshot, SHA-256
`4cf98d965842625c7242cac204808b5bd8d818eac808b52a4b6768a718721de5`.

```sh
npm --silent run betting:hybrid-develop -- --contexts <recent-games.json> > development.json
npm run betting:hybrid-audit -- --contexts <recent-games.json> --frozen development.json
```

`docs/research/model-v8-hybrid-{development,frozen,audit}.json` saves every older
candidate, selected/best-adaptation identities, context/development/code hashes,
paired metrics, intervals, source-era sample and production invariance. Raw public
context remains outside the repository. The audit checks frozen input/development
hashes, parameters and recognized specifications before scoring. The preceding
v7 total probabilities and production reference reproduce within 1e-12.

**802 workspace tests** plus all root/service suites pass. New tests cover stale
bias response, season reset, exact weekly decay, target/same-week/future exclusion,
bounded/duplicate inputs, caller isolation and unchanged moneyline/spread dispatch.
Types, production build, lint, formatting and whitespace checks pass. The existing
large dashboard chunk warning remains. There is no new frontend or live routing;
dashboard rendering tests pass in the normal workspace suite.

Scoped manual code/security review covered bounded snapshots/rows, strict prior
week/date filters at every layer, earlier calibrated labels for blending, numeric
bounds, settings/data cloning, fixed tree identity, bounded caches, frozen audit
validation, matched paired prices, push handling and untouched production dispatch.
No automated security scan ran. No owner credentials, AI, settings, service,
release, wager, prior prediction or recorded final outcome was changed. The already
scored Bills–Rams forward result remains a separate v6 observation and is excluded
from this frozen replay; there is no prospective v8 forecast in this comparison.
