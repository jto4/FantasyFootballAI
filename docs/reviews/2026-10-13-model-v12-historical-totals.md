# Expanded prediction-market history and totals replay — October 13, 2026

Expanded real historical inputs and tested a new totals adapter across 2023–2026.
The candidate improves on the previous external-signal algorithm on the combined
audit, but still loses to the sportsbook and production totals on that audit.
The reused 2026 point estimate improves; late 2025 still loses. **No consistent
edge is established and no production model change is recommended.** Moneyline
and spreads are numerically unchanged across every evaluated case.

## Historical acquisition and availability

The final normalized snapshot has **509 exact-line, full-game tapes** and
**135,310 pre-cutoff executions**, versus v11's 113 tapes and 62,463 executions.
Earlier-season collection adds up to seven days of executions, including 9,990
executions preceding the original 24-hour window. All 509 bounded trade walks
completed. Empty/incomplete histories are unavailable evidence, never inferred
zero activity. The original 113 v11 2026 tapes are reused unchanged.

| Season          | Kalshi tapes | Polymarket tapes | Executions | Distinct wallet hashes |
| --------------- | -----------: | ---------------: | ---------: | ---------------------: |
| 2023            |            0 |                0 |          0 |                      0 |
| 2024            |            0 |               16 |         69 |                     55 |
| 2025            |          156 |              224 |     72,778 |                  3,074 |
| 2026, weeks 1–5 |           57 |               56 |     62,463 |                    801 |

Wallet counts are separate within-season counts, not a count of proven skilled
traders; the same wallet can recur across seasons. Kalshi's public executions
do not identify wallets. No usable 2023 contracts were found in the checked
feeds/catalog. Some provider/game combinations have integer sportsbook lines,
different thresholds, missing contracts, or unverified rule/title variants.
They are retained as missing coverage, not silently replaced by nearby lines.

Kalshi moves older settled markets, trades and candlesticks to
[historical endpoints](https://docs.kalshi.com/getting_started/historical_data).
The separate historical adapter supports the archive and its older decimal
dollar fields; ambiguous cents are rejected. Polymarket discovery accepts
verified reversed team order and historical team aliases. Legacy full-game
threshold questions map integer score thresholds to the corresponding half-point
line only after matching kickoff, both teams, rule and outcome orientation.
Player props, halves, quarters and moneyline contracts cannot substitute.

The NFL-tag catalog has 1,188 fetched event rows, of which 797 retained NFL-slug
events include 362 events containing totals. This is coverage of the checked
public feed, not an exhaustive claim about every historical NFL contract.
Polymarket v2 returned empty prices for older eligible games; its documented
[legacy CLOB price history](https://github.com/Polymarket/agent-skills/blob/main/market-data.md#price-history)
recovered minute samples. Each sample waits a full minute before use and must
finish before cutoff; terminal 0/1 prices and duplicate/malformed samples are
excluded or rejected. Whole v2 buckets must finish before cutoff, and its
ambiguous zero-width settlement points remain excluded. Complete trade tapes
can also supply actual timestamped transaction prices, never final payouts.

The source-coverage QA found four additional Week 4 2024 contracts with a
team-code prefix in their literal threshold question. A separate catalog
normalizer verifies both prefix team names in the rule and removes only that
prefix; original questions remain in saved evidence. ARCH titles remain
unavailable. The first replay and its exact settings are retained compressed.
The final input revision **keeps the selected family, anchor, penalty and all
model math unchanged**; it is not a new selection on later scores.

## Model and evaluation design

Twelve development candidates combine price, price/flow, or price/flow/earlier
large-trade signals; sportsbook or production offsets; and ridge penalties
100/400. The selected enabled candidate uses the sportsbook offset, all signal
families, and penalty 400. Features include fresh exact-line price disagreement,
six-hour movement, capped recent signed execution flow, prior-window size
thresholds, relative volume, earlier large execution flow, coverage gates, and
past-only shrunken wallet weights. These are executed-flow proxies, not observed
inventory or verified informed trades. Share weights are capped at 5,000.

Each weekly fit uses completed earlier weeks in the current season and the two
preceding seasons. Wallet evaluation uses only that wallet's earlier relevant game
directions versus the paired sportsbook probability, at least ten earlier games,
and a thirty-game shrinkage prior. No current leaderboard, current holdings,
future outcome or post-cutoff execution enters a historical predictor. Corrections
require twenty earlier supported games and are capped at 0.15 logit. Unsupported
or cold cases return the selected offset exactly.

Development covers 2024 and 2025 weeks 1–8. The frozen audit covers 2025 weeks
9–18 and 2026 weeks 1–5. All these seasons have previously been examined in this
project: freezing this selection before its audit does **not** make them untouched
evidence. The first development candidate-selection result and the later
coverage-only revision are both preserved. The sportsbook-only control already
beats the best enabled candidate in development (0.24999099 versus 0.25010209
on the final revised inputs); the experimental selection is not a promotion gate.

All methods share the same un-enriched v11 nflverse context and matched paired
sportsbook lines/odds. Production totals consequently use their existing fallback;
this does not recreate earlier enriched v4 audits. Pushes and incomplete outcomes
are excluded. Historical sportsbook observation timestamps are unavailable, so
this is probability accuracy at matched lines, not an executable trading or ROI
backtest. All price/trade cutoffs are kickoff minus thirty minutes.

## Results

Lower Brier is better. There are 890 eligible totals across the four seasons.

| Sample                                | Totals | Sportsbook | New candidate | Previous external algorithm | Result vs book      |
| ------------------------------------- | -----: | ---------: | ------------: | --------------------------: | ------------------- |
| 2023 coverage control                 |    270 | 0.25006923 |    0.25006923 |                  0.24823442 | Exact fallback tie  |
| 2024 development                      |    269 | 0.24977945 |    0.24977945 |                  0.25114012 | Cold-start tie      |
| 2025 full season, development + audit |    272 | 0.25040564 |    0.25094002 |                  0.25141959 | Loses               |
| 2026 weeks 1–5, reused audit          |     79 | 0.25026877 |    0.24989373 |                  0.25011560 | Point estimate wins |
| Late 2025 + 2026 frozen audit         |    230 | 0.25032936 |    0.25064412 |                  0.25084031 | Loses               |

The previous external algorithm is v11 combined **refit on the same expanded
inputs**, not the original v11 score on its smaller history. Its production
offset remains the original formula. Production totals score 0.25026161 on the
combined audit, also better than the new candidate. Moneyline and spread outputs
have maximum absolute difference **0** across 893 moneyline and 870 spread cases.

Late 2025 alone has 151 totals: new 0.25103671 versus sportsbook 0.25036106.
The combined audit's week-clustered 95% interval for book improvement is
**[-0.00160394, 0.00097442]**. The 2026 nominal win has only five week clusters;
its interval includes zero. Repeated project research and candidate selection
further limit any significance claim. Exact fallback ties do not establish wins.

Fresh prices support 14/269 eligible 2024 totals, 245/272 in 2025 and 74/79 in 2026. The 2024 evidence never reaches the twenty-game correction gate. Across
the combined audit, 211 games have supported prices, 157 have eligible recent
flow, only six have eligible earlier large-flow features, and twenty have a
nonzero wallet-weighted feature. More wallet identities do not automatically
produce enough independent earlier resolved games to estimate skill.

Development favors a more conservative book offset and stronger shrinkage, with
more training history. The season-specific reversal and limited earlier whale
coverage mean the added signals still do not justify dependable departures from
the book. This result does not isolate a causal contribution from whales;
price/flow/positions are development ablations, not separately selected audit
winners. No historical social sentiment is fabricated or added here.

## Reproducibility and verification

- [Final frozen settings](../research/2026-10-13-v12-r2-frozen-settings.json),
  [audit and per-game rows](../research/2026-10-13-v12-r2-audit.json), and
  [source provenance/coverage](../research/model-v12-r2-source-manifest.json).
  [Verification record](../research/model-v12-verification.json) records final
  checks, exact offline replay and preserved forecast hashes.
- [Final normalized tapes](../research/model-v12-external-signals-r2.json.gz),
  [original catalog](../research/model-v12-polymarket-catalog.json.gz), and
  [shared contexts](../research/model-v11-contexts.json.gz). The manifest records
  plaintext/compressed hashes, every response URL, capture time, status, size and
  SHA. Raw responses remain outside the repository. Normalized wallet identifiers
  are hashed, with no profile names, bios or current balances.
- [Initial frozen settings](../research/2026-10-13-v12-frozen-settings.json.gz)
  and [initial audit](../research/2026-10-13-v12-audit.json.gz) preserve exact bytes
  from before the four-contract coverage correction. Initial tapes remain in
  `model-v12-external-signals.json.gz` with their original manifest.

With supported Node 22, decompress contexts and final tapes into a fresh local
directory, then run:

```sh
node scripts/research/audit-expanded-totals.mjs /path/to/games.json /path/to/signals.json docs/research/2026-10-13-v12-r2-frozen-settings.json
```

The audit checks plaintext data hashes, model parameters, frozen source hashes,
source limits and exact tape identities before scoring. Acquisition scripts
collect/retry/merge separately; replay needs no network. No production dispatch,
service setting, credential, wager, AI invocation or owner Advice record changes.
Earlier v6/v11 sealed forecast hashes and the v11 frozen source hashes were
verified unchanged. Existing Week 6 forecasts are not rewritten with these
retrospectively improved predictions.

Verification passes 827 workspace tests plus the root suites, typecheck, lint,
format checks and build. The existing 536.29 kB dashboard chunk warning remains.
Focused tests cover archived routes and seven-day bounds, older price units,
reversed game identities, legacy outcome orientation, title normalization,
full-minute price timing, malformed/terminal/duplicate points, early-history
boundaries, incomplete windows, exact fallback, future labels/features/wallets,
and stale-season exclusion. The scoped ordinary manual review checked fixed
public origins, response/time/page limits, outcome and price orientation, complete
history gates, as-of fitting, identity/line joins, wallet privacy, unchanged live
dispatch and immutable forecasts. No automated security
scan was run, consistent with the owner's instruction.
