# Canonical trade direction and robust totals flow — October 13, 2026

Found and corrected a substantive Kalshi direction-normalization bug in the
earlier research adapter, then tested better signed-flow measurements against
the matched sportsbook. The source correction improves the old flow model but
still loses late 2025. The revised flow model nearly returns the book: it has a
tiny late-2025 loss and tiny 2026/combined point wins, with uncertainty including
zero improvement. **No consistent sportsbook edge is established.** Moneyline,
spreads, production dispatch and issued numerical records remain unchanged.

## What was wrong with the remaining signed signals

The frozen v11 parser interpreted Kalshi's `taker_outcome_side` and
`taker_book_side` as an outcome plus a separate BUY/SELL action. They actually
encode the **same exposure bit**: yes/bid is exposure toward the contract's Yes
outcome, and no/ask toward No. For verified game-total contracts, Yes is Over.
This is confirmed by Kalshi's primary
[direction documentation](https://docs.kalshi.com/getting_started/order_direction)
and the published OpenAPI schema. The earlier parser combined these equivalent
fields and mapped **every included Kalshi trade to Under**. Its old regression
fixture used a contradictory no/bid pair, so passing that test did not establish
correct real-source interpretation. The new regression tests reject that pair.

This defect affected the signed inputs in v11–v14 research, including their
headline/price/flow mixture forecasts when Kalshi flow was used. Those numerical
records are preserved as issued; their point results are not evidence of
correctly oriented Kalshi flow. Price-only controls do not use the defective
direction field. The adapter has no production-dispatch path, and live totals
remain their existing v3/v4 calculation.

All **117,536 included Kalshi executions** were joined to the original captured
raw response by contract, trade ID, execution timestamp, size and price. Each
response's recorded SHA was verified. **70,673** yes/bid executions change from
Under to Over; 46,863 no/ask executions remain Under. Both fields agree in every
joined response. No outcomes, price-trend heuristics or current leaderboards are
used to infer direction. All 264 source trade-response entries were available;
no replacement historical trade query was needed.

The corrected 2025 Kalshi data has 36,144 Over and 23,034 Under executions; 2026
has 34,529 Over and 23,829 Under. No included trade is marked off-book/block.
Polymarket's separate token/outcome and BUY/SELL mapping remains unchanged, as
do every game, paired sportsbook quote/line, price observation and trade quantity.
The corrected snapshot is versioned separately with an auditable evidence patch.

The earlier v14 model's late-2025 excess Brier loss is 0.00005629, of which
0.00005593 is the wrong-way alignment term and only 0.00000036 the squared
correction term. Its fixed-fit/fixed-feedback diagnostic improves from
0.25041735 to 0.25036569 when Kalshi flow is removed, versus book 0.25036106.
Removing only Polymarket flow gives 0.25041265. These are associations, not causal
proof or separately selected refits.

The old Kalshi recent-flow feature is saturated near absolute imbalance one in
55 late-2025 games; after correcting direction, only one is saturated. The
apparently directional value often behaved like an availability/intensity proxy.
Polymarket still has thirteen saturated late-2025 cases. Nine Polymarket windows
have at least five fills but fewer than five distinct recent minutes, illustrating
that fill count does not guarantee diverse activity. Some observed windows are
dominated by a single fill, including windows already excluded by old low-count
gates. Fragmented fills and repeated actors can distort uncapped window-level
ratios even when direction is correct. Buying pressure is also not evidence that
the underlying football total is underpriced.

## Signal changes, frozen before audit

The new feature builder keeps the existing price/book and six-hour movement
features, removes coverage/unsigned-volume predictors, and replaces the old four
flow columns per provider:

| New flow measurement                           | Reason                                                                                                                                                                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recent pressure minus its own earlier baseline | Persistent one-sided demand should not masquerade as fresh information. Recent window is one hour; baseline is the preceding three hours.                                                                              |
| Price-confirmed recent-pressure change         | Require matching contemporaneous price movement of at least 0.005 probability, scaled conservatively to a 0.02 move.                                                                                                   |
| Change in large-bucket pressure                | Classify size after aggregation, with a $500 exposure-notional floor and the earlier-window 95th percentile. This is not proof of whale skill or actual cash paid.                                                     |
| Equal-wallet pressure change                   | Give identified wallets equal influence after minute aggregation, require at least three wallets in both windows and shrink sparse wallet coverage. No historical skill winners or current holdings enter this signal. |

Fills are aggregated by wallet/minute where identities exist, and by anonymous
minute otherwise. Aggregation occurs **before** a 500-share bucket cap and before
large-bucket classification. Splitting a same-time fill into smaller rows cannot
gain influence. Kalshi's anonymous minutes are temporal buckets, not inferred
independent traders. The main window requires at least five recent and ten
baseline distinct minutes, a completed tape, and the original exact game/line
and pre-cutoff timestamp gates. Missing/incomplete evidence remains unavailable.
Marked off-book executions are excluded from pressure; none was present here.

The primary policy uses centered pressure plus a price-confirmed channel. A
stricter fixed control allows only price-confirmed flow channels and avoids
duplicating the same channel. Both retain the same frozen four-week decay,
season reset, ridge 400, twenty-game training/feedback gates, 0.01 feedback ridge
and 0.15-logit cap. The old seven-day directional/skill features are replaced by
the recent baseline measurements; earlier data still supports provenance, not a
new claim of observed wallet inventory.

Three variants are frozen before scoring: **direction fix only**, **robust
pressure innovation** (primary), and **price-confirmed robust flow**. No new
hyperparameter grid or audit-based winner selection is used. Every variant
refits coefficients and honest earlier prequential feedback from its own
retained features. The source-fix-only control isolates the parser correction
from the new pressure measurements.

All later periods have already been examined in this project, and diagnosis
informs the design. This is a reused research retest, **not untouched validation**.
Weekly fits/feedback use earlier completed weeks, never current/later labels.

## Matched sportsbook results

Same 890 eligible totals across 2023–2026, with 151 late-2025 totals and 79 in
2026 weeks 1–5. Pushes/incomplete outcomes are excluded. Source repair retains
509 tapes and 135,310 total executions. Lower Brier is better.

| Variant                               |  Late 2025 | 2026 weeks 1–5 | Combined audit |
| ------------------------------------- | ---------: | -------------: | -------------: |
| Sportsbook                            | 0.25036106 |     0.25026877 |     0.25032936 |
| Previous v14, defective Kalshi inputs | 0.25041735 |     0.25026888 |     0.25036635 |
| Direction fix only                    | 0.25038106 |     0.25025134 |     0.25033651 |
| Robust pressure innovation            | 0.25036107 |     0.25026864 |     0.25032932 |
| Price-confirmed robust flow           | 0.25036106 |     0.25026877 |     0.25032936 |

The direction fix alone lowers late-2025 excess loss from 0.00005629 to
0.00002000, but still loses the book. It has 63 active late-2025 cases and only
fourteen active 2026 cases, all in Week 5. Its combined nominal 95%
week-clustered book-improvement interval is [-0.00004102, 0.00002673].

The primary robust model's actual late-2025 excess loss is **0.00000001259**;
2026 improves by **0.00000013460** and combined audit by **0.00000003797**.
These changes are too small to establish meaningful value. There are 72
nonzero late-2025 changes, but only three exceed 0.000001 probability; the largest
is 0.000001416. In 2026 fourteen cases change, seven exceed 0.000001, and the
largest change is 0.000007963. Combined, 86/230 games have nonzero corrections
and 144 return book exactly. The stronger pressure representation and feedback
mostly abstain, rather than demonstrating a better conditional predictor.

Among its active late-2025 cases, Brier is 0.25023668 versus paired book
0.25023666. Its primary combined book-improvement interval is
**[-0.00000005528, 0.00000013121]**, still including zero. The ungated combined
candidate scores 0.25032489, but that diagnostic was not selected after seeing
audit outcomes; its interval also includes zero. Production totals score
0.25026161 on the combined audit, better than any of the gated variants.

The confirmed control differs from book by less than 0.000001 on every audit
case. Its combined Brier is 0.25032935969388737 versus book
0.25032935934839357, a microscopic loss hidden by table rounding. Nominal wins
or ties at this scale are not sportsbook edge or executable profit.

The robust representations support distinct-minute flow on 85 late-2025 games
and 62 in 2026; matching price confirmation appears on 34 and ten respectively.
These are quality/availability counts, not proof of information or trader skill.
2023 remains uncovered and 2024 cold-start book ties. Nominal intervals do not
adjust for the project's many repeated experiments. Historical sportsbook
capture timestamps remain unavailable, so no executable ROI backtest is claimed.

Moneyline and spreads remain exact production matches across 893 and 870 cases
respectively for all three variants. No production candidate is promoted, and
existing Week 6 predictions are not rewritten with repaired inputs. Their
future scoring must remain based on the original issued numerical records,
with the defect disclosed when interpreting that experiment.

## Evidence and reproduction

- [Loss/source diagnosis](../research/2026-10-13-v15-loss-diagnosis.json) contains
  exact v14 reproduction, feature block diagnostics and corrected distributions.
- [Correction provenance](../research/model-v15-source-manifest.json),
  [canonical evidence patch](../research/model-v15-direction-evidence.json.gz)
  and [corrected normalized inputs](../research/model-v15-corrected-signals.json.gz)
  retain source hashes and a join for every repaired execution. Raw response
  files remain outside the repository; replay no longer needs them.
- [Frozen settings](../research/2026-10-13-v15-frozen-settings.json) seal all three
  policies, parameters, parent artifacts, diagnosis and source/data hashes.
- [Audit](../research/2026-10-13-v15-audit.json) contains each policy's paired rows,
  raw forecasts, feedback weights, minute/price-confirmation diagnostics,
  active/material/fallback counts, phases/weeks and non-total comparisons.

With supported Node 22, decompress the original
[v12 r2 tapes](../research/model-v12-external-signals-r2.json.gz), shared
[v11 contexts](../research/model-v11-contexts.json.gz), corrected inputs and
direction evidence into a fresh directory, then run:

```sh
node scripts/replay-direction-correction.mjs /path/to/original-signals.json /path/to/direction-evidence.json /path/to/rebuilt-signals.json
node scripts/audit-robust-total-flow.mjs /path/to/games.json /path/to/original-signals.json /path/to/corrected-signals.json /path/to/direction-evidence.json docs/research/2026-10-13-v15-frozen-settings.json
```

The audit verifies data/patch/source/parent hashes and that the repair leaves
Polymarket records and all other source fields unchanged. The separate correction
CLI can rebuild from verified original raw responses; the canonical parser is
versioned in integrations and does not mutate the frozen legacy parser. Robust
flow rejects an unmarked old Kalshi tape instead of silently accepting its
defective directions.

Regression tests cover both canonical exposure pairs, rejection of contradictory
fields and the old bad fixture, time/price/size preservation, split-fill
invariance, persistent pressure centering, distinct-minute and completion gates,
off-book exclusion, price agreement, exact joins, duplicate history and absence
of unsigned predictive columns. Existing tests cover prior-only calibration/
feedback and exact non-total dispatch. Scoped ordinary manual review checks these
invariants, bounded source/patch reads and unchanged live behavior. No automated
security scan, credential/configuration change, wager, AI call, owner Advice
journal write or new market-data acquisition is performed.

842 workspace tests plus root suites, final typecheck/lint/format and build pass.
The existing 536.29 kB dashboard chunk warning remains. Fresh decompression of
the durable inputs plus the evidence patch rebuilds the corrected snapshot
byte-for-byte without temporary raw responses. All three policy audits reproduce
every probability, summary and row; only the scoring timestamp differs. Parent
source/settings/audit and v6/v11 issued forecast seals were verified unchanged.
[Verification record](../research/model-v15-verification.json).
